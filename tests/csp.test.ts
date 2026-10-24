// The Content Security Policy builder (lib/security/csp.ts, G-054): eval and nonce-less style elements only in
// development, upgrade-insecure-requests only behind https. The policy as served is checked in tests/http/headers-http.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSecurityPolicy, newNonce } from '../lib/security/csp.ts';

test('development alone allows eval and style elements without a nonce; https alone upgrades requests', () => {
  const prod = contentSecurityPolicy('abc', { dev: false, https: true }), dev = contentSecurityPolicy('abc', { dev: true, https: false });
  assert.match(prod, /script-src 'self' 'nonce-abc' 'strict-dynamic'; /);
  assert.match(prod, /style-src-elem 'self' 'nonce-abc'; /);
  assert.doesNotMatch(prod, /unsafe-eval/);
  assert.match(prod, /; upgrade-insecure-requests$/);
  assert.match(dev, /script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'; /);
  assert.match(dev, /style-src-elem 'self' 'unsafe-inline'; /);
  assert.doesNotMatch(dev, /upgrade-insecure-requests/);
});

test('a nonce is 128 random bits, new every time', () => {
  const a = newNonce(), b = newNonce();
  assert.equal(Buffer.from(a, 'base64').length, 16);
  assert.notEqual(a, b);
});
