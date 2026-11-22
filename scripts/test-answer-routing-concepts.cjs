// Copyright (c) 2026 VeilAssist. All rights reserved.
// Explain-it vs. code-it routing. Found by the live feature matrix: topic words in the old coding regex
// (hash map, system design, complexity, recursion, binary search, linked list...) sent 10 of 12 concept questions
// to the coding contract, and two real code requests ("code an LRU cache", "write a SQL query") missed it.
//
//   node --test scripts/test-answer-routing-concepts.cjs

const test = require('node:test')
const assert = require('node:assert/strict')
const { routeContext } = require('../lib/contextRouter.js')

const route = (userQuery, mode = 'technical-interview') =>
  routeContext({ userQuery, mode, profileAvailable: true, jdAvailable: false, hasLiveTranscript: false, source: 'what_to_answer' })

const CONCEPTS = [
  'How does a hash map work?',
  'Explain how a hash map handles collisions.',
  'What is time complexity?',
  'What is the difference between BFS and DFS?',
  'What is recursion?',
  'Explain dynamic programming in simple terms.',
  'What is the time complexity of binary search?',
  'How do I prepare for a system design interview?',
  'What is a linked list?',
  'Why would you use a hashmap over an array?',
  'What is a mutex?',
  'Explain the CAP theorem.',
]

const CODE_REQUESTS = [
  'Write a function to reverse a linked list.',
  'Implement binary search in Java.',
  'Implement binary search in O(log n)',
  'Solve the two sum problem.',
  'Given a string, find the longest substring without repeating characters.',
  'Longest Substring Without Repeating Characters',
  'Find the First Non-Repeating Character in a String',
  'Can you code an LRU cache?',
  'Write a SQL query to find the second highest salary.',
  'Explain how to implement a linked list in Python.',
  'can you provide me the code to convert a list into a linked list?',
  'me the code to import a model from the hugging face',
  'Debug this: my function returns undefined.',
]

for (const q of CONCEPTS) {
  test(`concept question is explained, not coded: ${q}`, () => {
    assert.notEqual(route(q).answerContract, 'coding_answer', q)
  })
}

for (const q of CODE_REQUESTS) {
  test(`code request gets the coding contract: ${q}`, () => {
    const r = route(q)
    assert.equal(r.answerContract, 'coding_answer', q)
    assert.equal(r.plan.profileContextPolicy, 'forbidden', 'a coding answer never pulls the resume')
  })
}

test('concept questions about core CS topics use the technical explanation contract (no STAR, no resume)', () => {
  for (const q of ['How does a hash map work?', 'What is a linked list?', 'What is the difference between BFS and DFS?']) {
    const r = route(q)
    assert.equal(r.answerContract, 'technical_explanation', q)
    assert.equal(r.useResume, false, q)
  }
})

test('a behavioral question that mentions debugging is still behavioral', () => {
  const r = route('Tell me about a time you debugged a hard production issue.')
  assert.notEqual(r.answerContract, 'coding_answer')
})
