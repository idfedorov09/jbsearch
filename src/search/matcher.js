'use strict';

const path = require('node:path');

class SearchQueryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SearchQueryError';
    this.code = 'INVALID_REGEX';
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search and replace share ECMAScript regular expressions. Execution happens in
 * a disposable worker; compiling an expression here never searches user text.
 * Leading (?i), (?m) and (?s) flags also accept familiar search-dialog syntax.
 */
function compileQuery(request) {
  let source = String(request.query || '');
  let flags = `gmu${request.caseSensitive ? '' : 'i'}`;
  if (!request.regex) {
    source = source
      .split(/\r\n|\r|\n/)
      .map(escapeRegExp)
      .join('\\r?\\n');
  } else {
    source = source.replace(/^\(\?([ims]+)\)/, (_all, inlineFlags) => {
      flags += inlineFlags;
      return '';
    });
    // A newline typed in the dialog matches both LF and CRLF documents.
    source = source.replace(/\r\n|\r|\n/g, '\\r?\\n');
  }
  if (request.wholeWord) {
    source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  }
  try {
    return new RegExp(source, [...new Set(flags)].join(''));
  } catch (error) {
    throw new SearchQueryError(error.message);
  }
}

function splitPatterns(value) {
  if (Array.isArray(value)) return value.flatMap(splitPatterns);
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => enabled === true)
      .map(([pattern]) => pattern);
  }
  return String(value || '')
    .split(';')
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

// Deliberately small glob dialect: *, ?, ** and brace alternatives. No glob is
// ever passed through a shell. Slashes always refer to a root-relative path.
function globToRegExp(glob, { descendants = false } = {}) {
  let pattern = String(glob).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  const trailingSlash = pattern.endsWith('/');
  pattern = pattern.replace(/\/$/, '');
  let source = '';
  let braces = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else source += '.*';
      } else source += '[^/]*';
    } else if (character === '?') source += '[^/]';
    else if (character === '{') {
      source += '(?:';
      braces += 1;
    } else if (character === '}' && braces) {
      source += ')';
      braces -= 1;
    } else if (character === ',' && braces) source += '|';
    else source += escapeRegExp(character);
  }
  if (braces) throw new Error(`Unclosed brace in file pattern: ${glob}`);
  const basename = !pattern.includes('/');
  const prefix = basename && (descendants || trailingSlash) ? '(?:^|/)' : '^';
  const suffix = descendants || trailingSlash ? '(?:/.*)?$' : '$';
  return {
    regex: new RegExp(prefix + source + suffix),
    basename: basename && !descendants && !trailingSlash
  };
}

function matchesPatterns(relativePath, patterns, options) {
  const normalized = relativePath.replace(/\\/g, '/');
  return splitPatterns(patterns).some((pattern) => {
    const compiled = globToRegExp(pattern, options);
    return compiled.regex.test(compiled.basename ? path.posix.basename(normalized) : normalized);
  });
}

function isPathWithin(filePath, directory) {
  if (!filePath || !directory) return false;
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function acceptsFile(relativePath, request, root = {}) {
  if (
    request.masksEnabled &&
    splitPatterns(request.fileMask).length &&
    !matchesPatterns(relativePath, request.fileMask)
  )
    return false;
  // Each include set narrows the selected scope; alternatives within a set are OR.
  for (const patterns of [request.include, request.scope?.include]) {
    const include = splitPatterns(patterns);
    if (include.length && !matchesPatterns(relativePath, include)) return false;
  }
  // A named scope remains the same scope when filesystem ignore rules are disabled.
  const scopeExclude = splitPatterns(request.scope?.exclude);
  if (
    scopeExclude.length &&
    matchesPatterns(relativePath, scopeExclude, { descendants: true })
  )
    return false;
  if (request.respectExcludes !== false) {
    const exclude = [...splitPatterns(request.exclude), ...splitPatterns(root.exclude)];
    if (exclude.length && matchesPatterns(relativePath, exclude, { descendants: true }))
      return false;
  }
  return true;
}

function lineStartsFor(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function positionAt(offset, lineStarts) {
  let low = 0;
  let high = lineStarts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] > offset) high = middle;
    else low = middle;
  }
  return { line: low, character: offset - lineStarts[low] };
}

function advanceStringIndex(text, index) {
  const first = text.charCodeAt(index);
  const second = text.charCodeAt(index + 1);
  return (
    index + (first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff ? 2 : 1)
  );
}

/** Only call for bounded fixture text or inside the search worker. */
function* iterateMatches(text, request, metadata = {}) {
  if (!request.query) return;
  const expression = compileQuery(request);
  const lineStarts = lineStartsFor(text);
  let match;
  while ((match = expression.exec(text))) {
    const start = positionAt(match.index, lineStarts);
    const end = positionAt(match.index + match[0].length, lineStarts);
    const lineEnd = text.indexOf('\n', lineStarts[start.line]);
    const lineText = text
      .slice(lineStarts[start.line], lineEnd === -1 ? text.length : lineEnd)
      .replace(/\r$/, '');
    // Bound transported previews for generated/minified files. The exact match
    // range still uses the original document's UTF-16 coordinates.
    const previewStart = Math.max(0, start.character - 160);
    const preview = lineText.slice(
      previewStart,
      Math.max(
        previewStart + 500,
        Math.min(start.character + match[0].length + 160, previewStart + 2000)
      )
    );
    yield {
      ...metadata,
      id: `${metadata.uri || metadata.fsPath || ''}:${match.index}:${match[0].length}`,
      range: { start, end },
      line: start.line,
      character: start.character,
      endLine: end.line,
      endCharacter: end.character,
      offset: match.index,
      length: match[0].length,
      matchText: match[0],
      captures: match.slice(1),
      groups: match.groups ? { ...match.groups } : undefined,
      preview,
      lineText: preview,
      previewStart,
      previewMatchStart: start.character - previewStart,
      previewMatchEnd: Math.min(preview.length, start.character - previewStart + match[0].length)
    };
    if (match[0].length === 0)
      expression.lastIndex = advanceStringIndex(text, expression.lastIndex);
  }
}

/** Expand replacements from already captured matches without running a regex. */
function replacementForMatch(replacement, match, regex = true) {
  const template = String(replacement || '');
  if (!regex) return template;
  const captures = match.captures || [];
  return template.replace(
    /\\([nrt\\])|\$(\$|&|0|<[^>]+>|\d{1,2})/g,
    (token, escaped, reference) => {
      if (escaped) return { n: '\n', r: '\r', t: '\t', '\\': '\\' }[escaped];
      if (reference === '$') return '$';
      if (reference === '&' || reference === '0') return match.matchText;
      if (reference.startsWith('<')) {
        const name = reference.slice(1, -1);
        return Object.hasOwn(match.groups || {}, name) ? match.groups[name] || '' : token;
      }
      const number = Number(reference);
      if (number > 0 && number <= captures.length) return captures[number - 1] || '';
      if (
        reference.length === 2 &&
        Number(reference[0]) > 0 &&
        Number(reference[0]) <= captures.length
      ) {
        return (captures[Number(reference[0]) - 1] || '') + reference[1];
      }
      return token;
    }
  );
}

module.exports = {
  SearchQueryError,
  compileQuery,
  splitPatterns,
  globToRegExp,
  matchesPatterns,
  isPathWithin,
  acceptsFile,
  iterateMatches,
  replacementForMatch,
  positionAt,
  lineStartsFor
};
