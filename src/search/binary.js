'use strict';

// File names cannot distinguish binary from text. Recognize common byte
// signatures, and use the conventional NUL-byte signal only after checking
// Unicode encodings which also use NUL bytes. Arbitrary bytes remain ambiguous.
const PROBE_BYTES = 8192;
const hasPrefix = (bytes, prefix) => bytes.length >= prefix.length &&
  prefix.every((value, index) => bytes[index] === value);
const ascii = value => [...Buffer.from(value, 'ascii')];
const SIGNATURES = [
  ['PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['JPEG', [0xff, 0xd8, 0xff]],
  ['gzip', [0x1f, 0x8b, 0x08]],
  ['XZ', [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]],
  ['ELF', [0x7f, 0x45, 0x4c, 0x46]],
  ['WebAssembly', [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]],
  ['SQLite', [...ascii('SQLite format 3'), 0x00]]
];
const RIFF = ascii('RIFF'), BZIP = ascii('BZh');
const textCharacter = /^[\p{L}\p{N}\p{P}\p{S}\p{Z}\t\r\n]$/u;
const wordCharacter = /^[\p{L}\p{N}]$/u;

function hasUnsupportedBom(bytes) {
  return hasPrefix(bytes, [0xff, 0xfe]) || hasPrefix(bytes, [0xfe, 0xff]) ||
    hasPrefix(bytes, [0x00, 0x00, 0xfe, 0xff]);
}

function likelyWideText(bytes) {
  const sample = bytes.subarray(0, PROBE_BYTES);
  const printable = byte => (byte >= 0x20 && byte <= 0x7e) || byte === 9 || byte === 10 || byte === 13;
  // Detect ASCII-range UTF-16/32 without a BOM, in either byte order. This is
  // intentionally conservative: a regular wide-byte pattern with readable
  // characters remains a blocking encoding issue rather than a binary skip.
  for (const width of [4, 2]) {
    const groups = Math.floor(sample.length / width);
    if (!groups) continue;
    for (const textLane of [0, width - 1]) {
      let chars = 0, zeroes = 0;
      for (let i = 0; i < groups; i += 1) {
        if (printable(sample[i * width + textLane])) chars += 1;
        for (let lane = 0; lane < width; lane += 1)
          if (lane !== textLane && sample[i * width + lane] === 0) zeroes += 1;
      }
      if (chars / groups >= 0.75 && zeroes / (groups * (width - 1)) >= 0.8) return true;
    }
  }
  // BOM-less wide text may not contain any NULs (for example Cyrillic UTF-16).
  // Look for a regular high-byte lane and a plausible decoded Unicode string;
  // this is still a heuristic, not a general encoding detector.
  const pairs = Math.floor(sample.length / 2);
  if (pairs >= 3) {
    for (const littleEndian of [true, false]) {
      let lowHighBytes = 0;
      for (let index = 0; index < pairs; index += 1)
        if (sample[index * 2 + (littleEndian ? 1 : 0)] <= 0x0f) lowHighBytes += 1;
      if (lowHighBytes / pairs < 0.8) continue;
      try {
        const decoded = new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be', { fatal: true })
          .decode(sample.subarray(0, pairs * 2));
        if (plausibleUnicodeText(decoded)) return true;
      } catch { /* Not a complete Unicode sequence. */ }
    }
  }
  // A mixed-script UTF-16 document can have too few zero high bytes for the
  // overall ratios above. Look for a run of ASCII UTF-16 code units alongside
  // plausible non-ASCII text, in either byte order. Very short strings need a
  // single such unit; longer inputs need at least two adjacent units so one
  // NUL in ordinary binary data is not sufficient evidence of an encoding.
  if (sample.includes(0) && pairs >= 2) {
    for (const littleEndian of [true, false]) {
      let run = 0, longestRun = 0;
      for (let index = 0; index < pairs; index += 1) {
        const offset = index * 2;
        const low = sample[offset + (littleEndian ? 0 : 1)];
        const high = sample[offset + (littleEndian ? 1 : 0)];
        run = high === 0 && printable(low) ? run + 1 : 0;
        longestRun = Math.max(longestRun, run);
      }
      if (!longestRun) continue;
      try {
        const decoded = new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be', { fatal: true })
          .decode(sample.subarray(0, pairs * 2));
        const characters = [...decoded];
        if ((longestRun >= 2 || characters.length === 2) &&
            characters.some(character => character.codePointAt(0) > 0x7f) &&
            plausibleUnicodeText(decoded, 2)) return true;
      } catch { /* Not a complete Unicode sequence. */ }
    }
  }
  const words = Math.floor(sample.length / 4);
  if (words >= 3) {
    for (const littleEndian of [true, false]) {
      let zeroes = 0;
      const decoded = [];
      for (let index = 0; index < words; index += 1) {
        const offset = index * 4;
        zeroes += Number(sample[offset + (littleEndian ? 2 : 0)] === 0);
        zeroes += Number(sample[offset + (littleEndian ? 3 : 1)] === 0);
        const codepoint = littleEndian ? sample.readUInt32LE(offset) : sample.readUInt32BE(offset);
        if (codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) break;
        decoded.push(String.fromCodePoint(codepoint));
      }
      if (decoded.length === words && zeroes / (words * 2) >= 0.9 && plausibleUnicodeText(decoded.join('')))
        return true;
    }
  }
  return false;
}

function plausibleUnicodeText(text, minimumCharacters = 3) {
  const characters = [...text];
  if (characters.length < minimumCharacters || new Set(characters).size < 2) return false;
  let printable = 0, words = 0, mostFrequent = 0;
  const frequencies = new Map();
  for (const character of characters) {
    if (textCharacter.test(character)) printable += 1;
    if (wordCharacter.test(character)) words += 1;
    const count = (frequencies.get(character) || 0) + 1;
    frequencies.set(character, count);
    mostFrequent = Math.max(mostFrequent, count);
  }
  return printable / characters.length >= 0.9 && words / characters.length >= 0.5 &&
    mostFrequent / characters.length < 0.8;
}

function binarySignature(bytes) {
  for (const [name, signature] of SIGNATURES) if (hasPrefix(bytes, signature)) return name;
  // Printable prefixes alone can also start ordinary text files. Require the
  // PDF version and a plausible GIF logical-screen header and first block.
  if (/^%PDF-[0-9]\.[0-9](?:[\r\n]|$)/.test(bytes.subarray(0, 9).toString('latin1'))) return 'PDF';
  if ((hasPrefix(bytes, ascii('GIF87a')) || hasPrefix(bytes, ascii('GIF89a'))) && bytes.length >= 14 &&
      bytes.readUInt16LE(6) > 0 && bytes.readUInt16LE(8) > 0) {
    const firstBlock = 13 + ((bytes[10] & 0x80) ? 3 * (2 ** ((bytes[10] & 0x07) + 1)) : 0);
    if (firstBlock < bytes.length && [0x21, 0x2c, 0x3b].includes(bytes[firstBlock])) return 'GIF';
  }
  if (hasPrefix(bytes, RIFF) && bytes.length >= 12 &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'WebP';
  if (hasPrefix(bytes, BZIP) && bytes[3] >= 0x31 && bytes[3] <= 0x39) return 'bzip2';
  return undefined;
}

function classifyBytes(bytes) {
  if (hasUnsupportedBom(bytes)) return { kind: 'encoding' };
  const format = binarySignature(bytes);
  if (format) return { kind: 'binary', format };
  const hasNul = bytes.includes(0);
  const hasControl = hasNul || bytes.subarray(0, PROBE_BYTES).some(byte =>
    byte < 9 || (byte > 13 && byte < 32));
  if (hasControl && likelyWideText(bytes)) return { kind: 'encoding' };
  if (hasNul) return { kind: 'binary', format: 'binary' };
  return { kind: 'unknown' };
}

module.exports = { PROBE_BYTES, classifyBytes };
