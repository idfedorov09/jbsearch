'use strict';
const vscode = require('vscode');
const { ClientResources } = require('./resources');
function activate(context) {
  const resources = new ClientResources(vscode, context.extension.packageJSON.jbsearchClientBuild || 'source');
  let timer;
  const changed = (extensions = false) => {
    resources.invalidate(extensions);
    clearTimeout(timer);
    timer = setTimeout(() => {
      void vscode.commands.executeCommand('jbsearch.previewResourcesChanged', { protocol: 1, revision: resources.revision }).catch(() => {});
    }, 50);
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('jbsearch.client.previewResources', request => resources.snapshot(request)),
    vscode.window.onDidChangeActiveColorTheme(() => changed()),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('workbench.colorTheme') || event.affectsConfiguration('editor.tokenColorCustomizations')) changed();
    }),
    vscode.extensions.onDidChange(() => changed(true)),
    { dispose() { clearTimeout(timer); } }
  );
}
module.exports = { activate };
