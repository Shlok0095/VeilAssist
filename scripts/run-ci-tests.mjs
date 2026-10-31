import { spawnSync } from 'node:child_process'
import process from 'node:process'

const plainTests = [
  'scripts/test-profile-tree.mjs',
  'scripts/test-phase3-action-chips.mjs',
  'scripts/test-phase4-meeting-details.mjs',
  'scripts/test-phase5-skills.mjs',
  'scripts/test-intelligence-flags.mjs',
  'scripts/test-phase7-stt-routing.mjs',
  'scripts/test-phase8-system.mjs',
  'scripts/test-phase9-intelligence-polish.mjs',
  'scripts/test-phase10-phone-link.mjs',
  'scripts/test-phase10-phone-mirror.mjs',
  'scripts/test-context-router.mjs',
  'scripts/test-google-calendar.mjs',
  'scripts/test-long-term-memory.mjs',
  'scripts/test-meeting-detect.mjs',
  'scripts/test-meeting-mode-detector.mjs',
  'scripts/test-meeting-summary.mjs',
  'scripts/test-meeting-summary-format.mjs',
  'scripts/test-overlay-mouse-capture.mjs',
  'scripts/test-phone-auto-answer.cjs',
  'scripts/test-playbook-context.mjs',
  'scripts/verify-background-process-config.cjs',
  'scripts/test-landing-windows-package.cjs',
  'scripts/e2e-auto-manual-profile.cjs',
]

const nodeTestFiles = [
  'scripts/test-ask-context-priority.cjs',
  'scripts/test-chat-stream-fallback.cjs',
  'scripts/test-conversation-memory.cjs',
  'scripts/test-nvidia-streaming-stt.cjs',
  'scripts/test-nvidia-chat-models.cjs',
  'scripts/test-question-detector.cjs',
  'scripts/test-autoanswer-parity.cjs',
  'scripts/test-autoanswer-followups.cjs',
  'scripts/test-chat-fallback-provider.cjs',
  'scripts/test-rolling-transcript.cjs',
  'scripts/test-transcript-consume.cjs',
  'scripts/test-transcript-lifecycle.cjs',
]

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

for (const file of plainTests) run([file])
run(['--test', ...nodeTestFiles])

console.log(`\n[ci-tests] ${plainTests.length + nodeTestFiles.length} test files passed`)
