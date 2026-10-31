#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Resume upload matches Interview Man: PDF goes to /v1/responses as input_file,
// ParsedCV schema, and an empty extract is not saved.
//   node scripts/test-resume-upload.cjs

const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const {
  CV_PARSER_PROMPT,
  PARSED_CV_SCHEMA,
  responsesRoot,
  buildCvResponsesBody,
  buildCvTextResponsesBody,
  cvFileUploadSupported,
  buildResumeParseMessages,
  parseResumeProfileResponse,
  formatResumeProfile,
  formatCvDuration,
  requestParsedCv,
  topicFromResume,
} = require('../lib/resumeProfile.cjs')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

const checks = []
function check(name, fn) {
  checks.push({ name, fn })
}

const parsedCv = {
  name: 'Ada Lovelace',
  professional_summary: 'Builds analytical engines.',
  work_history: [
    {
      role: 'Engineer',
      company: 'Analytical Engines',
      start_date: '2020-01',
      end_date: null,
      description: 'Designed difference engines.',
    },
    {
      role: 'Mathematician',
      company: 'Royal Society',
      start_date: '2018-03',
      end_date: '2019-11',
      description: 'Published notes.',
    },
  ],
  skills: ['Mathematics', 'Algorithms'],
  projects: [
    {
      name: 'Note G',
      description: 'A program for the engine.',
      technologies: 'Analytical Engine',
    },
  ],
  education: [{ degree: 'Mathematics', field: 'University of London' }],
  suggested_interview_type: 'Machine learning engineer',
}

function responsesPayload(text) {
  return {
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text }],
      },
    ],
  }
}

function mockFetch(handler) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return handler(calls.length, url, init)
  }
  return { fetchImpl, calls }
}

check('parser prompt and ParsedCV schema match Interview Man', () => {
  assert.match(CV_PARSER_PROMPT, /^You are a CV\/resume parser\./)
  assert.match(CV_PARSER_PROMPT, /use null for end_date/)
  assert.match(CV_PARSER_PROMPT, /Do not make up information that is not in the CV/)
  assert.deepEqual(PARSED_CV_SCHEMA.required, [
    'name',
    'professional_summary',
    'work_history',
    'skills',
    'projects',
    'education',
    'suggested_interview_type',
  ])
  assert.deepEqual(PARSED_CV_SCHEMA.properties.work_history.items.required, [
    'role',
    'company',
    'start_date',
    'end_date',
    'description',
  ])
  assert.equal(PARSED_CV_SCHEMA.additionalProperties, false)
})

check('a PDF is posted as input_file to /v1/responses', () => {
  assert.equal(responsesRoot('https://api.openai.com/v1'), 'https://api.openai.com')
  assert.equal(responsesRoot('https://integrate.api.nvidia.com/v1/'), 'https://integrate.api.nvidia.com')
  const body = buildCvResponsesBody('gpt-test', 'QUJD')
  assert.equal(body.model, 'gpt-test')
  assert.equal(body.input[0].role, 'system')
  assert.equal(body.input[0].content, CV_PARSER_PROMPT)
  assert.equal(body.input[1].content[0].text, 'Please extract the information from this CV/resume:')
  assert.equal(body.input[1].content[1].type, 'input_file')
  assert.equal(body.input[1].content[1].filename, 'resume.pdf')
  assert.equal(body.input[1].content[1].file_data, 'data:application/pdf;base64,QUJD')
  assert.equal(body.text.format.type, 'json_schema')
  assert.equal(body.text.format.name, 'ParsedCV')
  assert.equal(body.text.format.strict, true)
  assert.equal(body.text.format.schema, PARSED_CV_SCHEMA)
})

check('ParsedCV fields become the same profile cards', () => {
  const profile = parseResumeProfileResponse(JSON.stringify(parsedCv))
  assert.ok(profile)
  const block = formatResumeProfile(profile)
  assert.match(block, /^Name: Ada Lovelace/m)
  assert.match(block, /^Professional Summary: Builds analytical engines\./m)
  assert.match(block, /Role: Engineer, Company: Analytical Engines, Duration: Jan 2020 - Present, Description: Designed difference engines\./)
  assert.match(block, /Role: Mathematician, Company: Royal Society, Duration: Mar 2018 - Nov 2019, Description: Published notes\./)
  assert.match(block, /^Skills: Mathematics, Algorithms/m)
  assert.match(block, /Project: Note G, Technologies: Analytical Engine, Description: A program for the engine\./)
  assert.match(block, /Degree: Mathematics, Field: University of London/)
  assert.equal(topicFromResume(profile), 'Machine learning engineer')
  assert.equal(formatCvDuration('2020', null), 'Jan 2020 - Present')
})

check('an empty ParsedCV is not a profile', () => {
  const empty = parseResumeProfileResponse(JSON.stringify({
    name: null,
    professional_summary: null,
    work_history: null,
    skills: null,
    projects: null,
    education: null,
    suggested_interview_type: null,
  }))
  assert.equal(empty, null)
  assert.equal(parseResumeProfileResponse('not json'), null)
})

check('text resumes still use the same parser prompt', () => {
  const messages = buildResumeParseMessages('Ada Lovelace\nEngineer at Analytical Engines')
  assert.equal(messages[0].content, CV_PARSER_PROMPT)
  assert.match(messages[1].content, /^Please extract the information from this CV\/resume:/)
  assert.match(messages[1].content, /professional_summary/)
  assert.match(messages[1].content, /Ada Lovelace/)
})

check('responses success maps the file and retries a server error', async () => {
  const { fetchImpl, calls } = mockFetch(async (n) => {
    if (n === 1) return { status: 500, async text() { return 'busy' } }
    return { status: 200, async text() { return JSON.stringify(responsesPayload(JSON.stringify(parsedCv))) } }
  })
  let slept = 0
  const profile = await requestParsedCv({
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'gpt-test',
    pdfBase64: 'QUJD',
    fetchImpl,
    sleep: async () => { slept += 1 },
  })
  assert.equal(calls.length, 2)
  assert.equal(slept, 1)
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key')
  const sent = JSON.parse(calls[0].init.body)
  assert.equal(sent.input[1].content[1].file_data, 'data:application/pdf;base64,QUJD')
  assert.equal(profile.name, 'Ada Lovelace')
  assert.equal(profile.experience[0].dateRange, 'Jan 2020 - Present')
})

check('NVIDIA does not send the PDF, and resume text keeps the ParsedCV schema', async () => {
  assert.equal(cvFileUploadSupported('https://integrate.api.nvidia.com/v1'), false)
  assert.equal(cvFileUploadSupported('https://api.openai.com/v1'), true)
  const textBody = buildCvTextResponsesBody('nvidia/test', 'Ada Lovelace, Engineer')
  assert.equal(textBody.input[1].content.some((part) => part.type === 'input_file'), false)
  assert.match(textBody.input[1].content[0].text, /Ada Lovelace, Engineer/)
  assert.equal(textBody.text.format.name, 'ParsedCV')
  assert.equal(textBody.text.format.strict, true)
  const { fetchImpl, calls } = mockFetch(async () => ({
    status: 200,
    async text() { return JSON.stringify(responsesPayload(JSON.stringify(parsedCv))) },
  }))
  const profile = await requestParsedCv({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: 'test-key',
    model: 'nvidia/test',
    resumeText: 'Ada Lovelace, Engineer',
    fetchImpl,
    sleep: async () => {},
  })
  const sent = JSON.parse(calls[0].init.body)
  assert.equal(sent.input[1].content.some((part) => part.type === 'input_file'), false)
  assert.equal(profile.experience[0].dateRange, 'Jan 2020 - Present')
  const { fetchImpl: safetyFetch } = mockFetch(async () => ({
    status: 422,
    async text() { return JSON.stringify({ error: { message: 'input rejected by content safety screening' } }) },
  }))
  await assert.rejects(
    () => requestParsedCv({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: 'test-key',
      model: 'nvidia/test',
      pdfBase64: 'QUJD',
      fetchImpl: safetyFetch,
      sleep: async () => {},
    }),
    (err) => err.status === 422 && err.code === 'RESPONSES_UNSUPPORTED' && /content safety screening/.test(err.message),
  )
})

check('a missing responses API is reported so text can be used instead', async () => {
  const cases = [
    { status: 404, body: '404 page not found' },
    { status: 422, body: 'input_file is not supported' },
  ]
  for (const response of cases) {
    const { fetchImpl } = mockFetch(async () => ({
      status: response.status,
      async text() { return response.body },
    }))
    await assert.rejects(
      () => requestParsedCv({
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey: 'test-key',
        model: 'nvidia/test',
        pdfBase64: 'QUJD',
        fetchImpl,
        sleep: async () => {},
      }),
      (err) => err.code === 'RESPONSES_UNSUPPORTED' && err.status === response.status,
    )
  }
  const { fetchImpl } = mockFetch(async () => { throw new Error('socket hang up') })
  await assert.rejects(
    () => requestParsedCv({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: 'test-key',
      model: 'nvidia/test',
      pdfBase64: 'QUJD',
      fetchImpl,
      sleep: async () => {},
    }),
    (err) => err.code === 'RESPONSES_UNSUPPORTED' && err.status === 0,
  )
})

check('a bad file, a refusal, and an empty extract are not saved', async () => {
  const cases = [
    [{ status: 400, body: '{"error":{"message":"bad pdf"}}' }, /corrupted or in an unsupported format/],
    [{ status: 200, body: JSON.stringify({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }) }, /unclear or contain issues/],
    [{ status: 200, body: JSON.stringify({ output: [] }) }, /No data could be extracted/],
    [{ status: 200, body: JSON.stringify(responsesPayload(JSON.stringify({
      name: null,
      professional_summary: null,
      work_history: [],
      skills: [],
      projects: [],
      education: [],
      suggested_interview_type: null,
    }))) }, /Could not extract any information from the CV/],
  ]
  for (const [response, pattern] of cases) {
    const { fetchImpl } = mockFetch(async () => ({
      status: response.status,
      async text() { return response.body },
    }))
    await assert.rejects(
      () => requestParsedCv({
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-test',
        pdfBase64: 'QUJD',
        fetchImpl,
        sleep: async () => {},
      }),
      pattern,
    )
  }
})

check('upload sends the picked file and does not save an empty extract', () => {
  const main = read('main', 'index.js')
  const handler = main.slice(main.indexOf("ipcMain.handle('resume-profile:parse'"), main.indexOf("ipcMain.handle('mode-document:parse'"))
  assert.match(handler, /requestParsedCv\(/)
  assert.match(handler, /cvFileUploadSupported\(baseURL\)/)
  assert.match(handler, /extractResumeFromPdfPages/)
  assert.match(read('lib', 'nvidiaDocumentParse.cjs'), /image\/jpeg/)
  assert.match(handler, /resumeText: text/)
  assert.match(handler, /pdfBase64/)
  assert.match(handler, /RESPONSES_UNSUPPORTED/)
  assert.match(handler, /buildResumeParseMessages\(text\)/)
  const failAt = handler.indexOf("Could not extract any information from the CV")
  const saveAt = handler.indexOf("store.set('resumeLibrary'")
  assert.ok(failAt > 0 && saveAt > failAt)
  const settings = read('renderer', 'settings', 'App.jsx')
  const upload = settings.slice(settings.indexOf('const uploadInterviewResume'), settings.indexOf('const uploadModeDocument'))
  assert.match(upload, /filePath: filePaths\[0\]/)
  assert.doesNotMatch(upload, /parse-playbook/)
})

async function main() {
  let passed = 0
  for (const { name, fn } of checks) {
    await fn()
    passed += 1
    console.log('ok', name)
  }
  console.log(`${passed} passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
