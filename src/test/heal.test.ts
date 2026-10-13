import test from 'node:test';
import assert from 'node:assert/strict';
import { matchHeal } from '../heal';

test('matches missing node module', () => {
  const a = matchHeal(`Error: Cannot find module 'express'\nRequire stack:\n- /app/index.js`);
  assert.ok(a);
  assert.equal(a.kind, 'npm-install');
  assert.equal(a.target, 'express');
});

test('matches missing scoped node module (top-level package)', () => {
  const a = matchHeal(`Error: Cannot find module '@scope/pkg/subpath'`);
  assert.ok(a);
  assert.equal(a.kind, 'npm-install');
  assert.equal(a.target, '@scope/pkg');
});

test('ignores relative missing modules', () => {
  const a = matchHeal(`Error: Cannot find module './local-thing'`);
  assert.equal(a, null);
});

test('matches missing python module', () => {
  const a = matchHeal(`ModuleNotFoundError: No module named 'flask'`);
  assert.ok(a);
  assert.equal(a.kind, 'pip-install');
  assert.equal(a.target, 'flask');
});

test('matches EADDRINUSE', () => {
  const a = matchHeal(`Error: listen EADDRINUSE: address already in use :::3000`);
  assert.ok(a);
  assert.equal(a.kind, 'next-port');
});

test('matches missing env var (is not defined)', () => {
  const a = matchHeal(`ReferenceError: DATABASE_URL is not defined`);
  assert.ok(a);
  assert.equal(a.kind, 'env-stub');
  assert.equal(a.target, 'DATABASE_URL');
});

test('matches missing env var (required environment variable)', () => {
  const a = matchHeal(`Error: required environment variable "STRIPE_KEY" is missing`);
  assert.ok(a);
  assert.equal(a.kind, 'env-stub');
  assert.equal(a.target, 'STRIPE_KEY');
});

test('returns null when nothing matches', () => {
  assert.equal(matchHeal('SyntaxError: Unexpected token }'), null);
  assert.equal(matchHeal(''), null);
});
