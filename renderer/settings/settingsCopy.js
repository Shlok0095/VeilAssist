/** Normalize single-line settings copy: no em/en dashes. Skips multi-line markdown. */
export function polishCopy(text) {
  if (text == null || text === '') return text
  const raw = String(text)
  if (raw.includes('\n')) return raw
  return raw
    .replace(/\s*—\s*/g, '. ')
    .replace(/\s*–\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .trim()
}
