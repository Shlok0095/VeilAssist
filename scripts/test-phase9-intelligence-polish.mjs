/**
 * Phase 9 smoke test — profile tree v2, domain routing, answer diversity, reference vectors.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const root = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(root, '..')
const require = createRequire(import.meta.url)

const {
  parseResumeTree,
  formatResumeBlockV2,
  buildProfileTreeV2VoiceGuard,
  selectRelevantSections,
} = require(path.join(appRoot, 'lib/profileTreeService.js'))
const { routeContext, inferDomainTag, formatDomainRoutingBlock } = require(path.join(appRoot, 'lib/contextRouter.js'))
const { resolveChatInferenceParams, buildAnswerDiversityHint } = require(path.join(appRoot, 'lib/aiClient.js'))
const cv = require(path.join(appRoot, 'lib/contextVectorStore.js'))
const storeSchema = require(path.join(appRoot, 'lib/store.js')).schema

for (const key of ['profileTreeV2Enabled', 'answerDiversityEnabled', 'referenceVectorIndexEnabled']) {
  if (!storeSchema[key]) throw new Error(`store missing ${key}`)
}

const resume = `Summary\nProduct engineer\n\nExperience\nBuilt pricing dashboards at Acme\n\nSkills\nPython, SQL`
const tree = parseResumeTree(resume)
const picked = selectRelevantSections(tree, 'tell me about pricing experience', { maxSections: 2 })
if (!picked.experience) throw new Error('selectRelevantSections missed experience')

const block = formatResumeBlockV2(tree, resume, 'pricing dashboards')
if (!block.toLowerCase().includes('pricing')) throw new Error('formatResumeBlockV2 failed')

const guard = buildProfileTreeV2VoiceGuard()
if (!guard.includes('first person')) throw new Error('voice guard missing')

const salesRoute = routeContext({
  userQuery: 'How do we handle pricing objections in the demo?',
  mode: 'sales',
  profileAvailable: true,
  jdAvailable: false,
  referenceFilesAvailable: true,
  hasLiveTranscript: true,
  source: 'manual_input',
})
if (salesRoute.domainTag !== 'sales') throw new Error(`expected sales domain, got ${salesRoute.domainTag}`)
if (!formatDomainRoutingBlock('interview').includes('interview')) throw new Error('domain block failed')

const divOff = resolveChatInferenceParams((k) => (k === 'answerDiversityEnabled' ? false : null), 'hello')
if (divOff.temperature !== 0) throw new Error('diversity off temperature wrong')
const divOn = resolveChatInferenceParams((k) => (k === 'answerDiversityEnabled' ? true : null), 'pricing objection')
if (!divOn.diversity || divOn.temperature <= 0.2) throw new Error('diversity on params wrong')
if (!buildAnswerDiversityHint()) throw new Error('diversity hint empty')

const mem = { data: {} }
const store = {
  get: (k) => {
    if (k === 'contextIndexMeta') return mem.data.contextIndexMeta
    if (k === 'referenceVectorIndexEnabled') return mem.data.referenceVectorIndexEnabled
    return mem.data[k]
  },
  set: (k, v) => {
    mem.data[k] = v
  },
}

cv.indexAllPrompts(
  [
    {
      id: 'p1',
      name: 'Sales',
      referenceFiles: [{ id: 'f1', name: 'Playbook', text: 'Pricing objection: emphasize ROI and pilot timeline. '.repeat(80) }],
    },
  ],
  store,
)

const hits = cv.retrieveChunks('p1', 'pricing objection ROI', { topK: 3 }, store)
if (!hits.length) throw new Error('keyword retrieve failed')

console.log('OK phase9 intelligence-polish', {
  domain: salesRoute.domainTag,
  diversityTemp: divOn.temperature,
  refHits: hits.length,
})
