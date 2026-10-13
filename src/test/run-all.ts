/**
 * Portable test entrypoint.
 * `node --test` only expands glob patterns on node 21+, so instead of
 * relying on shell/node globbing we discover the compiled *.test.js files
 * ourselves and hand node --test an explicit file list. Works on node 18+.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const files = readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js') && f !== 'run-all.js')
  .map((f) => join(__dirname, f));

if (files.length === 0) {
  console.error('run-all: no *.test.js files found in', __dirname);
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(res.status ?? 1);
