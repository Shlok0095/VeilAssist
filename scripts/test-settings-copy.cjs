#!/usr/bin/env node
const assert = require('assert')
const { polishCopy } = require('../renderer/settings/settingsCopy')

assert.equal(polishCopy('Foo — bar'), 'Foo. bar')
assert.equal(polishCopy('A – B'), 'A. B')
console.log('test-settings-copy: ok')
