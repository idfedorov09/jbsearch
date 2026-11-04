'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const tm = require('vscode-textmate');
const onig = require('vscode-oniguruma');
const { parse } = require('jsonc-parser');
const { ClientPreviewBridge } = require('./client-preview');
let wasm;
async function initializeOnig() {
  if (!wasm)
    wasm = fs
      .readFile(require.resolve('vscode-oniguruma/release/onig.wasm'))
      .then((buffer) =>
        onig.loadWASM(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
      );
  await wasm;
  return {
    createOnigScanner: (sources) => new onig.OnigScanner(sources),
    createOnigString: (text) => new onig.OnigString(text)
  };
}
async function readTheme(file, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const contents = await fs.readFile(file, 'utf8');
  const theme = file.endsWith('.tmTheme') ? tm.parseRawGrammar(contents, file) : parse(contents);
  if (!theme) return [];
  let rules = theme.include
    ? await readTheme(path.resolve(path.dirname(file), theme.include), seen)
    : [];
  if (typeof theme.tokenColors === 'string')
    rules = rules.concat(
      await readTheme(path.resolve(path.dirname(file), theme.tokenColors), seen)
    );
  return rules.concat(Array.isArray(theme.tokenColors) ? theme.tokenColors : theme.settings || []);
}
function themeRules(custom, themeId) {
  if (!custom) return [];
  const keys = {
    comments: ['comment', 'punctuation.definition.comment'],
    strings: ['string', 'meta.embedded.assembly'],
    keywords: ['keyword - keyword.operator', 'keyword.control', 'storage', 'storage.type'],
    numbers: ['constant.numeric'],
    types: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
    functions: ['entity.name.function', 'support.function'],
    variables: ['variable', 'entity.name.variable']
  };
  const convert = (value) => [
    ...Object.entries(keys)
      .filter(
        ([key]) =>
          typeof value[key] === 'string' ||
          (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key]))
      )
      .flatMap(([key, scopes]) =>
        scopes.map((scope) => ({
          scope,
          settings: typeof value[key] === 'string' ? { foreground: value[key] } : value[key]
        }))
      ),
    ...(Array.isArray(value.textMateRules) ? value.textMateRules : [])
  ];
  // VS Code merges all matching theme-specific groups before converting them.
  // This preserves the precedence of explicit TextMate rules over broad groups.
  const scoped = Object.create(null);
  for (const [selector, value] of Object.entries(custom)) {
    if (
      !selector.startsWith('[') ||
      !selector.endsWith(']') ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) continue;
    for (const part of selector.match(/\[([^\]]+)\]/g) || []) {
      const pattern = part.slice(1, -1);
      const leading = pattern.startsWith('*'),
        trailing = pattern.endsWith('*');
      const matches =
        pattern === themeId ||
        (leading && trailing && themeId.includes(pattern.slice(1, -1))) ||
        (trailing && themeId.startsWith(pattern.slice(0, -1))) ||
        (leading && themeId.endsWith(pattern.slice(1)));
      if (!matches) continue;
      for (const [key, item] of Object.entries(value)) {
        if (Array.isArray(scoped[key]) && Array.isArray(item))
          scoped[key] = scoped[key].concat(item);
        else if (item) scoped[key] = item;
      }
    }
  }
  return convert(custom).concat(convert(scoped));
}
class PreviewProvider {
  constructor(vscode, context) {
    this.vscode = vscode;
    this.revision = 0;
    this.registry = undefined;
    this.listeners = new Set();
    this.disposed = false;
    this.client = new ClientPreviewBridge(vscode, context, () => {
      this.invalidate();
      for (const listener of this.listeners) listener();
    });
  }
  onDidChange(listener) {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
  async setupClient() {
    await this.client.setup();
    this.invalidate();
    const resources = await this.client.resources();
    if (this.client.remote && !resources) throw new Error(this.client.issue);
    for (const listener of this.listeners) listener();
    return resources;
  }
  invalidate() {
    this.revision++;
    this.registry?.dispose();
    this.registry = undefined;
    this.loading = undefined;
    this.client.invalidate();
  }
  async load() {
    if (this.disposed) throw new Error('Preview provider is disposed.');
    if (this.loading) return this.loading;
    const revision = this.revision;
    const loading = this.createRegistry()
      .then((value) => {
        if (this.disposed) {
          value.registry.dispose();
          throw new Error('Preview provider is disposed.');
        }
        if (revision !== this.revision) {
          value.registry.dispose();
          return this.load();
        }
        this.registry = value.registry;
        return value;
      })
      .catch((error) => {
        if (this.loading === loading) this.loading = undefined;
        throw error;
      });
    this.loading = loading;
    return loading;
  }
  async createRegistry() {
    const v = this.vscode,
      grammars = new Map(),
      languages = new Map();
    const client = await this.client.resources();
    const config = v.workspace.getConfiguration('workbench');
    const themeId = client?.themeId || config.get('colorTheme', 'Default Dark Modern');
    // VS Code still accepts legacy built-in theme ids in settings.json.
    const themeIds = new Set([
      themeId,
      themeId.replace(/^Default (?=(?:Dark|Light)(?: Modern|\+)?$)/, '')
    ]);
    let settings = [];
    let foundTheme = false;
    // Client resources are serialized over the supported command channel. Never
    // interpret a client path as a path on the remote filesystem.
    for (const grammar of client?.grammars || []) {
      if (typeof grammar.scopeName !== 'string' || typeof grammar.content !== 'string') continue;
      grammars.set(grammar.scopeName, {
        ...grammar,
        file: grammar.sourceName || `${grammar.scopeName}.json`,
        client: true
      });
      if (typeof grammar.language === 'string') languages.set(grammar.language, grammar.scopeName);
    }
    for (const extension of v.extensions.all) {
      const contributes = extension.packageJSON.contributes || {};
      for (const grammar of contributes.grammars || []) {
        grammars.set(grammar.scopeName, {
          ...grammar,
          file: path.resolve(extension.extensionPath, grammar.path)
        });
        if (grammar.language) languages.set(grammar.language, grammar.scopeName);
      }
      let localization;
      for (const theme of contributes.themes || []) {
        let label = theme.label;
        if (typeof label === 'string' && label.startsWith('%') && label.endsWith('%')) {
          if (!localization) {
            try {
              localization =
                parse(
                  await fs.readFile(path.join(extension.extensionPath, 'package.nls.json'), 'utf8')
                ) || {};
            } catch {
              localization = {};
            }
          }
          label = localization[label.slice(1, -1)] || label;
        }
        if (themeIds.has(theme.id) || themeIds.has(theme.label) || themeIds.has(label)) {
          try {
            settings = await readTheme(path.resolve(extension.extensionPath, theme.path));
            foundTheme = true;
          } catch {
            /* Report fallback in preview. */
          }
        }
      }
    }
    if (client?.foundTheme) {
      settings = client.settings;
      foundTheme = true;
    }
    settings = settings.concat(
      themeRules(client?.customizations ?? v.workspace.getConfiguration('editor').get('tokenColorCustomizations'), themeId)
    );
    const hasDefaultForeground = settings.some(rule => !rule.scope && rule.settings?.foreground);
    const registry = new tm.Registry({
      onigLib: initializeOnig(),
      theme: { name: themeId, settings },
      loadGrammar: async (scope) => {
        const grammar = grammars.get(scope);
        if (!grammar) return null;
        try {
          return tm.parseRawGrammar(grammar.client ? grammar.content : await fs.readFile(grammar.file, 'utf8'), grammar.file);
        } catch {
          return null;
        }
      },
      getInjections: (scope) =>
        [...grammars.values()]
          .filter((g) =>
            g.injectTo?.some((target) => scope === target || scope.startsWith(`${target}.`))
          )
          .map((g) => g.scopeName)
    });
    return { registry, languages, foundTheme, hasDefaultForeground, clientIssue: this.client.issue, clientIncomplete: client?.incomplete };
  }
  async render(document, result, matches = []) {
    const { registry, languages, foundTheme, hasDefaultForeground, clientIssue, clientIncomplete } = await this.load();
    const text = document.getText(),
      source = text.split(/\r\n|\r|\n/);
    const selectedLine = result.range.start.line;
    const first = Math.max(0, selectedLine - 8),
      last = Math.min(source.length, Math.max(selectedLine + 35, result.range.end.line + 5));
    let grammar;
    try {
      const scope = languages.get(document.languageId);
      if (scope) grammar = await registry.loadGrammar(scope);
    } catch {
      /* Plain text fallback. */
    }
    const colors = registry.getColorMap();
    const lines = [];
    let state = tm.INITIAL;
    let syntaxLimited = false;
    const tokenDeadline = performance.now() + 250;
    // Bound prefix work for huge files; the status makes the approximation explicit.
    const tokenStart = Math.max(0, first - 5000);
    for (let line = tokenStart; line < last; line++) {
      const content = source[line] || '';
      let tokens = [{ text: content }];
      if (grammar && !syntaxLimited) {
        if (content.length >= 20000 || performance.now() >= tokenDeadline) syntaxLimited = true;
        else {
          // A stopped line contains an incomplete stack. Retrying from the
          // original state allows cold grammar compilation without treating the
          // remainder of the file as an unterminated string or comment.
          let parsed = grammar.tokenizeLine2(content, state, 20);
          if (parsed.stoppedEarly) parsed = grammar.tokenizeLine2(content, state, 100);
          if (parsed.stoppedEarly) syntaxLimited = true;
          else {
            state = parsed.ruleStack;
            if (line >= first) {
              tokens = [];
              for (let i = 0; i < parsed.tokens.length; i += 2) {
                const start = parsed.tokens[i],
                  end = i + 2 < parsed.tokens.length ? parsed.tokens[i + 2] : content.length;
                const metadata = parsed.tokens[i + 1],
                  color = colors[(metadata >>> 15) & 0x1ff];
                tokens.push({
                  text: content.slice(start, end),
                  color: ((metadata >>> 15) & 0x1ff) === 1 && !hasDefaultForeground ? undefined : color,
                  fontStyle: (metadata >>> 11) & 0xf
                });
              }
            }
          }
        }
      }
      if (line >= first) {
        const highlights = matches
          .filter((match) => match.range.start.line <= line && match.range.end.line >= line)
          .map((match) => ({
            start: match.range.start.line === line ? match.range.start.character : 0,
            end: match.range.end.line === line ? match.range.end.character : content.length,
            selected: match.id === result.id
          }));
        lines.push({
          number: line + 1,
          tokens,
          highlights,
          selected: line >= result.range.start.line && line <= result.range.end.line
        });
      }
    }
    return {
      uri: document.uri.toString(),
      name: path.basename(document.fileName),
      path: this.vscode.workspace.asRelativePath(document.uri),
      language: document.languageId,
      lines,
      selectedLine: selectedLine + 1,
      note: clientIssue
        ? `Client preview unavailable: ${clientIssue}`
        : !grammar
        ? 'No TextMate grammar for this language; plain text preview.'
        : !foundTheme
          ? 'Active theme unavailable on this host; syntax colors may be incomplete.'
          : clientIncomplete
            ? 'Some client grammar resources were unavailable; highlighting may be incomplete.'
          : syntaxLimited
            ? 'Syntax tokenization limit reached; remaining lines use plain text.'
          : tokenStart > 0
            ? 'Syntax context limited for this large file.'
            : '',
      version: document.version
    };
  }
  dispose() {
    this.disposed = true;
    this.invalidate();
    this.client.dispose();
    this.listeners.clear();
  }
}
module.exports = { PreviewProvider, readTheme, themeRules };
