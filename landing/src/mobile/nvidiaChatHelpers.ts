/** NVIDIA NIM chat helpers — thinking controls differ per model. Never inject `/no_think` (it contains `/think` and turns reasoning ON). */

export function isNvidiaNimBaseUrl(baseURL: string): boolean {
  try {
    return new URL(baseURL.replace(/\/$/, '')).hostname.toLowerCase() === 'integrate.api.nvidia.com'
  } catch {
    return false
  }
}

/**
 * 12B/9B VL: default OFF; enable only with `/think` in the system prompt.
 * 30B Omni / *reasoning*: default ON; disable with chat_template_kwargs.enable_thinking=false.
 * Llama 3.1 Nemotron: `detailed thinking on|off` in the system prompt.
 */
export type NvidiaThinkStyle = 'none' | 'slash_think' | 'enable_thinking' | 'detailed_thinking'

export function nvidiaThinkStyle(model: string): NvidiaThinkStyle {
  const m = String(model || '').toLowerCase()
  if (/nemotron-3-nano-omni|a3b-reasoning/.test(m)) return 'enable_thinking'
  if (/nemotron-nano-12b|nemotron-nano-9b/.test(m)) return 'slash_think'
  if (/llama-3\.1-nemotron/.test(m)) return 'detailed_thinking'
  if (/nemotron/.test(m)) return 'enable_thinking'
  return 'none'
}

export function isNvidiaThinkingTemplateModel(model: string): boolean {
  return nvidiaThinkStyle(model) !== 'none'
}

export function nvidiaThinkKwargs(think: boolean): { enable_thinking: boolean } {
  return { enable_thinking: Boolean(think) }
}

/** Only models that document chat_template_kwargs. 12B VL rejects or ignores it. */
export function nvidiaThinkBodyFields(model: string, think: boolean): Record<string, unknown> {
  if (nvidiaThinkStyle(model) !== 'enable_thinking') return {}
  return { chat_template_kwargs: nvidiaThinkKwargs(think) }
}

function mapTextContent(
  content: string | unknown,
  map: (text: string) => string,
): string | unknown {
  if (typeof content === 'string') return map(content)
  if (!Array.isArray(content)) return content
  return content.map((part) => {
    if (!part || typeof part !== 'object') return part
    const p = part as { type?: string; text?: string }
    if (p.type === 'text' && typeof p.text === 'string') return { ...p, text: map(p.text) }
    return part
  })
}

function stripSlashThinkTags(text: string): string {
  return text
    .replace(/^\s*\/(?:no_)?think\b\s*/i, '')
    .replace(/\s*\/(?:no_)?think\b/gi, '')
    .replace(/^\s*detailed thinking (?:on|off)\s*/i, '')
    .trimStart()
}

function setSystemPrefix(
  messages: Array<{ role: string; content: string | unknown }>,
  prefix: string,
): Array<{ role: string; content: string | unknown }> {
  const next = messages.map((m) => ({ ...m }))
  const systemIndex = next.findIndex((m) => m.role === 'system')
  if (systemIndex >= 0) {
    const content = next[systemIndex].content
    if (typeof content === 'string') {
      const rest = stripSlashThinkTags(content)
      next[systemIndex] = { ...next[systemIndex], content: rest ? `${prefix}\n${rest}` : prefix }
    }
    return next
  }
  next.unshift({ role: 'system', content: prefix })
  return next
}

function stripThinkControls(
  messages: Array<{ role: string; content: string | unknown }>,
): Array<{ role: string; content: string | unknown }> {
  return messages.map((m) => {
    if (m.role !== 'system' && m.role !== 'user') return { ...m }
    return { ...m, content: mapTextContent(m.content, stripSlashThinkTags) }
  })
}

/**
 * Apply the per-model Think-on / Think-off control.
 * Think off: greedy sampling is set elsewhere (temp 0, top_p 0); here we only kill reasoning.
 */
export function applyNemotronReasoning(
  messages: Array<{ role: string; content: string | unknown }>,
  _baseURL: string,
  model: string,
  think: boolean,
): Array<{ role: string; content: string | unknown }> {
  const style = nvidiaThinkStyle(model)
  const on = Boolean(think)
  const cleaned = stripThinkControls(messages)

  if (style === 'slash_think') {
    return on ? setSystemPrefix(cleaned, '/think') : cleaned
  }
  if (style === 'detailed_thinking') {
    return setSystemPrefix(cleaned, on ? 'detailed thinking on' : 'detailed thinking off')
  }
  if (style === 'enable_thinking') {
    return cleaned
  }
  return cleaned
}

/** Drop leaked chain-of-thought so the on-screen answer is speakable. */
export function stripThinkingTrace(text: string): string {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim()
}

export function nvidiaChatHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}
