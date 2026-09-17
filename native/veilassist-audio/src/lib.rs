// Copyright (c) 2026 VeilAssist. All rights reserved.
// Hot-path PCM: Int16LE @ any rate → Float32 @ 16 kHz (linear), matching JS audioResampler.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;

const TARGET_RATE: f64 = 16_000.0;

/// Same contract as `lib/localStt/audioResampler.js` `resampleToF32`:
/// Int16LE mono buffer → Float32 samples at 16 kHz (linear interpolation).
#[napi(js_name = "resampleToF32")]
pub fn resample_to_f32(chunk: Buffer, input_sample_rate: u32) -> Result<Float32Array> {
  let rate = if input_sample_rate == 0 {
    TARGET_RATE
  } else {
    input_sample_rate as f64
  };

  let bytes = chunk.as_ref();
  let input_samples = bytes.len() / 2;
  if input_samples == 0 {
    return Ok(Float32Array::new(vec![]));
  }

  let mut input = Vec::<f32>::with_capacity(input_samples);
  for i in 0..input_samples {
    let sample = i16::from_le_bytes([bytes[i * 2], bytes[i * 2 + 1]]);
    // Match JS: buf.readInt16LE / 32768
    input.push((sample as f32) / 32768.0);
  }

  if (rate - TARGET_RATE).abs() < f64::EPSILON {
    return Ok(Float32Array::new(input));
  }

  let ratio = rate / TARGET_RATE;
  let output_length = ((input_samples as f64) / ratio).round().max(1.0) as usize;
  let mut output = Vec::<f32>::with_capacity(output_length);

  for i in 0..output_length {
    let src_pos = (i as f64) * ratio;
    let src_idx = src_pos.floor() as usize;
    let frac = (src_pos - src_idx as f64) as f32;
    let s0 = input.get(src_idx).copied().unwrap_or(0.0);
    let s1 = input.get(src_idx + 1).copied().unwrap_or(s0);
    output.push(s0 + frac * (s1 - s0));
  }

  Ok(Float32Array::new(output))
}

/// Fast RMS of Int16LE PCM (silence heuristics / energy). Returns 0 for empty.
#[napi(js_name = "pcm16Rms")]
pub fn pcm16_rms(chunk: Buffer) -> Result<f64> {
  let bytes = chunk.as_ref();
  let n = bytes.len() / 2;
  if n == 0 {
    return Ok(0.0);
  }
  let mut sum_sq: f64 = 0.0;
  for i in 0..n {
    let sample = i16::from_le_bytes([bytes[i * 2], bytes[i * 2 + 1]]) as f64;
    sum_sq += sample * sample;
  }
  Ok((sum_sq / n as f64).sqrt())
}

#[napi(js_name = "nativeAudioBackend")]
pub fn native_audio_backend() -> String {
  "rust-napi".to_string()
}
