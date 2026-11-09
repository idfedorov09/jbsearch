'use strict';

// A deliberately narrow ZIP32 recognizer. It checks bounded metadata, never
// decompresses entries, and treats every unsupported or ambiguous variant as
// ordinary input. In particular, a filename or a leading PK signature alone is
// not evidence that a file can be excluded from a text search.
const MAX_TAIL = 22 + 0xffff;
const MAX_DIRECTORY = 1024 * 1024;
const MAX_ENTRIES = 2048;
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

async function readExactly(handle, length, position) {
  const data = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(data, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error('The file changed while it was being inspected.');
    offset += bytesRead;
  }
  return data;
}

async function directoryIsConsistent(handle, size, prefix, end, endPosition) {
  const disk = end.readUInt16LE(4);
  const directoryDisk = end.readUInt16LE(6);
  const entriesOnDisk = end.readUInt16LE(8);
  const entries = end.readUInt16LE(10);
  const directorySize = end.readUInt32LE(12);
  const directoryOffset = end.readUInt32LE(16);
  if (disk || directoryDisk || entriesOnDisk !== entries || entries === 0xffff ||
      directorySize === 0xffffffff || directoryOffset === 0xffffffff ||
      entries > MAX_ENTRIES || directorySize > MAX_DIRECTORY ||
      directoryOffset + directorySize !== endPosition)
    return false;

  // An empty, single-disk archive has no local headers or central directory.
  if (!entries)
    return prefix === END && directorySize === 0 && directoryOffset === 0 && endPosition === 0;
  if (prefix !== LOCAL || directorySize < 46 || directoryOffset < 30) return false;

  const directory = await readExactly(handle, directorySize, directoryOffset);
  const ranges = [];
  let offset = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== CENTRAL) return false;
    const flags = directory.readUInt16LE(offset + 8);
    const method = directory.readUInt16LE(offset + 10);
    const checksum = directory.readUInt32LE(offset + 16);
    const compressedSize = directory.readUInt32LE(offset + 20);
    const uncompressedSize = directory.readUInt32LE(offset + 24);
    const nameLength = directory.readUInt16LE(offset + 28);
    const extraLength = directory.readUInt16LE(offset + 30);
    const commentLength = directory.readUInt16LE(offset + 32);
    const startDisk = directory.readUInt16LE(offset + 34);
    const localOffset = directory.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (!nameLength || next > directory.length || startDisk ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
        localOffset === 0xffffffff || localOffset + 30 + nameLength > directoryOffset)
      return false;
    const local = await readExactly(handle, 30 + nameLength, localOffset);
    if (local.readUInt32LE(0) !== LOCAL || local.readUInt16LE(6) !== flags ||
        local.readUInt16LE(8) !== method || local.readUInt16LE(26) !== nameLength ||
        !local.subarray(30).equals(directory.subarray(offset + 46, offset + 46 + nameLength)))
      return false;
    const localValues = [local.readUInt32LE(14), local.readUInt32LE(18), local.readUInt32LE(22)];
    const directoryValues = [checksum, compressedSize, uncompressedSize];
    // With data descriptors, local fields can be zero until the descriptor;
    // otherwise the two headers must agree. No compressed data is extracted.
    if (localValues.some((value, index) => value !== directoryValues[index] &&
        (!(flags & 8) || value !== 0))) return false;
    const localEnd = localOffset + 30 + nameLength + local.readUInt16LE(28) + compressedSize;
    if (localEnd > directoryOffset || localEnd > size) return false;
    ranges.push([localOffset, localEnd]);
    offset = next;
  }
  if (offset !== directory.length) return false;
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges[0][0] === 0 && ranges.every((range, index) => !index || ranges[index - 1][1] <= range[0]);
}

async function isConfirmedZip(handle, size) {
  if (!Number.isSafeInteger(size) || size < 22) return false;
  const prefix = (await readExactly(handle, 4, 0)).readUInt32LE(0);
  if (prefix !== LOCAL && prefix !== END) return false;
  const tailSize = Math.min(size, MAX_TAIL);
  const tailStart = size - tailSize;
  const tail = await readExactly(handle, tailSize, tailStart);
  // A comment may itself contain the signature, so only accept a complete,
  // self-consistent record ending exactly at the end of the file.
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) !== END || index + 22 + tail.readUInt16LE(index + 20) !== tail.length)
      continue;
    if (await directoryIsConsistent(handle, size, prefix, tail.subarray(index, index + 22), tailStart + index))
      return true;
  }
  return false;
}

module.exports = { isConfirmedZip };
