'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const manifest = require('../package.json');
const commandId = 'jbsearch.checkInstallation';

test('manifest declares the installation-check command and entry point', () => {
  assert.equal(manifest.main, './src/extension.js');
  assert.ok(fs.existsSync(path.join(root, manifest.main)));
  assert.ok(manifest.activationEvents.includes(`onCommand:${commandId}`));
  assert.ok(manifest.contributes.commands.some((command) => command.command === commandId));
});

test('activation registers a disposable command that displays the scaffold status', () => {
  const commands = new Map();
  const messages = [];
  const disposable = { dispose() {} };
  const vscode = {
    commands: {
      registerCommand(id, callback) {
        commands.set(id, callback);
        return disposable;
      }
    },
    window: {
      showInformationMessage(message) {
        messages.push(message);
        return Promise.resolve();
      }
    }
  };
  const entryPoint = path.join(root, manifest.main);
  const module = { exports: {} };
  // Load the real entry point with a minimal VS Code API mock; no editor is started.
  vm.runInNewContext(fs.readFileSync(entryPoint, 'utf8'), {
    module,
    exports: module.exports,
    require(id) {
      assert.equal(id, 'vscode');
      return vscode;
    }
  }, { filename: entryPoint });

  const context = { subscriptions: [] };
  module.exports.activate(context);

  assert.deepEqual(context.subscriptions, [disposable]);
  assert.equal(commands.size, 1);
  assert.ok(commands.has(commandId));
  commands.get(commandId)();
  assert.deepEqual(messages, ['JB Search is ready. Search is not implemented yet.']);
  assert.equal(typeof module.exports.deactivate, 'function');
});
