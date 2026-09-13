// Copyright (c) 2026 VeilAssist. All rights reserved.
// Cluely-style starter modes — pre-built real-time prompts + notes templates.
// CommonJS — required by Electron main (meetingModeDetector).

const SALES_NOTES = [
  {
    title: 'Action items',
    instructions: 'All action items that were said I would do after the meeting.',
  },
  {
    title: 'Outcome',
    instructions: 'Did I close the sale and what was the outcome of the conversation.',
  },
  {
    title: 'Prospect background',
    instructions: 'Background and context on who I was selling to.',
  },
  {
    title: 'Discovery',
    instructions: 'What the prospect said during discovery.',
  },
  {
    title: 'Product',
    instructions: "How I pitched the product and the prospect's reaction.",
  },
  {
    title: 'Objections',
    instructions: 'Objections from the prospect if there were any.',
  },
]

const RECRUITING_NOTES = [
  {
    title: 'Action items',
    instructions: 'All action items that I have to do after the meeting.',
  },
  {
    title: 'Experience and skills',
    instructions: "Candidate's previous work experience and skills discussed.",
  },
  {
    title: 'Quality of responses',
    instructions:
      'If there were questions asked, how well and how accurately the candidate answered each question.',
  },
  {
    title: 'Interest in company',
    instructions: 'What the candidate said about their interest in the company.',
  },
  {
    title: 'Role expectations',
    instructions: 'Anything discussed about the position, salary expectations, etc.',
  },
]

const MEETING_NOTES = [
  { title: 'Overview', instructions: 'Brief summary of what the meeting was about.' },
  { title: 'Decisions', instructions: 'Key decisions made and who agreed.' },
  { title: 'Action items', instructions: 'Tasks, owners, and deadlines mentioned.' },
  { title: 'Open questions', instructions: 'Unresolved topics to follow up on.' },
]

const LECTURE_NOTES = [
  { title: 'Overview', instructions: 'Main topic and learning objectives covered.' },
  { title: 'Key concepts', instructions: 'Definitions, frameworks, and core ideas.' },
  { title: 'Examples', instructions: 'Worked examples or case studies discussed.' },
]

const MODE_TEMPLATES = [
  {
    id: 'tmpl-general',
    name: 'General',
    description: 'Balanced assistant for everyday questions, notes, and quick help.',
    color: '#6366f1',
    icon: 'general',
    content:
      'Help me during live conversations. Answer clearly, stay concise, and use my reference files for facts — do not invent details.',
    notesTemplate: [{ title: 'Overview', instructions: 'Instructions for VeilAssist.' }],
  },
  {
    id: 'tmpl-sales',
    name: 'Sales',
    description: 'Close deals with strategic discovery and objection handling.',
    color: '#ec4899',
    icon: 'sales',
    content:
      'I am a salesperson selling to a prospective buyer. Help me ask quality discovery questions, handle objections, and close the sale.',
    notesTemplate: SALES_NOTES,
  },
  {
    id: 'tmpl-recruiting',
    name: 'Recruiting',
    description: 'Evaluate candidates with structured interview insights.',
    color: '#f59e0b',
    icon: 'recruiting',
    content:
      'I am interviewing a candidate. Help me evaluate their answers, ask strong follow-up questions, and keep structured interview notes.',
    notesTemplate: RECRUITING_NOTES,
  },
  {
    id: 'tmpl-interview',
    name: 'Looking for work',
    description: 'Answer interview questions with confidence and clarity.',
    color: '#3b82f6',
    icon: 'interview',
    content:
      'I am in a job interview as the interviewee. When a question appears (from audio or screen), give me the DIRECT ANSWER I should speak — in first person, naturally. Do NOT coach from outside or describe the question. Structure, length, and response format are controlled by ## INTERVIEW OUTPUT CONTRACT (General → Answers settings) — obey that contract; do not hardcode STAR or a fixed word count. Use my reference files for real experience — never fabricate.',
    notesTemplate: [
      { title: 'Questions asked', instructions: 'Interview questions I was asked.' },
      { title: 'My answers', instructions: 'How I responded and what landed well.' },
      { title: 'Follow-ups', instructions: 'Topics to prepare for the next round.' },
    ],
  },
  {
    id: 'tmpl-meeting',
    name: 'Team meet',
    description: 'Track action items and key decisions from meetings.',
    color: '#14b8a6',
    icon: 'meeting',
    content:
      'I am in a team meeting. Help me capture decisions, action items, owners, and open questions as the conversation unfolds.',
    notesTemplate: MEETING_NOTES,
  },
  {
    id: 'tmpl-lecture',
    name: 'Lecture',
    description: 'Capture key concepts and content from lectures or training.',
    color: '#a855f7',
    icon: 'lecture',
    content:
      'I am in a lecture or training session. Help me extract key concepts, definitions, and summaries I can review later.',
    notesTemplate: LECTURE_NOTES,
  },
  {
    id: 'tmpl-gen-ai',
    name: 'Gen AI engineer',
    description: 'Technical depth for ML, LLMs, RAG, and cloud AI systems.',
    color: '#0ea5e9',
    icon: 'gen-ai',
    content: `I am a Gen AI / ML engineer in a technical interview as the interviewee. When a question appears (from audio or screen), give me the DIRECT ANSWER I should speak in first person — do NOT describe the question or coach from outside. Keep answers concise and technically precise.

- Design and ship production LLM features: RAG, agents, evals, guardrails.
- Strong Python; comfortable with AWS, Azure, GCP and their data services.
- Database design across SQL and NoSQL; optimization and indexing.
- Data streaming (Kafka, Kinesis) and batch pipelines.
- Agile delivery; CI/CD for ML and app services.
- Prompt engineering, fine-tuning tradeoffs, and cost/latency awareness.

Use my reference files for my actual projects and resume — never fabricate experience.`,
    notesTemplate: [
      { title: 'Technical topics', instructions: 'Systems, models, and architecture discussed.' },
      { title: 'My experience', instructions: 'Projects and skills I highlighted.' },
      { title: 'Gaps to study', instructions: 'Areas to review before the next conversation.' },
    ],
  },
  {
    id: 'tmpl-data-science',
    name: 'Data science',
    description: 'Analysis, modeling, and clear communication of insights.',
    color: '#8b5cf6',
    icon: 'data-science',
    content:
      'I am in a data science interview as the interviewee. When a question appears (from audio or screen), give me the DIRECT ANSWER I should speak in first person — do NOT describe the question or coach from outside. Frame problems clearly, explain models in plain language, and use my reference files for real project work.',
    notesTemplate: [
      { title: 'Problem framing', instructions: 'Objective, data sources, and success metrics.' },
      { title: 'Approach', instructions: 'Models, features, and methodology discussed.' },
      { title: 'Results & next steps', instructions: 'Findings, limitations, and follow-up work.' },
    ],
  },
]

module.exports = { MODE_TEMPLATES }
