# Screenshots

## Captured this audit

| File | Notes |
|------|-------|
| `desktop_cursor_workspace.webp` | Desktop during audit; Cursor workspace visible. |

## Blocker — live overlay / settings UI

Both InterviewMan (`E:\RCA\veilassist2\runtime\VeilAssist.exe`) and our packaged app (`dist\win-unpacked\VeilAssist.exe`) were launched during this audit.

Windows display capture reported:

> `WDA_EXCLUDEFROMCAPTURE` on two windows (approx. helper overlay + chrome)

Stealth / content-protection intentionally excludes the answer panel from screenshots and screen shares. Therefore **pixel screenshots of the live answer panel and profile settings windows could not be captured** without disabling stealth (which would change the product under test).

### How to capture manually for a follow-up pass

1. Temporarily turn off **Hide from screen capture** in General settings (both apps if available).
2. Open Profile → Resumes and General → Answers.
3. Generate a short answer and a long fenced coding answer.
4. Save PNGs into this folder as:
   - `im_profile_resumes.png`
   - `ours_profile_resumes.png`
   - `im_answers_settings.png`
   - `ours_answers_settings.png`
   - `im_overlay_short.png` / `ours_overlay_short.png`
   - `im_overlay_code.png` / `ours_overlay_code.png`

Automated functional parity for these surfaces is covered by `test_results/parity_suite_latest.*` (module + wiring tests), not by pixels.
