'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { textDocument } = require('./text-document');
const { createHash } = require('node:crypto');
const { SearchController } = require('../src/controller');
const { approvalFor } = require('../src/replace-approval');
const { requestFingerprint } = require('../src/replace-preflight');

for (const all of [false, true]) {
  test(`${all ? 'Replace All' : 'Replace'} rejects a document changed during asynchronous disk preparation`, async t => {
    let entered, release;
    const atStat = new Promise(resolve => { entered = resolve; });
    const stat = new Promise(resolve => { release = resolve; });
    const uri = { fsPath: '/mock/file', toString: () => 'file:///mock/file' };
    const document = textDocument(uri, 'needle');
    const match = { id: 'one', uri: uri.toString(), offset: 0, length: 6, matchText: 'needle',
      captures: [], source: 'disk', mtimeMs: 7, fileSize: 6,
      contentHash: createHash('sha256').update('needle', 'utf16le').digest('hex'),
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } };
    const request = { query: 'needle', scope: { kind: 'workspace' }, roots: [], documents: [] };
    const session = { id: 's', mode: 'replace', layout: 'findWindow', scope: { kind: 'workspace' },
      query: 'needle', options: {}, replacement: 'Y', results: [match], generation: 1,
      searching: false, partial: false, searchRequestFingerprint: requestFingerprint(request) };
    let applied = 0;
    const controller = Object.create(SearchController.prototype);
    Object.assign(controller, {
      disposed: false, sessions: new Map([[session.id, session]]), notify() {}, queueValidation() {},
      // Synthetic disk adapter delays the physical preparation boundary; real
      // baseline reads and Save races are covered by filesystem integration.
      async prepareReplacementSource(_s, _d, _old, _fresh, { check }) {
        entered(); await stat; check();
      },
      configuration: () => ({ get: (_key, fallback) => fallback }),
      request: async () => request,
      engine: { search: async () => ({ results: [match], truncated: false,
        stats: { cancelled: false, timedOut: false, errors: [], filesScanned: 1,
          filesMatched: 1, matches: 1, skippedFiles: 0, excludedBinaryFiles: 0,
          blockingSkippedFiles: 0, skipped: { tooLarge: 0, binary: 0, encoding: 0, unreadable: 0 },
          skippedDetails: [], skippedDetailsOmitted: 0 } }) },
      v: { Uri: { parse: () => uri }, EndOfLine: { CRLF: 2 },
        Range: class { constructor(a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; } },
        WorkspaceEdit: class { replace() {} },
        workspace: { openTextDocument: async () => document, applyEdit: async () => { applied++; return true; } } }
    });
    const replacing = controller.replace(session, all, { id: 'one', generation: 1, actionBinding: approvalFor(session).binding });
    await atStat;
    document.text = 'Xneedle';
    document.version++;
    document.isDirty = true;
    release({ mtimeMs: 7, size: 6 });
    await assert.rejects(replacing, /changed.*(?:Rerun Search|Refresh)/);
    assert.equal(applied, 0);
    assert.equal(document.text, 'Xneedle');
  });
}
