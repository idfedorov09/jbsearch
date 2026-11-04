'use strict';
const vscode = require('vscode');
const { SearchController } = require('./controller');
/** @param {import('vscode').ExtensionContext} context */
function activate(context) {
  const controller = new SearchController(vscode, context);
  context.subscriptions.push(
    vscode.commands.registerCommand('jbsearch.checkInstallation', () =>
      vscode.window.showInformationMessage(
        `JB Search ${context.extension.packageJSON.version} is ready. Use Find in Files or Replace in Files. Loaded from ${context.extension.extensionUri.fsPath}`
      )
    ),
    vscode.commands.registerCommand('jbsearch.findInFiles', () => controller.show('find')),
    vscode.commands.registerCommand('jbsearch.replaceInFiles', () => controller.show('replace')),
    vscode.commands.registerCommand('jbsearch.setupClientPreview', () => controller.setupClientPreview())
  );
}
function deactivate() {}
module.exports = { activate, deactivate };
