'use strict';
const { replacementForMatch } = require('./search');
function preserveCase(value, original) {
  if (!value) return '';
  const letters = original.replace(/[^\p{L}]/gu, '');
  if (!letters) return value;
  if (letters === letters.toLocaleUpperCase()) return value.toLocaleUpperCase();
  if (letters === letters.toLocaleLowerCase()) return value.toLocaleLowerCase();
  if (
    original[0] === original[0].toLocaleUpperCase() &&
    original.slice(1) === original.slice(1).toLocaleLowerCase()
  )
    return value[0]?.toLocaleUpperCase() + value.slice(1) || '';
  return value;
}
function replacementText(match, options) {
  let replacement = replacementForMatch(options.replacement, match, options.regex);
  if (options.preserveCase) replacement = preserveCase(replacement, match.matchText);
  return replacement;
}
function replacementMeaning(matches, options) {
  return matches.map(match => ({ uri: match.uri, range: match.range,
    replacement: replacementText(match, options), eolPolicy: 'target-document' }));
}
function planReplacements(matches, documents, options) {
  const plans = [];
  const grouped = new Map();
  for (const match of matches) {
    if (!grouped.has(match.uri)) grouped.set(match.uri, []);
    grouped.get(match.uri).push(match);
  }
  for (const [uri, selected] of grouped) {
    const document = documents.get(uri);
    if (!document)
      throw new Error('A search document is no longer available. Run the search again.');
    const ordered = selected.slice().sort((a, b) => a.offset - b.offset);
    let previousEnd = -1;
    for (const match of ordered) {
      if (
        document.version !== undefined &&
        match.documentVersion !== undefined &&
        document.version !== match.documentVersion
      )
        throw new Error('A file changed since the search. Refresh the results before replacing.');
      if (
        match.offset < previousEnd ||
        document.text.slice(match.offset, match.offset + match.length) !== match.matchText
      )
        throw new Error(
          'Search results are stale or overlap. Refresh the results before replacing.'
        );
      previousEnd = match.offset + Math.max(1, match.length);
      let replacement = replacementText(match, options);
      // Match the target document's established line ending.
      replacement = replacement.replace(/\r?\n/g, document.eol === '\r\n' ? '\r\n' : '\n');
      plans.push({ uri, range: match.range, replacement });
    }
  }
  return plans;
}
module.exports = { preserveCase, planReplacements, replacementMeaning };
