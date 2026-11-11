'use strict';

const { createHash } = require('node:crypto');

// TextDocument offsets and search ranges are UTF-16 code units. Hash the same
// units without UTF-8's replacement of unpaired surrogate values.
function contentHash(text) {
  return createHash('sha256').update(text, 'utf16le').digest('hex');
}

module.exports = { contentHash };
