'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const RESOURCE_COMMAND = 'jbsearch.client.previewResources';
const missingCommand = error => /command.+(?:not found|not registered)/i.test(error.message || '');
const reloadClientMessage = 'Client preview support was updated. Reload the window to load its new code.';
function deadline(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}
class ClientPreviewBridge {
  constructor(vscode, context, onChanged = () => {}) {
    this.v = vscode;
    this.context = context;
    this.onChanged = onChanged;
    this.remote = Boolean(vscode.env?.remoteName);
    this.revision = 0;
    this.disposed = false;
    this.issue = '';
    if (this.remote && context) this.notification = vscode.commands.registerCommand('jbsearch.previewResourcesChanged', message => {
      if (message?.protocol !== 1 || this.disposed) return;
      this.invalidate();
      this.onChanged();
    });
  }
  invalidate() {
    this.revision++;
    this.pending = undefined;
  }
  async bundled() {
    const root = this.context?.extensionPath || this.context?.extensionUri?.fsPath;
    if (!root) throw new Error('Client preview support needs the extension installation folder.');
    const metadata = JSON.parse(await fs.readFile(path.join(root, 'bundled', 'client.json'), 'utf8').catch(() => {
      throw new Error('Client preview package is missing. Run npm run prepare:client in the JB Search source folder.');
    }));
    return { ...metadata, uri: this.v.Uri.joinPath(this.context.extensionUri, 'bundled', 'jbsearch-client.vsix') };
  }
  async requestSnapshot() {
    const snapshot = await deadline(this.v.commands.executeCommand(RESOURCE_COMMAND, { protocol: 1 }), 10000,
      'Client preview resources did not respond. Reload the window or run JB Search: Set Up Client Preview.');
    if (!snapshot || snapshot.protocol !== 1 || !Array.isArray(snapshot.settings) || !Array.isArray(snapshot.grammars))
      throw new Error('Client preview support uses an incompatible protocol. Run JB Search: Set Up Client Preview.');
    return snapshot;
  }
  async setup() {
    if (!this.remote || this.disposed) return;
    if (this.installing) return this.installing;
    this.installAttempted = true;
    const installing = (async () => {
      const bundle = await this.bundled();
      if (this.disposed) return;
      await deadline(this.v.commands.executeCommand('workbench.extensions.installExtension', bundle.uri), 45000,
        'Client support installation is still pending. Check Extensions, then reload the window.');
      for (let attempt = 0; attempt < 40; attempt++) {
        if (this.disposed) return;
        try {
          // Executing the command activates its UI extension. A command list can
          // omit commands whose extension has just been installed remotely.
          const snapshot = await this.requestSnapshot();
          if (this.disposed) return;
          if (snapshot.build !== 'source' && snapshot.build !== bundle.build)
            throw new Error(reloadClientMessage);
          this.invalidate();
          this.issue = '';
          return snapshot;
        } catch (error) {
          if (!missingCommand(error)) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Client support was installed but is not active. Enable JB Search — Client Support locally and reload the window.');
    })();
    this.installing = installing;
    try { return await installing; }
    catch (error) {
      if (!this.disposed) this.issue = error.message;
      throw error;
    } finally { if (this.installing === installing) this.installing = undefined; }
  }
  async read() {
    let snapshot;
    try {
      snapshot = await this.requestSnapshot();
    } catch (error) {
      if (!missingCommand(error)) throw error;
      if (this.installAttempted)
        throw new Error('Client preview support is unavailable. Run JB Search: Set Up Client Preview, or enable its local extension.');
      snapshot = await this.setup();
    }
    if (this.disposed) return;
    // Development source registrations intentionally use the current source files.
    if (snapshot.build !== 'source') {
      const expected = await this.bundled();
      if (this.disposed) return;
      if (snapshot.build !== expected.build) {
        if (this.installAttempted) throw new Error(reloadClientMessage);
        snapshot = await this.setup();
      }
    }
    return snapshot;
  }
  async resources() {
    if (!this.remote || this.disposed) return undefined;
    if (!this.pending) {
      const revision = this.revision;
      this.pending = this.read().then(snapshot => {
        if (this.disposed) return undefined;
        if (revision !== this.revision) return this.resources();
        this.issue = '';
        return snapshot;
      }).catch(error => {
        if (this.disposed) return undefined;
        if (revision !== this.revision) return this.resources();
        this.issue = error.message;
        return undefined;
      });
    }
    return this.pending;
  }
  dispose() {
    this.disposed = true;
    this.notification?.dispose();
    this.invalidate();
  }
}
module.exports = { ClientPreviewBridge, RESOURCE_COMMAND, deadline };
