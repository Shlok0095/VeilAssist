"""Generate camera-like interview images for the multimodal benchmark."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "dataset" / "images"


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("arial.ttf", "segoeui.ttf", "C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def screen(w: int, h: int, title: str, body: list[str], accent: str = "#7dd3fc") -> Image.Image:
    img = Image.new("RGB", (w, h), "#121214")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((36, 36, w - 36, h - 36), radius=18, fill="#1c1c20", outline="#2e2e32", width=2)
    d.ellipse((56, 56, 78, 78), fill="#ff5f57")
    d.ellipse((88, 56, 110, 78), fill="#febc2e")
    d.ellipse((120, 56, 142, 78), fill="#28c840")
    d.text((170, 54), title, fill=accent, font=font(22))
    y = 120
    for line in body:
        d.text((64, y), line, fill="#ececee", font=font(28))
        y += 44
    return img


def generate() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    screen(1280, 720, "Zoom · Interview", [
        "Interviewer:",
        "Tell me about a time you handled a production",
        "outage. What did you do, and what was the impact?",
    ]).save(OUT / "screen_behavioral.png")

    screen(1280, 720, "CoderPad", [
        "Question: Two Sum",
        "Given an array of integers nums and a target,",
        "return indices of the two numbers that add up",
        "to target. Assume exactly one solution.",
    ]).save(OUT / "screen_coding.png")

    img = Image.new("RGB", (960, 540), "#0f172a")
    d = ImageDraw.Draw(img)
    d.ellipse((120, 160, 260, 300), fill="#ef4444")
    d.ellipse((400, 180, 520, 300), fill="#ef4444")
    d.ellipse((680, 150, 840, 310), fill="#ef4444")
    d.rectangle((40, 40, 200, 90), fill="#22c55e")
    d.text((320, 40), "Count the red circles", fill="#e2e8f0", font=font(28))
    img.save(OUT / "color_objects.png")

    badge = Image.new("RGB", (800, 480), "#f8fafc")
    d = ImageDraw.Draw(badge)
    d.rounded_rectangle((80, 80, 720, 400), radius=16, fill="#111827", outline="#334155", width=4)
    d.text((140, 140), "CONFERENCE BADGE", fill="#94a3b8", font=font(18))
    d.text((140, 200), "Shlok Kumar", fill="#ffffff", font=font(42))
    d.text((140, 270), "Staff Engineer", fill="#38bdf8", font=font(28))
    badge.save(OUT / "badge_ocr.png")

    board = Image.new("RGB", (1280, 720), "#1e3a2f")
    d = ImageDraw.Draw(board)
    d.text((80, 70), "URL Shortener", fill="#f8fafc", font=font(40))
    d.text((80, 160), "Client -> API -> Redis cache", fill="#d9f99d", font=font(28))
    d.text((80, 220), "             -> Postgres (id, url)", fill="#d9f99d", font=font(28))
    d.text((80, 300), "Requirements: 10M writes/day, 50ms p95", fill="#fde68a", font=font(26))
    d.rectangle((80, 400, 360, 520), outline="#86efac", width=3)
    d.text((100, 440), "hash(url)[:7]", fill="#ffffff", font=font(24))
    board.save(OUT / "whiteboard.png")

    chart = Image.new("RGB", (960, 540), "#0b1220")
    d = ImageDraw.Draw(chart)
    d.text((40, 24), "Weekly signups", fill="#cbd5e1", font=font(26))
    pts = [(80, 420), (220, 360), (360, 300), (500, 240), (640, 180), (780, 120)]
    d.line(pts, fill="#38bdf8", width=6)
    for p in pts:
        d.ellipse((p[0] - 7, p[1] - 7, p[0] + 7, p[1] + 7), fill="#f8fafc")
    d.text((760, 70), "42", fill="#f8fafc", font=font(36))
    chart.save(OUT / "chart.png")
    print(f"wrote images to {OUT}")


if __name__ == "__main__":
    generate()
