'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { marketplaceRecord, checkRegistry } = require('../scripts/verify-published-beta');
const expected = { publisher: 'idfedorov09', name: 'jbsearch', version: '0.3.3', sha256: 'a'.repeat(64) };
function marketplace(marker='true', sha=expected.sha256) {
  return {results:[{extensions:[{publisher:{publisherName:expected.publisher},extensionName:expected.name,versions:[{version:expected.version,flags:'validated',properties:[{key:'Microsoft.VisualStudio.Code.PreRelease',value:marker},{key:'Microsoft.VisualStudio.Services.VsixSha256',value:sha}]}]}]}]};
}
test('Marketplace requires the exact validated identity, version, channel and hash', () => {
  assert.doesNotThrow(() => marketplaceRecord(marketplace(), expected));
  assert.throws(() => marketplaceRecord(marketplace('false'), expected), /not marked/);
  assert.throws(() => marketplaceRecord(marketplace('true', 'b'.repeat(64)), expected), /SHA-256/);
  assert.throws(() => marketplaceRecord(marketplace(), { ...expected, version:'0.3.4' }), /missing/);
});
test('Open VSX requires an exact pre-release and matching digest from the registry', async () => {
  const metadata = {namespace:expected.publisher,name:expected.name,version:expected.version,preRelease:true,files:{sha256:'https://open-vsx.org/api/idfedorov09/jbsearch/0.3.3/file/idfedorov09.jbsearch-0.3.3.sha256'}};
  const fetcher = async url => String(url).includes('/file/') ? {ok:true,text:async()=>expected.sha256} : {ok:true,json:async()=>metadata};
  await checkRegistry('open-vsx', expected, fetcher);
  await assert.rejects(checkRegistry('open-vsx', expected, async () => ({ok:true,json:async()=>({...metadata,preRelease:false})})), /not marked/);
  await assert.rejects(checkRegistry('open-vsx', expected, async url => String(url).includes('/file/') ? {ok:true,text:async()=> 'b'.repeat(64)} : {ok:true,json:async()=>metadata}), /SHA-256/);
  await assert.rejects(checkRegistry('open-vsx', expected, async () => ({ok:false,status:404})), /HTTP 404/);
});


test('after a duplicate skip only matching exact artifact hashes can succeed', async () => {
  // The verification is independent of whether the CLI uploaded or skipped.
  marketplaceRecord(marketplace('true', expected.sha256), expected);
  assert.throws(() => marketplaceRecord(marketplace('true', 'b'.repeat(64)), expected), /SHA-256/);
  const metadata = { namespace: expected.publisher, name: expected.name, version: expected.version,
    preRelease: true, files: { sha256: 'https://open-vsx.org/api/idfedorov09/jbsearch/0.3.3/file/idfedorov09.jbsearch-0.3.3.sha256' } };
  function registryHash(hash) {
    return async url => String(url).includes('/file/') ? { ok: true, text: async () => hash } : { ok: true, json: async () => metadata };
  }
  await checkRegistry('open-vsx', expected, registryHash(expected.sha256));
  await assert.rejects(checkRegistry('open-vsx', expected, registryHash('b'.repeat(64))), /SHA-256/);
});
