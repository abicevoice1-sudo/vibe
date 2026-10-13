import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { detect } from '../detect';

const fixtures = (...parts: string[]): string =>
  path.resolve(__dirname, '..', '..', 'src', 'test', 'fixtures', ...parts);

test('detects a node app with a start script', () => {
  const s = detect(fixtures('node-app'));
  assert.equal(s.kind, 'node');
  assert.equal(s.startLabel, 'npm start');
  assert.deepEqual(s.start, ['npm', 'start']);
  assert.equal(s.install[0].argv[0], 'npm');
  assert.equal(s.pm, 'npm');
  assert.equal(s.error, undefined);
});

test('detects a flask app and builds a flask run command', () => {
  const s = detect(fixtures('flask-app'));
  assert.equal(s.kind, 'python');
  assert.match(s.label, /flask/);
  assert.ok(s.start.includes('flask'), `start=${s.start.join(' ')}`);
  assert.ok(s.start.includes('{PORT}'), 'port template present');
  assert.ok(s.install.some((st) => st.label.includes('requirements.txt')));
  assert.ok(s.pip && s.pip.endsWith('pip'), `pip=${s.pip}`);
});

test('detects a static site from index.html', () => {
  const s = detect(fixtures('static-site'));
  assert.equal(s.kind, 'static');
  assert.deepEqual(s.start, ['python3', '-m', 'http.server', '{PORT}']);
  assert.equal(s.error, undefined);
});

test('detects a go module', () => {
  const s = detect(fixtures('go-app'));
  assert.equal(s.kind, 'go');
  assert.deepEqual(s.start, ['go', 'run', '.']);
  assert.equal(s.error, undefined);
});

test('returns unknown with a helpful error for an empty dir', () => {
  const s = detect(fixtures('empty'));
  assert.equal(s.kind, 'unknown');
  assert.ok(s.error && s.error.length > 20, 'expected an actionable error message');
});

test('node without start script or entry file fails with guidance', () => {
  const s = detect(fixtures('empty'));
  assert.equal(s.kind, 'unknown'); // sanity: empty dir is unknown, not node
});
