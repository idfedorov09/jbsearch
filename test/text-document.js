'use strict';

// Small mutable TextDocument stand-in with VS Code's UTF-16 range clamping.
// Real filesystem tests still read/write actual temporary files separately.
function textDocument(uri, text, fields = {}) {
  return {
    uri, fileName: uri.fsPath, text, version: 1, isDirty: false, isClosed: false,
    encoding: 'utf8', eol: text.includes('\r\n') ? 2 : 1, languageId: 'plaintext',
    getText() { return this.text; },
    positionAt(offset) {
      const value = this.getText();
      offset = Math.max(0, Math.min(Number(offset) || 0, value.length));
      let line = 0, start = 0;
      for (let index = 0; index < offset; index++) {
        if (value[index] === '\n') { line++; start = index + 1; }
        else if (value[index] === '\r' && value[index + 1] !== '\n') { line++; start = index + 1; }
      }
      if (value[offset] === '\n' && value[offset - 1] === '\r') offset--;
      return { line, character: offset - start };
    },
    offsetAt(position) {
      const lines = this.getText().split(/\r\n|\r|\n/);
      const line = Math.max(0, Math.min(position.line, lines.length - 1));
      let start = 0;
      const expression = /\r\n|\r|\n/g;
      for (let index = 0; index < line; index++) { const end = expression.exec(this.getText()); start = end.index + end[0].length; }
      return start + Math.max(0, Math.min(position.character, lines[line].length));
    },
    ...fields
  };
}
module.exports = { textDocument };
