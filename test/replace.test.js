'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { planReplacements, preserveCase } = require('../src/replace');
const { iterateMatches } = require('../src/search');
const document = { text: 'Cat cat CAT', version: 2, eol: '\n' },
  uri = 'file:///test.js';
const matches = [...iterateMatches(document.text, { query: 'cat' }, { uri, documentVersion: 2 })];
test('replacement plans support literal text, captures, case and editor ranges', () => {
  const plans = planReplacements(matches, new Map([[uri, document]]), {
    replacement: 'dog',
    preserveCase: true
  });
  assert.deepEqual(
    plans.map((p) => p.replacement),
    ['Dog', 'dog', 'DOG']
  );
  const regex = [
    ...iterateMatches(
      'one:42',
      { query: '(\\w+):(\\d+)', regex: true, caseSensitive: true },
      { uri }
    )
  ];
  const mapped = planReplacements(regex, new Map([[uri, { text: 'one:42' }]]), {
    replacement: '$2-$1',
    regex: true
  });
  assert.equal(mapped[0].replacement, '42-one');
  assert.equal(
    planReplacements(matches, new Map([[uri, document]]), { replacement: '$1', regex: false })[0]
      .replacement,
    '$1'
  );
});
test('replacement rejects stale document versions, text, and overlapping edits', () => {
  assert.throws(
    () => planReplacements(matches, new Map([[uri, { ...document, version: 3 }]]), {}),
    /changed/
  );
  assert.throws(
    () => planReplacements(matches, new Map([[uri, { ...document, text: 'Cat dog CAT' }]]), {}),
    /stale/
  );
  assert.throws(
    () => planReplacements([matches[0], matches[0]], new Map([[uri, document]]), {}),
    /overlap/
  );
});
test('replacement preserves line endings and handles empty preserve-case replacements', () => {
  assert.equal(preserveCase('', 'Cat'), '');
  assert.equal(
    planReplacements(matches.slice(0, 1), new Map([[uri, { ...document, eol: '\r\n' }]]), {
      replacement: 'a\nb'
    })[0].replacement,
    'a\r\nb'
  );
});
