import * as net from 'node:net';

const MIN_PORT = 3000;
const MAX_PORT = 9999;

function tryListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

/** Find a free TCP port, scanning upward from `preferred` (default 3000). */
export async function findFreePort(preferred?: number): Promise<number> {
  let start = preferred ?? MIN_PORT;
  if (!Number.isInteger(start) || start < 1 || start > 65535) start = MIN_PORT;
  for (let p = start; p <= MAX_PORT; p++) {
    if (await tryListen(p)) return p;
  }
  // wrap around once, in case the preferred port was high
  for (let p = MIN_PORT; p < start && p <= MAX_PORT; p++) {
    if (await tryListen(p)) return p;
  }
  throw new Error(`No free port found in range ${MIN_PORT}-${MAX_PORT}.`);
}

export async function isPortFree(port: number): Promise<boolean> {
  return tryListen(port);
}
