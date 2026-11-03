'use strict';

const vscode = require('vscode');

/**
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
  const command = vscode.commands.registerCommand('jbsearch.checkInstallation', () => {
    void vscode.window.showInformationMessage(
      'JB Search is ready. Search is not implemented yet.'
    );
  });

  context.subscriptions.push(command);
}

function deactivate() {}

module.exports = { activate, deactivate };
