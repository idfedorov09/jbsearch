'use strict';
const MIN_VERSION = [1, 143, 1];
function supportsModal(version) {
  const actual = String(version)
    .split('.')
    .map((value) => Number.parseInt(value, 10));
  for (let i = 0; i < MIN_VERSION.length; i++) {
    if (actual[i] > MIN_VERSION[i]) return true;
    if (!(actual[i] >= MIN_VERSION[i])) return false;
  }
  return true;
}
async function openModal(vscode, uri, viewType) {
  if (!supportsModal(vscode.version))
    throw new Error('JB Search requires VS Code 1.143.1 or newer for its floating dialog.');
  if (vscode.workspace.getConfiguration('workbench.editor').get('useModal') === 'off') {
    const selected = await vscode.window.showInformationMessage(
      'JB Search needs modal editors. Set Workbench › Editor: Use Modal to “some” to enable the floating dialog.',
      'Open Settings'
    );
    if (selected)
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'workbench.editor.useModal'
      );
    return false;
  }
  // Only this adapter depends on undocumented workbench group/options.
  // Never pass -4 through ViewColumn/public openWith: those convert the value.
  await vscode.commands.executeCommand('_workbench.openWith', uri, viewType, [
    -4,
    { pinned: true, modal: { size: { width: 820, height: 640 } } }
  ]);
  return true;
}
module.exports = { openModal, supportsModal };
