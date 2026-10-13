import test from 'node:test';
import assert from 'node:assert/strict';
import * as net from 'node:net';
import { findFreePort, isPortFree } from '../ports';

function occupy(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      resolve({ port, close: () => new Promise((r) => srv.close(() => r())) });
    });
  });
}

test('findFreePort returns a port in the scan range', async () => {
  const p = await findFreePort();
  assert.ok(p >= 3000 && p <= 9999, `port ${p} out of range`);
  assert.ok(await isPortFree(p), 'returned port should be free');
});

test('findFreePort skips an occupied port', async () => {
  const held = await occupy();
  try {
    const p = await findFreePort(held.port);
    assert.notEqual(p, held.port, 'must not return the occupied port');
    assert.ok(await isPortFree(p));
  } finally {
    await held.close();
  }
});
