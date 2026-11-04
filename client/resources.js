'use strict';
const { parse } = require('jsonc-parser');
const { parseRawGrammar } = require('vscode-textmate');
const MAX_FILE = 4 * 1024 * 1024;
const MAX_TOTAL = 24 * 1024 * 1024;
const MAX_GRAMMARS = 1024;

class ClientResources {
  constructor(vscode, build = 'source') {
    this.v = vscode;
    this.build = build;
    this.revision = 0;
    this.grammarCache = undefined;
    this.pending = undefined;
  }
  invalidate(extensions = false) {
    this.revision++;
    this.pending = undefined;
    if (extensions) this.grammarCache = undefined;
  }
  uri(extension, relative, base = extension.extensionUri) {
    if (typeof relative !== 'string' || !relative || /^[a-z][\w+.-]*:|^[/\\]/i.test(relative))
      throw new Error('Invalid extension resource path.');
    const uri = this.v.Uri.joinPath(base, relative.replace(/\\/g, '/'));
    const root = extension.extensionUri;
    if (uri.scheme !== root.scheme || uri.authority !== root.authority ||
        !(uri.path === root.path || uri.path.startsWith(root.path.replace(/\/$/, '') + '/')))
      throw new Error('Extension resource is outside its installation.');
    return uri;
  }
  async read(uri) {
    const stat = await this.v.workspace.fs.stat(uri);
    if (stat.size > MAX_FILE) throw new Error('Extension resource exceeds preview size limit.');
    const bytes = await this.v.workspace.fs.readFile(uri);
    if (bytes.byteLength > MAX_FILE) throw new Error('Extension resource exceeds preview size limit.');
    return Buffer.from(bytes).toString('utf8');
  }
  async theme(extension, uri, seen = new Set()) {
    if (seen.has(uri.toString())) return [];
    if (seen.size >= 64) throw new Error('Theme includes exceed preview size limit.');
    seen.add(uri.toString());
    const text = await this.read(uri);
    const theme = /\.(tmTheme|plist)$/i.test(uri.path)
      ? parseRawGrammar(text, uri.path) : parse(text);
    if (!theme || typeof theme !== 'object') throw new Error('Invalid theme resource.');
    const base = this.v.Uri.joinPath(uri, '..');
    let settings = typeof theme.include === 'string'
      ? await this.theme(extension, this.uri(extension, theme.include, base), seen) : [];
    if (typeof theme.tokenColors === 'string')
      settings = settings.concat(await this.theme(extension, this.uri(extension, theme.tokenColors, base), seen));
    return settings.concat(Array.isArray(theme.tokenColors) ? theme.tokenColors : Array.isArray(theme.settings) ? theme.settings : []);
  }
  async localizedLabel(extension, label) {
    if (typeof label !== 'string' || !/^%.*%$/.test(label)) return label;
    const key = label.slice(1, -1);
    const locale = String(this.v.env?.language || 'en').toLowerCase();
    const locales = [...new Set([locale, locale.split('-')[0]])];
    for (const name of [...locales.map(value => `package.nls.${value}.json`), 'package.nls.json']) {
      try {
        const data = parse(await this.read(this.uri(extension, name)));
        const value = data?.[key];
        if (typeof value === 'string') return value;
        if (typeof value?.message === 'string') return value.message;
      } catch { /* Optional localization file. */ }
    }
    return label;
  }
  async grammars() {
    if (!this.grammarCache) this.grammarCache = this.readGrammars().catch(error => {
      this.grammarCache = undefined;
      throw error;
    });
    return this.grammarCache;
  }
  async readGrammars() {
    const definitions = this.v.extensions.all.flatMap(extension =>
      (extension.packageJSON.contributes?.grammars || []).map(grammar => ({ extension, grammar })));
    const output = [];
    let total = 0;
    let incomplete = definitions.length > MAX_GRAMMARS;
    for (let start = 0; start < Math.min(definitions.length, MAX_GRAMMARS); start += 8) {
      const batch = await Promise.allSettled(definitions.slice(start, Math.min(start + 8, MAX_GRAMMARS)).map(async ({ extension, grammar }) => {
        if (typeof grammar.scopeName !== 'string' || typeof grammar.path !== 'string') return undefined;
        const uri = this.uri(extension, grammar.path);
        const content = await this.read(uri);
        return {
          scopeName: grammar.scopeName,
          language: grammar.language,
          injectTo: Array.isArray(grammar.injectTo) ? grammar.injectTo.filter(value => typeof value === 'string') : [],
          sourceName: uri.path,
          content
        };
      }));
      for (const item of batch) {
        if (item.status === 'rejected') { incomplete = true; continue; }
        if (!item.value) continue;
        const size = Buffer.byteLength(item.value.content);
        if (total + size > MAX_TOTAL) { incomplete = true; continue; }
        total += size;
        output.push(item.value);
      }
    }
    return { grammars: output, incomplete };
  }
  async snapshot(request) {
    if (!request || request.protocol !== 1) throw new Error('Unsupported JB Search client protocol.');
    if (!this.pending) {
      const revision = this.revision;
      this.pending = this.createSnapshot().then(value => revision === this.revision ? value : this.snapshot(request)).catch(error => {
        if (revision === this.revision) this.pending = undefined;
        throw error;
      });
    }
    return this.pending;
  }
  async createSnapshot() {
    const v = this.v;
    const themeId = v.workspace.getConfiguration('workbench').get('colorTheme', 'Default Dark Modern');
    const ids = new Set([themeId, themeId.replace(/^Default (?=(?:Dark|Light)(?: Modern|\+)?$)/, '')]);
    let settings = [];
    let foundTheme = false;
    for (const extension of v.extensions.all) {
      for (const theme of extension.packageJSON.contributes?.themes || []) {
        const label = await this.localizedLabel(extension, theme.label);
        if (!ids.has(theme.id) && !ids.has(theme.label) && !ids.has(label)) continue;
        try {
          settings = await this.theme(extension, this.uri(extension, theme.path));
          foundTheme = true;
        } catch { /* Return explicit theme fallback, never a fabricated palette. */ }
      }
    }
    const { grammars, incomplete } = await this.grammars();
    return {
      protocol: 1,
      build: this.build,
      revision: this.revision,
      themeId,
      foundTheme,
      settings,
      customizations: v.workspace.getConfiguration('editor').get('tokenColorCustomizations', {}),
      grammars,
      incomplete
    };
  }
}
module.exports = { ClientResources, MAX_FILE, MAX_TOTAL };
