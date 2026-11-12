'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { skipDiagnostics, classifySkips, incompleteSearch, completePreflight } = require('../src/search/diagnostics');

const summary = stats => skipDiagnostics(stats, { includeDetails: false });

test('modal summary distinguishes exclusions from blockers without paths or per-file reasons', () => {
  const stats = {
    skippedFiles: 3, excludedBinaryFiles: 2, blockingSkippedFiles: 1,
    skippedDetails: [
      { path: '/workspace/template.docx', reason: 'binary', format: 'ZIP', blocking: false },
      { path: '/workspace/image.png', reason: 'binary', blocking: false },
      { path: '/workspace/large.txt', reason: 'tooLarge', blocking: true }
    ], skippedDetailsOmitted: 0
  };
  assert.equal(summary(stats), '2 binary files excluded from text search; contents are not searched or replaced.\n1 file could not be searched; results are incomplete.');
  const detailed = skipDiagnostics(stats);
  assert.match(detailed, /template\.docx — ZIP container excluded/);
  assert.match(detailed, /image\.png — binary file excluded/);
  assert.match(detailed, /large\.txt — exceeds the text file size limit/);
  assert.equal(skipDiagnostics(stats, { includeDetails: true }), detailed);
  assert.equal(incompleteSearch({ truncated: false, stats }), true);
});

test('summary retains all exclusion counts without omitted-path messages', () => {
  const stats = {
    skippedFiles: 25, excludedBinaryFiles: 25, blockingSkippedFiles: 0,
    skippedDetails: Array.from({ length: 20 }, (_, index) => ({
      path: `/workspace/private-${index}.docx`, reason: 'binary', format: 'ZIP', blocking: false
    })), skippedDetailsOmitted: 5
  };
  assert.equal(summary(stats), '25 binary files excluded from text search; contents are not searched or replaced.');
  assert.match(skipDiagnostics(stats), /5 additional paths are not shown/);
  assert.equal(incompleteSearch({ truncated: false, stats }), false);
});

test('summary remains fail closed for inconsistent full statistics', () => {
  const stats = {
    skippedFiles: 1, excludedBinaryFiles: 1, blockingSkippedFiles: 0,
    skippedDetails: [{ path: '/workspace/unsupported.txt', reason: 'encoding', blocking: true }],
    skippedDetailsOmitted: 0
  };
  assert.equal(classifySkips(stats).consistent, false);
  assert.equal(summary(stats), 'Some skipped inputs could not be classified; results are incomplete.');
  assert.equal(incompleteSearch({ truncated: false, stats }), true);
  assert.equal(completePreflight({ results: [], truncated: false, stats }), false);
  assert.doesNotMatch(summary(stats), /unsupported|binary file|workspace/);
});

test('empty and legacy diagnostics have compact deterministic summaries', () => {
  assert.equal(summary(), '');
  assert.equal(summary({ skippedFiles: 0 }), '');
  assert.equal(summary({ skippedFiles: 1 }), 'Some skipped inputs could not be classified; results are incomplete.');
  assert.equal(summary({ skippedFiles: -1 }), 'Some skipped inputs could not be classified; results are incomplete.');
});
