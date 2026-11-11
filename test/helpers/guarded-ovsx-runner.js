'use strict';
// Test-only entry: actual pinned CLI, but HTTP is confined to this mock origin.
const { runCli } = require('../../scripts/publish-open-vsx');
const [registry, ...args] = process.argv.slice(2);
runCli({ registry, args, allowLoopback: true });
