#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Reusable multi-iteration parity suite for overlapping IM ↔ ShadowAssist features.
// Does not modify the reference app. Writes JSON + markdown under test_results/.

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const OUT_DIR = path.resolve(__dirname, '..', 'test_results')
const ITERATIONS = Math.max(1, Number(process.env.PARITY_ITERATIONS || 5))

/** Overlap-only script inventory (existing project tests). */
const SCENARIOS = [
  {
    id: 'memory-window',
    area: 'conversational_memory',
    script: 'scripts/test-conversation-memory-window.cjs',
    runner: 'node --test',
  },
  {
    id: 'autoanswer-transcript',
    area: 'conversational_memory',
    script: 'scripts/test-autoanswer-transcript.cjs',
    runner: 'node --test',
  },
  {
    id: 'question-detector',
    area: 'conversational_memory',
    script: 'scripts/test-question-detector.cjs',
    runner: 'node --test',
  },
  {
    id: 'resume-upload',
    area: 'profile_documents',
    script: 'scripts/test-resume-upload.cjs',
    runner: 'node --test',
  },
  {
    id: 'resume-jd-routing',
    area: 'profile_documents',
    script: 'scripts/test-resume-jd-routing.cjs',
    runner: 'node --test',
  },
  {
    id: 'ask-context-priority',
    area: 'answer_generation',
    script: 'scripts/test-ask-context-priority.cjs',
    runner: 'node --test',
  },
  {
    id: 'coding-answer-parity',
    area: 'answer_generation',
    script: 'scripts/test-coding-answer-parity.cjs',
    runner: 'node --test',
  },
  {
    id: 'im-answer-ui-parity',
    area: 'answer_panel',
    script: 'scripts/test-im-answer-ui-parity.cjs',
    runner: 'node --test',
  },
  {
    id: 'stream-answer-display',
    area: 'answer_panel',
    script: 'scripts/test-stream-answer-display.cjs',
    runner: 'node --test',
  },
  {
    id: 'general-answer-settings',
    area: 'answer_generation',
    script: 'scripts/test-general-answer-settings-wiring.cjs',
    runner: 'node --test',
  },
  {
    id: 'desktop-interview-wiring',
    area: 'answer_generation',
    script: 'scripts/test-desktop-interview-wiring.cjs',
    runner: 'node --test',
  },
  {
    id: 'interview-mode-alignment',
    area: 'conversation',
    script: 'scripts/test-interview-mode-alignment.cjs',
    runner: 'node --test',
  },
]

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function runOnce(scenario) {
  const started = Date.now()
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  // Prefer direct node --test when runner includes it
  let result
  if (scenario.runner === 'node --test') {
    result = spawnSync(process.execPath, ['--test', scenario.script], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
      timeout: 120000,
    })
  } else {
    result = spawnSync(cmd, ['--yes', 'node', scenario.script], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
      timeout: 120000,
    })
  }
  const elapsedMs = Date.now() - started
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const pass = result.status === 0
  return {
    exitCode: result.status,
    pass,
    elapsedMs,
    stdoutTail: stdout.slice(-4000),
    stderrTail: stderr.slice(-2000),
    error: result.error ? String(result.error.message || result.error) : null,
  }
}

function main() {
  ensureDir(OUT_DIR)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const results = {
    startedAt: new Date().toISOString(),
    iterations: ITERATIONS,
    root: ROOT,
    scenarios: [],
  }

  for (const scenario of SCENARIOS) {
    const entry = {
      id: scenario.id,
      area: scenario.area,
      script: scenario.script,
      runs: [],
      passCount: 0,
      failCount: 0,
    }
    console.log(`\n=== ${scenario.id} × ${ITERATIONS} ===`)
    for (let i = 1; i <= ITERATIONS; i++) {
      process.stdout.write(`  run ${i}/${ITERATIONS}... `)
      const run = runOnce(scenario)
      entry.runs.push({ iteration: i, ...run })
      if (run.pass) {
        entry.passCount += 1
        console.log(`PASS (${run.elapsedMs}ms)`)
      } else {
        entry.failCount += 1
        console.log(`FAIL exit=${run.exitCode} (${run.elapsedMs}ms)`)
      }
    }
    results.scenarios.push(entry)
  }

  results.finishedAt = new Date().toISOString()
  results.summary = {
    scenarios: results.scenarios.length,
    totalRuns: results.scenarios.reduce((n, s) => n + s.runs.length, 0),
    totalPass: results.scenarios.reduce((n, s) => n + s.passCount, 0),
    totalFail: results.scenarios.reduce((n, s) => n + s.failCount, 0),
    allGreen: results.scenarios.every((s) => s.failCount === 0),
  }

  const jsonPath = path.join(OUT_DIR, `parity_suite_${stamp}.json`)
  const mdPath = path.join(OUT_DIR, `parity_suite_${stamp}.md`)
  const latestJson = path.join(OUT_DIR, 'parity_suite_latest.json')
  const latestMd = path.join(OUT_DIR, 'parity_suite_latest.md')

  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2))
  fs.writeFileSync(latestJson, JSON.stringify(results, null, 2))

  const lines = [
    '# Parity suite execution',
    '',
    `- Started: ${results.startedAt}`,
    `- Finished: ${results.finishedAt}`,
    `- Iterations per scenario: ${ITERATIONS}`,
    `- Pass: ${results.summary.totalPass} / ${results.summary.totalRuns}`,
    `- All green: ${results.summary.allGreen}`,
    '',
    '| Scenario | Area | Pass | Fail |',
    '|----------|------|------|------|',
  ]
  for (const s of results.scenarios) {
    lines.push(`| ${s.id} | ${s.area} | ${s.passCount} | ${s.failCount} |`)
  }
  lines.push('')
  lines.push('## Failures (tails)')
  for (const s of results.scenarios) {
    for (const r of s.runs) {
      if (r.pass) continue
      lines.push(`### ${s.id} iteration ${r.iteration}`)
      lines.push('```')
      lines.push((r.stderrTail || r.stdoutTail || r.error || 'no output').slice(0, 1500))
      lines.push('```')
    }
  }
  const md = lines.join('\n')
  fs.writeFileSync(mdPath, md)
  fs.writeFileSync(latestMd, md)

  console.log(`\nWrote ${jsonPath}`)
  console.log(`Wrote ${mdPath}`)
  console.log(JSON.stringify(results.summary, null, 2))
  process.exit(results.summary.allGreen ? 0 : 1)
}

main()
