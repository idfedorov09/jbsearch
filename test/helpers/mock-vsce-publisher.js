'use strict';
// Loaded only by publication tests. No live API call is made.
const assert = require('node:assert/strict');
require('@vscode/vsce').publishVSIX = async (file, options) => {
  assert.match(file, /-linux-x64\.vsix$/);
  assert.deepEqual(options, { oidc: true, preRelease: true, skipDuplicate: false });
  if (process.env.MOCK_VSCE_RESULT === 'success') return;
  if (process.env.MOCK_VSCE_RESULT === 'cancel') throw new Error('Canceled');
  if (process.env.MOCK_VSCE_RESULT === 'cancelled') throw new Error('Cancelled');
  if (process.env.MOCK_VSCE_RESULT === 'duplicate') throw new Error('already exists');
  throw new Error('synthetic-private-test-marker https://example/?token=synthetic-private-test-marker');
};
