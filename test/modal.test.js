'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { openModal, supportsModal } = require('../src/modal');
test('modal adapter refuses unsupported versions', async () => {
  assert.equal(supportsModal('1.143.0'), false);
  assert.equal(supportsModal('1.143.1'), true);
  assert.equal(supportsModal('1.144.1'), true);
  assert.equal(supportsModal('1.145.0'), true);
  await assert.rejects(() => openModal({ version: '1.85.0' }, 'uri', 'view'), /requires/);
});
test('off setting is respected without silently opening a tab or changing config', async () => {
  const calls = [];
  const v = {
    version: '1.143.1',
    workspace: {
      getConfiguration() {
        return {
          get() {
            return 'off';
          }
        };
      }
    },
    window: {
      async showInformationMessage() {
        return undefined;
      }
    },
    commands: {
      executeCommand(...args) {
        calls.push(args);
      }
    }
  };
  assert.equal(await openModal(v, 'uri', 'view'), false);
  assert.equal(calls.length, 0);
});
test('modal adapter confines internal routing to explicit modal group', async () => {
  const calls = [];
  const v = {
    version: '1.143.1',
    workspace: {
      getConfiguration() {
        return {
          get() {
            return 'some';
          }
        };
      }
    },
    commands: {
      async executeCommand(...args) {
        calls.push(args);
      }
    }
  };
  await openModal(v, 'uri', 'view');
  assert.equal(calls[0][0], '_workbench.openWith');
  assert.equal(calls[0][3][0], -4);
  assert.deepEqual(calls[0][3][1].modal.size, { width: 820, height: 640 });
});
