// Vercel serverless — BYOK chat proxy with profile-aware routing (mirrors desktop answerPlanner).

import { handleCorsPreflight } from './_cors.js'

const PROVIDERS = {
  nvidia: {
    base: 'https://integrate.api.nvidia.com/v1',
    // The 8B VL default returns HTTP 410 (retired, live probe 2026-11-22). Omni is the app's own NVIDIA primary.
    defaultModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  },
  groq: {
    base: 'https://api.groq.com/openai/v1',
    defaultModel: 'qwen/qwen3.8-27b',
  },
  openai: {
    base: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  openrouter: {
    base: 'https://openrouter.ai/api/v1',
    defaultModel: 'nvidia/nemotron-nano-12b-v2-vl:free',
  },
  anthropic: {
    base: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    kind: 'anthropic',
  },
  google: {
    base: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash',
  },
  deepseek: {
    base: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  custom: {
    baseFromBody: true,
    defaultModel: 'gpt-4o',
  },
}

function nvidiaThinkStyle(model) {
  const m = String(model || '').toLowerCase()
  if (/nemotron-3-nano-omni|a3b-reasoning/.test(m)) return 'enable_thinking'
  if (/nemotron-nano-12b|nemotron-nano-9b/.test(m)) return 'slash_think'
  if (/llama-3\.1-nemotron/.test(m)) return 'detailed_thinking'
  if (/nemotron/.test(m)) return 'enable_thinking'
  return 'none'
}

function stripSlashThinkTags(text) {
  return String(text || '')
    .replace(/^\s*\/(?:no_)?think\b\s*/i, '')
    .replace(/\s*\/(?:no_)?think\b/gi, '')
    .replace(/^\s*detailed thinking (?:on|off)\s*/i, '')
    .trimStart()
}

function applyNvidiaThinkMessages(messages, model, thinkOn) {
  const style = nvidiaThinkStyle(model)
  const cleaned = messages.map((m) => {
    if (m.role !== 'system' && m.role !== 'user') return m
    if (typeof m.content !== 'string') return m
    return { ...m, content: stripSlashThinkTags(m.content) }
  })
  if (style === 'slash_think' && thinkOn) {
    const systemIndex = cleaned.findIndex((m) => m.role === 'system')
    if (systemIndex >= 0 && typeof cleaned[systemIndex].content === 'string') {
      const rest = cleaned[systemIndex].content
      cleaned[systemIndex] = { ...cleaned[systemIndex], content: rest ? `/think\n${rest}` : '/think' }
    } else {
      cleaned.unshift({ role: 'system', content: '/think' })
    }
  }
  if (style === 'detailed_thinking') {
    const prefix = thinkOn ? 'detailed thinking on' : 'detailed thinking off'
    const systemIndex = cleaned.findIndex((m) => m.role === 'system')
    if (systemIndex >= 0 && typeof cleaned[systemIndex].content === 'string') {
      const rest = cleaned[systemIndex].content
      cleaned[systemIndex] = { ...cleaned[systemIndex], content: rest ? `${prefix}\n${rest}` : prefix }
    } else {
      cleaned.unshift({ role: 'system', content: prefix })
    }
  }
  return cleaned
}

const CODING_RE =
  /\b(algorithm|leetcode|complexity|big\s*o|implement\s+(a|the|this)?\s*function|whiteboard|system design|debug|compile error|time complexity|space complexity|binary search|dynamic programming|dfs|bfs|linked list|hash map|recursion)\b/i

const TECHNICAL_EXPLANATION_RE =
  /\b(explain|what(?:'s| is| are)|describe|how does|how do|define|difference between|compare)\b/i
const TECHNICAL_ACTION_RE = /\b(write|implement|code|debug|fix|solve)\b/i
const TECHNICAL_SUBJECT_RE =
  /\b(transformers?|attention|neural network|machine learning|deep learning|model architecture|software architecture|distributed system|database|sql|nosql|api|rest|graphql|grpc|microservice|cache|redis|kafka|docker|kubernetes|cloud|aws|azure|gcp|http|tcp|udp|dns|oauth|jwt|cors|encryption|hashing|thread|process|concurrency|deadlock|mutex|semaphore|event loop|promise|async|react|node\.?js|python|java|javascript|typescript|data structure|algorithm|binary search|recursion|complexity)\b/i

const CANDIDATE_EXPERIENCE_RE =
  /\b(tell me about yourself|introduce yourself|walk me through your (background|experience|resume|cv|career)|tell me (about )?your (experience|background|resume|cv|career|work|projects?|skills?)|describe your (experience|background|resume|career)|what(?:'s| is) your (experience|background|strength|weakness)|why (should|would) (we|they) hire you|have you (ever )?(used|worked|built|led|done)|did you (use|work|build|lead)|your experience (with|in|using)|experience with .{0,40}\b(you|your|i|my)\b|\byour\b.{0,30}\b(experience|background|resume|cv|projects?|skills?)\b|\bmy\b.{0,30}\b(experience|background|resume|cv|projects?)\b)/i

const BEHAVIORAL_RE =
  /\b(tell me about a time|star method|behavioral|conflict with|leadership example|weakness|strength|challenging (project|situation)|how did you handle)\b/i

const JD_FIT_RE =
  /\b(job description|fit for (the|this) role|why (should|would) (we|they) hire|am i (a )?good fit|match (the|this) (role|jd|job)|gap (analysis|against)|how (do|does) my (resume|background|experience) (fit|match))\b/i

const JD_FACT_RE =
  /\b((this|the) (jd|job description|role|position)|what does (this|the) (role|jd|job)|does (the|this) (jd|job|role)|requirements? (for|of|in) (this|the) (role|jd|job)|qualifications? (for|of|in) (this|the)|job description (say|mention|require|list)|top skills for (this|the) role)\b/i

const IDENTITY_RE =
  /\b(what('s| is) your name|who are you|introduce yourself|tell me about yourself|walk me through your background|tell me your experience)\b/i

const DEFINITIONAL_RE =
  /^(?:ok(?:ay)?[,.]?\s*|so[,.]?\s*|hey[,.]?\s*|please\s+|can you\s+|could you\s+|quick\s+)?(?:what(?:'s| is| are| does| do)|who(?:'s| is| are)|where(?:'s| is| are)|when(?:'s| is| was| were)|which|define|explain|describe|tell me (?:about|what)|how does|how do|difference between|compare)\b/i

function isCandidateExperienceQuestion(question) {
  const q = String(question || '')
  if (!q.trim()) return false
  return CANDIDATE_EXPERIENCE_RE.test(q) || IDENTITY_RE.test(q) || BEHAVIORAL_RE.test(q)
}

function isTechnicalConceptQuestion(question) {
  const q = String(question || '')
  if (isCandidateExperienceQuestion(q)) return false
  return TECHNICAL_EXPLANATION_RE.test(q) && TECHNICAL_SUBJECT_RE.test(q) && !TECHNICAL_ACTION_RE.test(q)
}

function isGeneralKnowledgeQuestion(question) {
  const q = String(question || '').trim()
  if (!q || isCandidateExperienceQuestion(q) || JD_FIT_RE.test(q) || JD_FACT_RE.test(q)) return false
  if (CODING_RE.test(q) || TECHNICAL_ACTION_RE.test(q)) return false
  if (isTechnicalConceptQuestion(q)) return true
  return DEFINITIONAL_RE.test(q)
}

function routeQuestion(question, hasProfile, hasJd, source = 'manual_input') {
  const q = String(question || '').trim()
  let useResume = false
  let useJd = false
  let answerContract = 'interview_detailed'

  if (CODING_RE.test(q)) {
    answerContract = 'coding_answer'
  } else if (IDENTITY_RE.test(q) && hasProfile) {
    useResume = true
  } else if (JD_FIT_RE.test(q) && (hasJd || hasProfile)) {
    useResume = hasProfile
    useJd = hasJd
  } else if (JD_FACT_RE.test(q) && hasJd && !isCandidateExperienceQuestion(q)) {
    useJd = true
  } else if ((BEHAVIORAL_RE.test(q) || isCandidateExperienceQuestion(q)) && hasProfile) {
    useResume = true
  } else if (isTechnicalConceptQuestion(q) || isGeneralKnowledgeQuestion(q)) {
    answerContract = 'general_assistant'
  } else if (hasProfile) {
    useResume = true
  }

  return { useResume, useJd, answerContract }
}

function buildSystemPrompt({
  profileText,
  jobDescription,
  interviewTopic,
  customInstructions,
  answerStructure,
  responseFormat,
  answerLength,
  useResume,
  useJd,
  answerContract,
}) {
  const parts = [
    'You are VeilAssist, a private interview copilot on the user\'s phone.',
    'The user is in a live job interview. Give the DIRECT ANSWER they should speak — first person, natural, confident.',
    'Do NOT introduce yourself as an AI. Do NOT coach from outside ("the interviewer asked...").',
  ]

  if (answerContract === 'coding_answer') {
    parts.push(
      'This is a coding/implementation question. Give clear technical steps or pseudocode.',
      'Do NOT invent personal work history — use general engineering knowledge.',
    )
  } else if (answerContract === 'general_assistant' || answerContract === 'technical_explanation') {
    parts.push(
      'This question is general knowledge or a technical concept — NOT about the candidate\'s personal résumé.',
      'Answer from world knowledge. Do not claim personal experience the user did not provide.',
    )
  } else {
    parts.push(
      'For questions about the candidate\'s background, experience, projects, or fit — ground answers ONLY in the profile below.',
      'Never invent employers, dates, or achievements not in the profile.',
      'For unrelated general questions, answer from expertise without fabricating personal history.',
    )
  }

  if (answerStructure === 'star') {
    parts.push('Use STAR (Situation, Task, Action, Result) for behavioral questions — keep it natural, max 4 short sentences.')
  } else if (answerStructure === 'car') {
    parts.push('Use CAR (Context, Action, Result) for behavioral questions — keep it natural and spoken.')
  } else if (answerStructure === 'soar') {
    parts.push('Use SOAR (Situation, Obstacle, Action, Result) for behavioral questions.')
  } else if (answerStructure === 'par') {
    parts.push('Use PAR (Problem, Action, Result) for behavioral questions.')
  } else if (answerStructure === 'soara') {
    parts.push('Use SOARA (Situation, Objective, Action, Result, Aftermath) for behavioral questions.')
  }

  if (responseFormat === 'conversational') {
    parts.push('Format as a natural spoken answer — short sentences, light filler is OK.')
  } else if (responseFormat === 'example') {
    parts.push('Lead with the point, then illustrate with a concrete example from the profile when one exists.')
  } else {
    parts.push('Format the answer as short bullet points the candidate can scan quickly.')
  }

  if (answerLength === 'short') parts.push('Target under 80 words.')
  else if (answerLength === 'long') parts.push('Up to 250 words if technical depth is needed.')
  else parts.push('Target under 180 words.')

  if (interviewTopic?.trim()) {
    parts.push(`Interview focus / role topic: ${interviewTopic.trim().slice(0, 500)}`)
  }

  if (customInstructions?.trim()) {
    parts.push(`Custom instructions: ${customInstructions.trim().slice(0, 2000)}`)
  }

  if (useResume && profileText?.trim()) {
    parts.push(`\n## CANDIDATE PROFILE (use for personal/behavioral questions only)\n${profileText.trim().slice(0, 8000)}`)
  }

  if (useJd && jobDescription?.trim()) {
    parts.push(`\n## JOB DESCRIPTION\n${jobDescription.trim().slice(0, 4000)}`)
  }

  return parts.join('\n')
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const question = String(body.question || '').trim()
    if (!question) {
      res.status(400).json({ error: 'Missing question text' })
      return
    }

    const provider = String(body.provider || 'nvidia').toLowerCase()
    const providerCfg = PROVIDERS[provider]
    if (!providerCfg) {
      res.status(400).json({ error: 'Unsupported provider' })
      return
    }

    const apiKey = String(body.apiKey || '').trim() || process.env.NVIDIA_API_KEY || ''
    if (!apiKey) {
      res.status(400).json({
        error: 'Add your API key in Settings → AI Providers (or configure NVIDIA_API_KEY on server).',
      })
      return
    }

    const baseUrl = providerCfg.baseFromBody
      ? String(body.customBaseUrl || '').trim().replace(/\/$/, '') || 'https://api.openai.com/v1'
      : providerCfg.base

    const profileText = String(body.profileText || body.resume || '').trim()
    const jobDescription = String(body.jobDescription || '').trim()
    const interviewTopic = String(body.interviewTopic || '').trim()
    const customInstructions = String(body.customInstructions || '').trim()
    const answerStructure = body.answerStructure || 'star'
    const responseFormat = body.responseFormat || 'bullets'
    const answerLength = body.answerLength || 'medium'
    const think = body.think === true
    const source = body.source || 'manual_input'
    const model = String(body.model || providerCfg.defaultModel).trim()

    const hasProfile = profileText.length > 40
    const hasJd = jobDescription.length > 20
    const route = routeQuestion(question, hasProfile, hasJd, source)

    const systemPrompt = buildSystemPrompt({
      profileText,
      jobDescription,
      interviewTopic,
      customInstructions,
      answerStructure,
      responseFormat,
      answerLength,
      useResume: route.useResume,
      useJd: route.useJd,
      answerContract: route.answerContract,
    })

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: think
          ? `Interview question (think briefly, then answer):\n\n${question}`
          : `Interview question:\n\n${question}`,
      },
    ]

    const thinkOn = Boolean(think)
    const payload = {
      model,
      messages: applyNvidiaThinkMessages(messages, model, thinkOn),
      max_tokens: thinkOn ? 1600 : answerLength === 'long' ? 1800 : answerLength === 'short' ? 600 : 1400,
      temperature: thinkOn ? 0.5 : 0,
      stream: false,
    }
    if (thinkOn) payload.top_p = 0.9

    if (nvidiaThinkStyle(model) === 'enable_thinking') {
      payload.chat_template_kwargs = { enable_thinking: thinkOn }
    }

    if (providerCfg.kind === 'anthropic') {
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: payload.max_tokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: question }],
        }),
      })
      const anthropicText = await anthropicRes.text()
      if (!anthropicRes.ok) {
        res.status(anthropicRes.status).json({
          error: `Provider API error (${anthropicRes.status})`,
          detail: anthropicText.slice(0, 500),
        })
        return
      }
      const anthropicData = JSON.parse(anthropicText)
      const anthropicAnswer =
        anthropicData?.content?.find((c) => c.type === 'text')?.text?.trim() || ''
      if (!anthropicAnswer) {
        res.status(502).json({ error: 'Empty response from model' })
        return
      }
      res.status(200).json({
        answer: anthropicAnswer,
        model,
        route: {
          useResume: route.useResume,
          useJd: route.useJd,
          answerContract: route.answerContract,
        },
      })
      return
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://veilassist-web.vercel.app'
      headers['X-Title'] = 'VeilAssist Interview'
    }

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `Provider API error (${upstream.status})`,
        detail: text.slice(0, 500),
      })
      return
    }

    const data = JSON.parse(text)
    const answer = data?.choices?.[0]?.message?.content?.trim() || ''
    if (!answer) {
      res.status(502).json({ error: 'Empty response from model' })
      return
    }

    res.status(200).json({
      answer,
      model,
      route: {
        useResume: route.useResume,
        useJd: route.useJd,
        answerContract: route.answerContract,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Chat request failed' })
  }
}
