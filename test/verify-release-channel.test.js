'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pipeline } = require('node:stream/promises');
const { test } = require('node:test');
const { ZipFile } = createRequire(require.resolve('@vscode/vsce'))('yazl');
const { verifyReleaseChannel } = require('../scripts/verify-release-channel');
const identity = { id: 'idfedorov09.jbsearch', version: '0.3.3' };

async function fixture(t, markers = [], version = identity.version, overrideXml) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'jbsearch-release-channel-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'test.vsix');
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify({ publisher: 'idfedorov09', name: 'jbsearch', version, engines: { vscode: '^1.143.1' } })), 'extension/package.json');
  const xml = overrideXml || `<PackageManifest><Metadata><Identity Publisher="idfedorov09" Id="jbsearch" Version="${version}"/><Properties>${markers.map(value => `<Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="${value}"/>`).join('')}</Properties></Metadata></PackageManifest>`;
  zip.addBuffer(Buffer.from(xml), 'extension.vsixmanifest');
  zip.end(); await pipeline(zip.outputStream, fs.createWriteStream(filename));
  return filename;
}

test('a true marker is required for the intended pre-release version', async t => {
  const file = await fixture(t, ['true']);
  assert.deepEqual(await verifyReleaseChannel(file, 'pre-release', identity), { ...identity, channel: 'pre-release' });
  await assert.rejects(verifyReleaseChannel(file, 'stable', identity), /must not contain/);
});

test('a stable package is not accepted as a pre-release', async t => {
  const file = await fixture(t);
  await verifyReleaseChannel(file, 'stable', identity);
  await assert.rejects(verifyReleaseChannel(file, 'pre-release', identity), /exactly one true/);
});

test('false or duplicated markers cannot pass the pre-release check', async t => {
  for (const markers of [['false'], ['true', 'true']]) {
    const file = await fixture(t, markers);
    await assert.rejects(verifyReleaseChannel(file, 'pre-release', identity), /exactly one true/);
  }
});

test('wrong version or identity cannot pass', async t => {
  const file = await fixture(t, ['true'], '0.3.4');
  await assert.rejects(verifyReleaseChannel(file, 'pre-release', identity), /identity or version/);
  await assert.rejects(verifyReleaseChannel(file, 'pre-release', { ...identity, id: 'wrong.jbsearch' }), /identity or version/);
});


test('split Properties, multiple Metadata, and multiple Identity elements fail closed', async t => {
  const ident = '<Identity Publisher="idfedorov09" Id="jbsearch" Version="0.3.3"/>';
  const yes = '<Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="true"/>';
  const no = '<Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="false"/>';
  const metadata = `<Metadata>${ident}<Properties>${yes}</Properties></Metadata>`;
  const cases = [
    [`<Metadata>${ident}<Properties>${yes}</Properties><Properties>${no}</Properties></Metadata>`, /exactly one Properties/],
    [metadata + `<Metadata>${ident}<Properties>${no}</Properties></Metadata>`, /exactly one Metadata/],
    [`<Metadata>${ident}${ident}<Properties>${yes}</Properties></Metadata>`, /exactly one Identity/],
  ];
  for (const [body, error] of cases) {
    const file = await fixture(t, [], identity.version, `<PackageManifest>${body}</PackageManifest>`);
    await assert.rejects(verifyReleaseChannel(file, 'pre-release', identity), error);
  }
});
