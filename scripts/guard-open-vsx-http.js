'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

// This guard intentionally accepts only the request form used by pinned ovsx.
// Unknown forms fail closed, and errors never include a URL, option or credential.
const REJECTED = 'Open VSX request blocked by the credential safety guard.';
const ALLOWED_OPTIONS = new Set(['method', 'headers', 'timeout']);
const ALLOWED_HEADERS = new Set(['authorization', 'content-type', 'x-openvsx-token']);

function reject() { throw new Error(REJECTED); }
function plainObject(value) {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function dataProperties(value) {
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(item => Object.hasOwn(item, 'value'));
}

function assertSafeRequest(args, origin, secret) {
  try {
    if (args.length !== 3 || !(args[0] instanceof URL) || Object.getPrototypeOf(args[0]) !== URL.prototype ||
        !plainObject(args[1]) || !dataProperties(args[1]) || typeof args[2] !== 'function') reject();
    const [url, options] = args;
    if (url.origin !== origin || url.username || url.password || url.hash) reject();
    if (secret && (url.pathname.includes(secret) || decodeURIComponent(url.pathname).includes(secret))) reject();
    if (Object.keys(options).some(key => !ALLOWED_OPTIONS.has(key)) || !['GET', 'POST'].includes(options.method)) reject();
    if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout < 0)) reject();
    if (options.headers !== undefined) {
      if (!plainObject(options.headers) || !dataProperties(options.headers)) reject();
      for (const [name, value] of Object.entries(options.headers)) {
        if (!ALLOWED_HEADERS.has(name.toLowerCase()) || typeof value !== 'string') reject();
      }
    }
    const parameters = [...url.searchParams.entries()];
    if (parameters.length) {
      // The only query needed for this extension's header-authenticated publish
      // is the public size-limit lookup; no query may carry credential data.
      if (url.pathname !== '/api/-/size-limit' || parameters.length !== 2 ||
          url.searchParams.getAll('namespace').length !== 1 || url.searchParams.get('namespace') !== 'idfedorov09' ||
          url.searchParams.getAll('extension').length !== 1 || url.searchParams.get('extension') !== 'jbsearch' ||
          parameters.some(([key, value]) => secret && (key.includes(secret) || value.includes(secret)))) reject();
    }
  } catch {
    reject();
  }
}

function installRequestGuard({ origin, allowLoopback = false, secret }) {
  let parsed;
  try { parsed = new URL(origin); } catch { reject(); }
  const isPublic = parsed.origin === 'https://open-vsx.org';
  const isTest = allowLoopback && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
  if ((!isPublic && !isTest) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) reject();
  for (const protocol of [http, https]) {
    for (const method of ['request', 'get']) {
      const original = protocol[method];
      protocol[method] = function (...args) {
        assertSafeRequest(args, parsed.origin, secret);
        try { return Reflect.apply(original, this, args); } catch { reject(); }
      };
    }
  }
}
module.exports = { assertSafeRequest, installRequestGuard, REJECTED };
