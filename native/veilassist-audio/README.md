# VeilAssist native audio (Rust)

N-API addon that accelerates the STT resample hot path used by Deepgram, NVIDIA NIM,
local Moonshine, and other cloud engines:

`Int16LE mono @ AudioContext rate → Float32 @ 16 kHz`

## Why Rust here (and not capture)

Browser/Electron capture (`getUserMedia` / `getDisplayMedia` loopback) stays in the
renderer. Moving capture into Rust would fight Electron permissions and dual mic/sys
graphs. Resample runs on every PCM chunk in **main** — that is the safe vertical slice.

## Build

Requires [Rust](https://rustup.rs/) + Node 20+.

```bash
npm run build:native-audio
npm run test:native-audio
```

If cargo is missing, packaging continues and `lib/localStt/audioResampler.js` uses the
identical JS implementation (`VEILASSIST_AUDIO_NATIVE=0` forces JS).

## API

Loaded via `require('../../native/veilassist-audio')`:

- `resampleToF32(buffer, inputSampleRate) → Float32Array`
- `pcm16Rms(buffer) → number`
- `nativeAudioBackend() → "rust-napi"`
