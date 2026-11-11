'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { approvalFor, assertApproval } = require('../src/replace-approval');

function session() {
  return { id: 'source', generation: 1, searchRequestFingerprint: 'effective-scope',
    query: '(cat)', mode: 'replace', replacement: '$1 dog', options: { regex: true },
    scope: { kind: 'workspace' }, results: [{ id: 'one', uri: 'file:///one', offset: 0,
      length: 3, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
      matchText: 'cat', captures: ['cat', undefined], groups: { optional: undefined } }] };
}

test('approval is a deep immutable full model and status/selection changes never adopt another set', () => {
  const s = session(), first = approvalFor(s), incoming = structuredClone(first.binding);
  s.selectedId = 'one'; s.notice = 'status'; s.scopeStale = true; s.scopeEventRevision = 5;
  assert.equal(approvalFor(s), first);
  assert.equal(assertApproval(s, incoming), first);
  assert.throws(() => { first.model.results[0].range.start.character = 2; }, TypeError);
  s.results[0].captures[0] = 'different';
  assert.equal(first.model.results[0].captures[0], 'cat');
  assert.throws(() => assertApproval(s, incoming), /older search snapshot/);
  assert.notEqual(approvalFor(s).binding.snapshotToken, incoming.snapshotToken);
});

test('template, flags, full off-screen set, generation and request changes require new action tokens', () => {
  for (const change of [
    s => { s.replacement = 'new'; }, s => { s.options.preserveCase = true; },
    s => { s.results.push({ ...s.results[0], id: 'off-screen', offset: 99 }); },
    s => { s.generation++; }, s => { s.searchRequestFingerprint = 'other-root'; }
  ]) {
    const s = session(), prior = approvalFor(s);
    change(s);
    const next = approvalFor(s);
    assert.notEqual(next.binding.snapshotToken, prior.binding.snapshotToken);
    assert.throws(() => assertApproval(s, prior.binding), /older search snapshot/);
  }
});

test('a complete client model can bind Single while another row is invalid/pending or the set is partial', () => {
  const s = session();
  s.partial = true;
  s.results.push({ ...s.results[0], id: 'pending-other', pending: true });
  const approval = approvalFor(s);
  assert.ok(approval);
  assert.equal(approval.model.partial, true);
  assert.equal(approval.model.results[1].pending, true);
  s.searching = true;
  assert.equal(approvalFor(s), undefined);
  assert.throws(() => assertApproval(s, approval.binding), /older search snapshot/);
});

test('new saved searches and frozen reviews never rebind the source token to a mutable latest model', () => {
  const source = session(), approval = approvalFor(source);
  const independent = { ...source, id: 'saved-copy', replaceApproval: undefined };
  assert.notEqual(approvalFor(independent).binding.snapshotToken, approval.binding.snapshotToken);
  assert.throws(() => assertApproval(independent, approval.binding), /older search snapshot/);
  const review = { ...source, id: 'review', reviewOnly: true, reviewApproval: approval };
  source.replacement = 'changed'; approvalFor(source);
  assert.equal(approvalFor(review), approval);
  assert.equal(approvalFor(review).model.replacement, '$1 dog');
  assert.throws(() => assertApproval(source, review.reviewApproval.binding), /older search snapshot/);
});
