# Troubleshooting

Common issues and fixes for VeilAssist on Windows.

## Task Manager shows “Electron” instead of VeilAssist

You are running the **development** build (`npm start`). Build the packaged app with `npm run dist` and run `dist\VeilAssist.exe` to see the correct name and icon.

## App already running

VeilAssist is single-instance. Look for the tray icon near the clock. Right-click → **Quit** to fully exit, then relaunch.

## Overlay not visible

1. Press `Ctrl+\` to toggle visibility.
2. Tray → **Open**.
3. Check if it snapped off-screen — Settings → General → Snap position → pick a preset.
4. Use `Ctrl+Arrow keys` to nudge it back on screen.

## Listen not transcribing

| Check | Fix |
|-------|-----|
| Mic permission denied | Windows Settings → Privacy → Microphone → allow desktop apps |
| Microphone off | Settings → Audio → Microphone on |
| Local STT still loading | Wait 10–30s on first launch for ONNX models |
| Cloud STT key missing | Settings → Audio → pick cloud mode and save STT key |
| No speech detected | Try Mic sensitivity → Boost; speak closer to mic |

## No system / remote participant audio

Loopback uses Windows display-media capture:

1. When the picker appears, select the screen or window playing meeting audio.
2. Ensure meeting app is outputting audio to the default device.
3. Restart Listen after granting permission.

## Ask with screen fails or no vision

1. Confirm your provider supports vision (Groq, OpenAI, Anthropic, Google, NVIDIA NIM).
2. Pick a vision-capable model in Settings → AI Provider.
3. Run **Test connection**.
4. DeepSeek and non-vision custom endpoints only support text asks — use `Ctrl+Shift+Enter`.

## API key / connection errors

1. Settings → AI Provider → verify key saved (badge shows Saved).
2. Click **Test connection**.
3. Check vendor dashboard for quota, billing, and key validity.
4. For Custom provider, verify base URL ends without trailing path issues and model name matches server.

## SmartScreen or antivirus blocked the download

1. Verify SHA256 from **SHA256SUMS.txt** on the release page.
2. Click **More info → Run anyway** on SmartScreen if you trust the build source.
3. Add an exclusion for `VeilAssist.exe` if your AV quarantined it.

## Google Calendar will not connect

1. Ensure Client ID and Secret are for a **Desktop app** OAuth client in Google Cloud Console.
2. Add `http://127.0.0.1` redirect URI if configuring manually.
3. Click Cancel if OAuth hangs, then retry Connect.

## Phone Link phone cannot connect

1. Phone and PC on the **same Wi‑Fi** (not guest network isolation).
2. Allow VeilAssist through Windows Firewall on private networks.
3. Regenerate token and scan fresh QR.

## Phone mirror (scrcpy) not working

1. Settings → Phone — confirm **adb found** and **scrcpy found**.
2. Enable USB debugging on Android; accept RSA fingerprint on phone.
3. Run `adb devices` in a terminal to confirm device listed.
4. Install scrcpy from [github.com/Genymobile/scrcpy](https://github.com/Genymobile/scrcpy) and add to PATH.

## Session recap empty or error

1. Ensure a chat provider key is configured for LLM summary.
2. If provider fails, a text fallback recap is still generated from captured session data.
3. Check **Do not save meetings** is off in General settings.

## Contacting support

Note your app version (**Settings → Help → Support**) and the steps that led to the problem. Never send API keys.

## Reset everything

**Settings → Privacy → Delete all data** — full local wipe and relaunch. Re-enter API keys and reconnect calendar afterward.

## Still stuck?

Open **Settings → Help** for the full in-app guide (same content as this documentation site).
