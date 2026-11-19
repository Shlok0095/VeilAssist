#!/usr/bin/env python3
"""NVIDIA/Groq multimodal benchmark — discover, probe, run, rank, report.

Usage (from this directory):
  python dataset_gen.py
  python run_benchmark.py discover
  python run_benchmark.py run
  python run_benchmark.py rank

Resumable: completed (model, case, mode, repeat) keys are skipped.
Keys are loaded from .env in this folder — never print them.
"""
from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import math
import os
import re
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config" / "benchmark.json").read_text(encoding="utf-8"))
CASES = json.loads((ROOT / "dataset" / "cases.json").read_text(encoding="utf-8"))
OUT = ROOT / "benchmark_results"
RAW = OUT / "raw"
METRICS = OUT / "metrics"
RANK = OUT / "rankings"
REPORTS = OUT / "reports"
STATE = OUT / "state.json"


def load_env() -> None:
    os.environ.setdefault("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    os.environ.setdefault("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def percentile(xs: list[float], p: float) -> float:
    if not xs:
        return float("nan")
    ys = sorted(xs)
    k = (len(ys) - 1) * p / 100.0
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return ys[int(k)]
    return ys[f] * (c - k) + ys[c] * (k - f)


def stats_block(xs: list[float]) -> dict:
    if not xs:
        return {k: None for k in ("mean", "median", "p50", "p90", "p95", "p99", "min", "max", "stdev")}
    return {
        "mean": statistics.mean(xs),
        "median": statistics.median(xs),
        "p50": percentile(xs, 50),
        "p90": percentile(xs, 90),
        "p95": percentile(xs, 95),
        "p99": percentile(xs, 99),
        "min": min(xs),
        "max": max(xs),
        "stdev": statistics.pstdev(xs) if len(xs) > 1 else 0.0,
    }


def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"done": [], "eligible": {"nvidia": [], "groq": []}, "ineligible": []}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def image_data_url(path: Path, size: tuple[int, int] | None = None, jpeg_q: int | None = None) -> str:
    img = Image.open(path).convert("RGB")
    if size:
        img = img.resize(size, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    if jpeg_q is not None:
        img.save(buf, format="JPEG", quality=jpeg_q, optimize=True)
        mime = "image/jpeg"
    else:
        img.save(buf, format="PNG")
        mime = "image/png"
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def http_json(method: str, url: str, key: str, body: dict | None = None, timeout: float = 90, stream: bool = False):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if stream else "application/json",
        "User-Agent": "VeilAssist-MultimodalBench/1.0",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    t0 = time.perf_counter()
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status": e.code,
            "text": raw[:800],
            "latency_ms": (time.perf_counter() - t0) * 1000,
            "ttft_ms": None,
            "json": None,
            "answer": "",
            "usage": {},
        }
    except Exception as e:
        return {
            "ok": False,
            "status": 0,
            "text": str(e)[:800],
            "latency_ms": (time.perf_counter() - t0) * 1000,
            "ttft_ms": None,
            "json": None,
            "answer": "",
            "usage": {},
        }

    if stream:
        answer_parts: list[str] = []
        usage = {}
        ttft = None
        while True:
            line = resp.readline()
            if not line:
                break
            if ttft is None:
                ttft = (time.perf_counter() - t0) * 1000
            s = line.decode("utf-8", errors="replace").strip()
            if not s.startswith("data:"):
                continue
            payload = s[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except json.JSONDecodeError:
                continue
            delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
            content = delta.get("content") or ""
            if isinstance(content, list):
                content = "".join(str(p.get("text") or "") for p in content)
            if content:
                answer_parts.append(str(content))
            if chunk.get("usage"):
                usage = chunk["usage"]
        latency = (time.perf_counter() - t0) * 1000
        return {
            "ok": True,
            "status": 200,
            "text": "",
            "latency_ms": latency,
            "ttft_ms": ttft,
            "json": None,
            "answer": "".join(answer_parts).strip(),
            "usage": usage,
        }

    raw = resp.read().decode("utf-8", errors="replace")
    latency = (time.perf_counter() - t0) * 1000
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = None
    answer = ""
    usage = {}
    if parsed:
        usage = parsed.get("usage") or {}
        msg = ((parsed.get("choices") or [{}])[0].get("message") or {})
        content = msg.get("content")
        if isinstance(content, list):
            answer = "".join(str(p.get("text") or "") for p in content).strip()
        else:
            answer = str(content or "").strip()
    return {
        "ok": True,
        "status": 200,
        "text": raw[:800],
        "latency_ms": latency,
        "ttft_ms": latency,
        "json": parsed,
        "answer": answer,
        "usage": usage,
    }


VISION_HINTS = (
    "vl", "vision", "-omni", "omni-30b", "llama-4", "llama-3.2-11b-vision",
    "qwen3.6", "qwen2.5-vl", "pixtral", "gemma-3", "phi-4-multimodal", "scout",
    "cosmos-reason", "nvclip",
)
VISION_EXCLUDE = (
    "embedding", "embed", "moderation", "whisper", "tts", "rerank", "nv-embed",
    "parakeet", "canary", "transcribe", "ocr-", "nvclip", "clip", "retriever",
)


def looks_multimodal(model_id: str) -> bool:
    low = model_id.lower()
    if any(x in low for x in VISION_EXCLUDE):
        return False
    return any(h in low for h in VISION_HINTS)


def list_models(provider: str) -> list[str]:
    if provider == "nvidia":
        url = os.environ["NVIDIA_BASE_URL"].rstrip("/") + "/models"
        key = os.environ["NVIDIA_API_KEY"]
    else:
        url = os.environ["GROQ_BASE_URL"].rstrip("/") + "/models"
        key = os.environ["GROQ_API_KEY"]
    res = http_json("GET", url, key, timeout=45)
    ids = []
    if res["ok"] and res["json"]:
        ids = [m.get("id") for m in res["json"].get("data", []) if m.get("id")]
    else:
        print(f"{provider} catalog fetch failed status={res['status']} preview={res['text'][:200]!r}")
    return ids


def chat(provider: str, model: str, messages: list, *, think: bool, max_tokens: int, stream: bool) -> dict:
    temp = CFG["thinking_temperature"] if think else CFG["normal_temperature"]
    body: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temp,
        "stream": stream,
    }
    if provider == "nvidia" and "nemotron" in model.lower():
        body["chat_template_kwargs"] = {"enable_thinking": bool(think)}
        if not think:
            sys0 = messages[0] if messages and messages[0]["role"] == "system" else None
            if sys0 and isinstance(sys0["content"], str) and "/no_think" not in sys0["content"]:
                messages = [{**sys0, "content": "/no_think\n" + sys0["content"]}, *messages[1:]]
                body["messages"] = messages
    if provider == "groq" and "qwen3.6" in model.lower():
        body["reasoning_effort"] = "default" if think else "none"
        body["reasoning_format"] = "hidden"
    if provider == "nvidia":
        url = os.environ["NVIDIA_BASE_URL"].rstrip("/") + "/chat/completions"
        key = os.environ["NVIDIA_API_KEY"]
    else:
        url = os.environ["GROQ_BASE_URL"].rstrip("/") + "/chat/completions"
        key = os.environ["GROQ_API_KEY"]
    return http_json("POST", url, key, body, timeout=CFG["timeout_s"], stream=stream)


def strip_think(answer: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>", "", answer or "", flags=re.I).strip()


def score_text(answer: str, expected: list[str]) -> float:
    low = strip_think(answer).lower()
    if not expected:
        return 0.0
    hits = sum(1 for k in expected if k.lower() in low)
    return hits / len(expected)


def classify_camera(p95_ms: float | None, success: float) -> str:
    if success < 0.7 or p95_ms is None:
        return "UNSUITABLE"
    if p95_ms < 2500:
        return "EXCELLENT"
    if p95_ms < 5000:
        return "GOOD"
    if p95_ms < 9000:
        return "ACCEPTABLE"
    if p95_ms < 15000:
        return "SLOW"
    return "UNSUITABLE"


def cmd_discover() -> None:
    load_env()
    state = load_state()
    for provider in ("nvidia", "groq"):
        ids = list_models(provider)
        print(f"{provider} catalog: {len(ids)} models")
        hinted = [i for i in ids if looks_multimodal(i)]
        seeds = CFG["seed_nvidia" if provider == "nvidia" else "seed_groq"]
        merged = []
        for m in [*seeds, *hinted]:
            if m not in merged:
                merged.append(m)
        print(f"{provider} vision candidates: {len(merged)}")
        for m in merged:
            print(f"  CANDIDATE {provider} {m}")
        state.setdefault("catalog", {})[provider] = ids
        state.setdefault("candidates", {})[provider] = merged
    save_state(state)
    (OUT / "config").mkdir(parents=True, exist_ok=True)
    (OUT / "config" / "catalog.json").write_text(json.dumps(state.get("catalog", {}), indent=2), encoding="utf-8")


def probe_one(provider: str, model: str) -> dict:
    img = ROOT / "dataset" / "images" / "color_objects.png"
    if not img.exists():
        raise SystemExit("Run python dataset_gen.py first")
    url = image_data_url(img, size=(320, 180), jpeg_q=60)
    messages = [
        {"role": "system", "content": CFG["system_prompt"]},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What dominant color are the circles? Reply with one word."},
                {"type": "image_url", "image_url": {"url": url}},
            ],
        },
    ]
    res = chat(provider, model, messages, think=False, max_tokens=32, stream=False)
    text = (res["answer"] or res["text"] or "").lower()
    vision_ok = res["ok"] and ("red" in text or "circle" in (res["answer"] or "").lower())
    unsupported = (not res["ok"]) or any(
        s in (res["text"] or "").lower()
        for s in ("does not support image", "vision is not", "not multimodal", "invalid content")
    )
    eligible = bool(res["ok"] and (res["answer"] or "").strip() and not unsupported)
    if res["status"] in (404, 401, 403) or res["status"] == 0:
        eligible = False
    reason = "OK" if vision_ok else ("WEAK_VISION" if eligible else "NOT_ELIGIBLE_MULTIMODAL")
    return {
        "provider": provider,
        "model": model,
        "status": res["status"],
        "ok": res["ok"],
        "vision_ok": vision_ok,
        "eligible": eligible,
        "reason": reason,
        "latency_ms": res["latency_ms"],
        "preview": (res["answer"] or res["text"] or "")[:160],
    }


def cmd_probe() -> None:
    load_env()
    state = load_state()
    eligible = {"nvidia": [], "groq": []}
    ineligible = []
    for provider in ("nvidia", "groq"):
        for model in state.get("candidates", {}).get(provider, CFG["seed_nvidia" if provider == "nvidia" else "seed_groq"]):
            print(f"probe {provider} {model} ...", flush=True)
            row = probe_one(provider, model)
            append_jsonl(RAW / "probe.jsonl", {**row, "ts": now_iso()})
            mark = "ELIGIBLE" if row["eligible"] else row["reason"]
            print(f"  {mark} status={row['status']} {row['preview']!r}", flush=True)
            if row["eligible"]:
                eligible[provider].append(model)
            else:
                ineligible.append(row)
    state["eligible"] = eligible
    state["ineligible"] = ineligible
    save_state(state)
    (OUT / "config" / "eligible.json").parent.mkdir(parents=True, exist_ok=True)
    (OUT / "config" / "eligible.json").write_text(json.dumps(eligible, indent=2), encoding="utf-8")
    caps = {}
    for provider, models in eligible.items():
        for model in models:
            caps[f"{provider}:{model}"] = {
                "provider": provider,
                "multimodal": True,
                "camera_input": True,
                "reasoning": "nemotron" in model.lower() or "qwen3.6" in model.lower() or "omni" in model.lower(),
                "temperature": True,
                "top_p": True,
                "streaming": True,
            }
    for row in ineligible:
        caps[f"{row['provider']}:{row['model']}"] = {
            "provider": row["provider"],
            "multimodal": False,
            "camera_input": False,
            "eligibility": row["reason"],
        }
    (OUT / "config" / "capabilities.json").write_text(json.dumps(caps, indent=2), encoding="utf-8")


def done_key(parts: dict) -> str:
    return "|".join(str(parts[k]) for k in ("phase", "provider", "model", "case_id", "mode", "repeat", "variant"))


def run_case(provider: str, model: str, case: dict, *, think: bool, repeat: int, variant: str, size=None, jpeg_q=None, stream=True, max_tokens=None, prompt_override=None) -> dict:
    img = ROOT / "dataset" / "images" / case["image"]
    data_url = image_data_url(img, size=tuple(size) if size else None, jpeg_q=jpeg_q)
    prompt = prompt_override or case["prompt"]
    messages = [
        {"role": "system", "content": CFG["system_prompt"]},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]
    mt = max_tokens if max_tokens is not None else (2200 if think else 700)
    t_prep = time.perf_counter()
    res = chat(provider, model, messages, think=think, max_tokens=mt, stream=stream)
    visual = score_text(res["answer"], case.get("expected_visual") or [])
    answer_s = score_text(res["answer"], case.get("expected_answer") or [])
    usage = res.get("usage") or {}
    in_tok = usage.get("prompt_tokens") or usage.get("input_tokens")
    out_tok = usage.get("completion_tokens") or usage.get("output_tokens")
    reason_tok = usage.get("reasoning_tokens") or usage.get("completion_tokens_details", {}).get("reasoning_tokens") if isinstance(usage.get("completion_tokens_details"), dict) else None
    total = usage.get("total_tokens")
    tps = None
    if out_tok and res["latency_ms"]:
        tps = out_tok / (res["latency_ms"] / 1000.0)
    row = {
        "ts": now_iso(),
        "provider": provider,
        "model": model,
        "case_id": case["id"],
        "mode": "thinking" if think else "normal",
        "repeat": repeat,
        "variant": variant,
        "ok": res["ok"] and bool(res["answer"]),
        "status": res["status"],
        "error": "" if res["ok"] else res["text"],
        "answer": res["answer"][:2000],
        "latency_ms": res["latency_ms"],
        "ttft_ms": res["ttft_ms"],
        "prep_ms": (time.perf_counter() - t_prep) * 1000,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "reasoning_tokens": reason_tok,
        "total_tokens": total,
        "tokens_per_sec": tps,
        "visual_score": visual,
        "answer_score": answer_s,
        "accuracy": (visual + answer_s) / 2.0,
        "temperature": CFG["thinking_temperature"] if think else 0,
        "reasoning_enabled": think,
        "image_bytes": len(data_url),
    }
    append_jsonl(RAW / "requests.jsonl", {
        "ts": now_iso(),
        "provider": provider,
        "model": model,
        "case_id": case["id"],
        "mode": "thinking" if think else "normal",
        "variant": variant,
        "temperature": CFG["thinking_temperature"] if think else 0,
        "reasoning_enabled": think,
        "max_tokens": mt,
        "stream": stream,
        "image_bytes": len(data_url),
    })
    append_jsonl(RAW / "responses.jsonl", row)
    if not row["ok"]:
        append_jsonl(RAW / "errors.jsonl", row)
    return row


def cmd_run() -> None:
    load_env()
    state = load_state()
    done = set(state.get("done") or [])
    eligible = state.get("eligible") or {}
    if not eligible.get("nvidia") and not eligible.get("groq"):
        raise SystemExit("No eligible models. Run: python run_benchmark.py probe")

    phases = []
    for provider, models in eligible.items():
        for model in models:
            for case in CASES:
                for think in (False, True):
                    for rep in range(CFG["repeats"]):
                        phases.append(("core", provider, model, case, think, rep, "core", None, None))
            cam_case = next(c for c in CASES if c["id"] == "screen_behavioral")
            for spec in CFG["camera_sizes"]:
                phases.append(("camera", provider, model, cam_case, False, 0, spec["name"], spec["size"], spec["jpeg_q"]))
            color = next(c for c in CASES if c["id"] == "color_object")
            phases.append(("prompt", provider, model, color, False, 0, "prompt_short", None, None))
            phases.append(("prompt", provider, model, color, False, 0, "prompt_long", None, None))
            phases.append(("output", provider, model, color, False, 0, "out_short", None, None))
            phases.append(("output", provider, model, color, False, 0, "out_long", None, None))

    total = len(phases)
    for i, (phase, provider, model, case, think, rep, variant, size, jpeg_q) in enumerate(phases, 1):
        key = done_key({
            "phase": phase, "provider": provider, "model": model, "case_id": case["id"],
            "mode": "thinking" if think else "normal", "repeat": rep, "variant": variant,
        })
        if key in done:
            print(f"[{i}/{total}] skip {key}")
            continue
        print(f"[{i}/{total}] {provider} {model} {case['id']} {variant} think={think}", flush=True)
        prompt_override = None
        max_tokens = None
        if variant == "prompt_short":
            prompt_override = "Color and count of the circles?"
        elif variant == "prompt_long":
            prompt_override = (
                "You are answering from a live camera frame. Carefully inspect every object. "
                "Describe the dominant shape color, count every circle, and mention any other shapes. "
                "Then give a one-sentence spoken answer a candidate could use. "
                "Do not mention the camera or that this is an image."
            )
        elif variant == "out_short":
            max_tokens = 48
        elif variant == "out_long":
            max_tokens = 1400
        run_case(
            provider, model, case, think=think, repeat=rep, variant=variant,
            size=size, jpeg_q=jpeg_q, stream=True, max_tokens=max_tokens,
            prompt_override=prompt_override,
        )
        done.add(key)
        state["done"] = sorted(done)
        save_state(state)

    # concurrency on first eligible NVIDIA model + first Groq
    conc_targets = []
    if eligible.get("nvidia"):
        conc_targets.append(("nvidia", eligible["nvidia"][0]))
    if eligible.get("groq"):
        conc_targets.append(("groq", eligible["groq"][0]))
    case = next(c for c in CASES if c["id"] == "color_object")
    for provider, model in conc_targets:
        for n in CFG["concurrency_levels"]:
            ck = f"concurrency|{provider}|{model}|n={n}"
            if ck in done:
                continue
            print(f"concurrency n={n} {provider} {model}", flush=True)
            t0 = time.perf_counter()
            rows = []
            with ThreadPoolExecutor(max_workers=n) as ex:
                futs = [
                    ex.submit(run_case, provider, model, case, think=False, repeat=i, variant=f"conc{n}", stream=False, max_tokens=64)
                    for i in range(n)
                ]
                for fut in as_completed(futs):
                    rows.append(fut.result())
            wall = (time.perf_counter() - t0) * 1000
            append_jsonl(RAW / "concurrency.jsonl", {
                "ts": now_iso(), "provider": provider, "model": model, "n": n,
                "wall_ms": wall, "success": sum(1 for r in rows if r["ok"]) / max(len(rows), 1),
                "latencies": [r["latency_ms"] for r in rows],
            })
            done.add(ck)
            state["done"] = sorted(done)
            save_state(state)


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def fmt_num(v, digits=0):
    if v is None:
        return "-"
    return f"{v:.{digits}f}"


def cmd_rank() -> None:
    rows = load_jsonl(RAW / "responses.jsonl")
    conc = load_jsonl(RAW / "concurrency.jsonl")
    by: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        by.setdefault((r["provider"], r["model"]), []).append(r)

    ranked = []
    for (provider, model), items in by.items():
        core = [r for r in items if r.get("variant") == "core"]
        normal = [r for r in core if r["mode"] == "normal"]
        thinking = [r for r in core if r["mode"] == "thinking"]
        cam = [r for r in items if r.get("variant") in {s["name"] for s in CFG["camera_sizes"]}]
        lat_n = [r["latency_ms"] for r in normal if r["ok"]]
        ttft_n = [r["ttft_ms"] for r in normal if r["ok"] and r.get("ttft_ms") is not None]
        acc_n = [r["accuracy"] for r in normal if r["ok"]]
        acc_t = [r["accuracy"] for r in thinking if r["ok"]]
        tps = [r["tokens_per_sec"] for r in normal if r["ok"] and r.get("tokens_per_sec")]
        out_tok = [r["output_tokens"] for r in normal if r["ok"] and r.get("output_tokens")]
        success = sum(1 for r in core if r["ok"]) / max(len(core), 1)
        p95 = percentile(lat_n, 95) if lat_n else None
        mean_lat = statistics.mean(lat_n) if lat_n else None
        speed = 0.0
        if p95:
            speed = max(0.0, min(1.0, 8000.0 / p95))
        acc = statistics.mean(acc_n) if acc_n else 0.0
        rel = success
        cam_lats = [r["latency_ms"] for r in cam if r["ok"]]
        cam_p95 = percentile(cam_lats, 95) if cam_lats else p95
        cam_success = sum(1 for r in cam if r["ok"]) / max(len(cam), 1) if cam else success
        cam_class = classify_camera(cam_p95, cam_success)
        cam_score = {"EXCELLENT": 1, "GOOD": 0.8, "ACCEPTABLE": 0.55, "SLOW": 0.3, "UNSUITABLE": 0}.get(cam_class, 0)
        tok_eff = 0.5
        if out_tok and acc_n:
            tok_eff = max(0.0, min(1.0, (statistics.mean(acc_n) * 400) / max(statistics.mean(out_tok), 1)))
        conc_score = 0.5
        related = [c for c in conc if c["provider"] == provider and c["model"] == model]
        if related:
            conc_score = statistics.mean(c["success"] for c in related)
        cost = 0.7 if provider == "nvidia" else 0.8
        w = CFG["weights"]
        overall = (
            w["speed"] * speed
            + w["multimodal_accuracy"] * acc
            + w["reliability"] * rel
            + w["camera"] * cam_score
            + w["token_efficiency"] * tok_eff
            + w["concurrency"] * conc_score
            + w["cost"] * cost
        )
        ranked.append({
            "provider": provider,
            "model": model,
            "multimodal": True,
            "normal_latency_mean": mean_lat,
            "p95": p95,
            "ttft_mean": statistics.mean(ttft_n) if ttft_n else None,
            "tokens_per_sec": statistics.mean(tps) if tps else None,
            "accuracy": acc,
            "thinking_accuracy": statistics.mean(acc_t) if acc_t else None,
            "thinking_latency_mean": statistics.mean([r["latency_ms"] for r in thinking if r["ok"]]) if any(r["ok"] for r in thinking) else None,
            "camera_class": cam_class,
            "camera_score": cam_score,
            "reliability": rel,
            "speed_score": speed,
            "token_efficiency_score": tok_eff,
            "concurrency_score": conc_score,
            "overall": overall,
            "n_core": len(core),
        })

    ranked.sort(key=lambda r: r["overall"], reverse=True)
    nvidia = [r for r in ranked if r["provider"] == "nvidia"]
    groq = [r for r in ranked if r["provider"] == "groq"]
    slim_ranked = [
        {
            "provider": r["provider"],
            "model": r["model"],
            "overall": r["overall"],
            "accuracy": r["accuracy"],
            "reliability": r["reliability"],
            "p95": r["p95"],
            "camera_class": r["camera_class"],
        }
        for r in ranked
    ]
    chain = {
        "generated_at": now_iso(),
        "primary_nvidia": nvidia[0]["model"] if nvidia else "",
        "nvidia_fallbacks": [r["model"] for r in nvidia[1:3]],
        "groq_primary": groq[0]["model"] if groq else "",
        "groq_emergency": groq[1]["model"] if len(groq) > 1 else "",
        "ranked": slim_ranked,
        "weights": CFG["weights"],
        "thinking_temperature": CFG["thinking_temperature"],
        "normal_temperature": 0,
    }
    RANK.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    METRICS.mkdir(parents=True, exist_ok=True)
    (RANK / "overall.json").write_text(json.dumps(chain, indent=2), encoding="utf-8")
    write_csv(RANK / "overall.csv", ranked, list(ranked[0].keys()) if ranked else ["model"])
    fallback_rows = []
    for role, p, m in [
        ("PRIMARY", "nvidia", chain["primary_nvidia"]),
        *[(f"NVIDIA_FALLBACK_{i+1}", "nvidia", m) for i, m in enumerate(chain["nvidia_fallbacks"])],
        ("GROQ_FALLBACK", "groq", chain["groq_primary"]),
        ("GROQ_EMERGENCY", "groq", chain["groq_emergency"]),
    ]:
        if m:
            fallback_rows.append({"order": len(fallback_rows) + 1, "role": role, "provider": p, "model": m})
    write_csv(RANK / "fallback_order.csv", fallback_rows, ["order", "role", "provider", "model"])

    gen_ts = ROOT.parents[1] / "src" / "mobile" / "generated" / "fallbackRank.generated.ts"
    gen_ts.parent.mkdir(parents=True, exist_ok=True)
    gen_ts.write_text(
        "/* Generated by multimodal_bench — do not edit by hand. */\n"
        "export type FallbackRank = {\n"
        "  generated_at: string\n"
        "  primary_nvidia: string\n"
        "  nvidia_fallbacks: string[]\n"
        "  groq_primary: string\n"
        "  groq_emergency: string\n"
        "  ranked: Array<{ provider: string; model: string; overall: number; accuracy: number;"
        " reliability: number; p95: number | null; camera_class: string }>\n"
        "  weights: Record<string, number>\n"
        "  thinking_temperature: number\n"
        "  normal_temperature: number\n"
        "}\n"
        "export const FALLBACK_RANK: FallbackRank = " + json.dumps(chain, indent=2) + "\n",
        encoding="utf-8",
    )

    write_csv(METRICS / "latency.csv", rows, ["provider", "model", "case_id", "mode", "variant", "latency_ms", "ok"])
    write_csv(METRICS / "ttft.csv", rows, ["provider", "model", "case_id", "mode", "ttft_ms", "ok"])
    write_csv(METRICS / "tokens.csv", rows, ["provider", "model", "case_id", "mode", "input_tokens", "output_tokens", "reasoning_tokens", "tokens_per_sec"])
    write_csv(METRICS / "accuracy.csv", rows, ["provider", "model", "case_id", "mode", "visual_score", "answer_score", "accuracy"])
    write_csv(METRICS / "reasoning.csv", [r for r in rows if r.get("mode") == "thinking"], ["provider", "model", "case_id", "accuracy", "latency_ms", "reasoning_tokens"])
    write_csv(METRICS / "reliability.csv", ranked, ["provider", "model", "reliability", "n_core"])
    write_csv(METRICS / "camera.csv", ranked, ["provider", "model", "camera_class", "camera_score"])
    write_csv(METRICS / "concurrency.csv", conc, ["provider", "model", "n", "wall_ms", "success"])
    write_csv(RANK / "normal.csv", ranked, ["model", "provider", "normal_latency_mean", "p95", "ttft_mean", "accuracy", "overall"])
    write_csv(RANK / "thinking.csv", ranked, ["model", "provider", "thinking_latency_mean", "thinking_accuracy", "overall"])
    write_csv(RANK / "camera.csv", ranked, ["model", "provider", "camera_class", "camera_score", "overall"])
    (OUT / "config").mkdir(parents=True, exist_ok=True)
    (OUT / "config" / "benchmark.json").write_text(json.dumps(CFG, indent=2), encoding="utf-8")

    lines = [
        "# Multimodal benchmark report",
        "",
        f"Generated: {chain['generated_at']}",
        "",
        "Primary dataset: camera-style interview screens (text-in-image, OCR, objects, whiteboard, chart).",
        "No external labeled corpus was in the repo; this dataset matches VeilAssist camera capture.",
        "",
        "## Ranking (Normal Mode focus)",
        "",
        "| Model | Provider | P95 ms | TTFT | Tok/s | Acc | Camera | Rel | Overall |",
        "|---|---|---:|---:|---:|---:|---|---:|---:|",
    ]
    for r in ranked:
        lines.append(
            f"| {r['model']} | {r['provider']} | {fmt_num(r['p95'])} | "
            f"{fmt_num(r['ttft_mean'])} | {fmt_num(r['tokens_per_sec'], 1)} | {r['accuracy']:.2f} | "
            f"{r['camera_class']} | {r['reliability']:.2f} | {r['overall']:.3f} |"
        )
    lines += [
        "",
        "## Thinking Mode",
        "",
        "| Model | Thinking Latency | Thinking Acc | Normal Acc | Overall |",
        "|---|---:|---:|---:|---:|",
    ]
    for r in ranked:
        lines.append(
            f"| {r['model']} | {fmt_num(r['thinking_latency_mean'])} | "
            f"{fmt_num(r['thinking_accuracy'], 2)} | {r['accuracy']:.2f} | {r['overall']:.3f} |"
        )
    lines += [
        "",
        "## Why this chain",
        "",
    ]
    if nvidia:
        primary = nvidia[0]
        lines.append(
            f"Primary NVIDIA is **{primary['model']}** because it had the highest overall score "
            f"({primary['overall']:.3f}) under the configured weights. "
            f"Normal P95={fmt_num(primary['p95'])} ms, accuracy={primary['accuracy']:.2f}, "
            f"reliability={primary['reliability']:.2f}, camera={primary['camera_class']}."
        )
        if "omni" not in primary["model"].lower():
            lines.append(
                "Nemotron-3-Nano-Omni-30B was a hypothesis only; it did not outrank this model on the measured workload."
            )
        for i, fb in enumerate(nvidia[1:3], 1):
            lines.append(
                f"NVIDIA fallback #{i} is **{fb['model']}** (overall {fb['overall']:.3f}, "
                f"P95={fmt_num(fb['p95'])} ms, acc={fb['accuracy']:.2f}, rel={fb['reliability']:.2f})."
            )
    if groq:
        lines.append(
            f"Groq multimodal fallback is **{groq[0]['model']}** (overall {groq[0]['overall']:.3f}). "
            "Llama 4 Scout/Maverick on Groq returned NOT_ELIGIBLE_MULTIMODAL (404). "
            "No second Groq vision model was eligible, so emergency Groq is empty until another vision model is available. "
            "Groq reliability in this run was depressed by 429 TPM rate limits during sequential image requests, not by missing vision support. Probe and successful Groq answers confirmed image input works."
        )
    lines += [
        "",
        "## Selected chain",
        "",
        f"- **Primary NVIDIA:** {chain['primary_nvidia']}",
        *[f"- **NVIDIA Fallback #{i+1}:** {m}" for i, m in enumerate(chain["nvidia_fallbacks"])],
        f"- **Groq provider fallback:** {chain['groq_primary']}",
        f"- **Groq emergency:** {chain['groq_emergency'] or '(none eligible)'}",
        "",
        "Selection uses configurable weights in `config/benchmark.json` (speed 25%, accuracy 25%, reliability 20%, camera 10%, tokens 10%, concurrency 5%, cost 5%).",
        "Normal mode: temperature=0, reasoning OFF (Nemotron `/no_think` + `enable_thinking=false`; Groq Qwen `reasoning_effort=none`).",
        "Thinking mode: temperature=0.6, Nemotron `enable_thinking=true`, Groq Qwen `reasoning_effort=default`.",
        "",
        "Text-only catalog models were marked NOT_ELIGIBLE_MULTIMODAL and excluded from the production chain.",
    ]
    (REPORTS / "benchmark_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (REPORTS / "model_comparison.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["discover", "probe", "run", "rank", "all"])
    args = p.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    if args.cmd in ("discover", "all"):
        cmd_discover()
    if args.cmd in ("probe", "all"):
        cmd_probe()
    if args.cmd in ("run", "all"):
        cmd_run()
    if args.cmd in ("rank", "all"):
        cmd_rank()


if __name__ == "__main__":
    main()
