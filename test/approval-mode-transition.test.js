'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SearchController } = require('../src/controller');
const { approvalFor, assertApproval } = require('../src/replace-approval');

test('rapid mode changes retire the old approval before the pending modal opens', async () => {
  let resolveOpening;
  const opening = new Promise(resolve => { resolveOpening = resolve; });
  const session = {
    id: 'mode-transition', mode: 'replace', layout: 'modal', generation: 1,
    lifetimeRevision: 0, query: 'cat', replacement: 'dog', options: {},
    scope: { kind: 'workspace' }, searchRequestFingerprint: 'fingerprint',
    results: [{ id: 'one', uri: 'file:///workspace/one.js', offset: 0, length: 3,
      matchText: 'cat', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } } }],
    opening
  };
  const oldBinding = structuredClone(approvalFor(session).binding);
  const controller = Object.create(SearchController.prototype);
  Object.assign(controller, { disposed: false, currentId: session.id,
    sessions: new Map([[session.id, session]]), v: { window: {} } });

  const find = controller.show('find', undefined, { search: false });
  assert.equal(session.mode, 'find');
  assert.equal(session.replaceApproval, undefined);
  const replace = controller.show('replace', undefined, { search: false });
  assert.equal(session.mode, 'replace');
  assert.equal(session.replaceApproval, undefined, 'no token is minted before presentation');
  assert.throws(() => assertApproval(session, oldBinding), /older search snapshot/);

  resolveOpening(false);
  assert.deepEqual(await Promise.all([find, replace]), [false, false]);
  assert.equal(session.replaceApproval, undefined);
});
