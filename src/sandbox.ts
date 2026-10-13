import { spawn, type ChildProcess } from 'node:child_process';
import * as http from 'node:http';
import { sleep, runCmd } from './util';

/** Env vars allowed through the sandbox boundary. Everything else is dropped. */
const ENV_ALLOW = new Set([
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'SYSTEMROOT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USER',
  'USERNAME',
  'LOGNAME',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'ComSpec',
  'PATHEXT',
  'SHELL',
  'TERM',
  'TZ',
]);

export function scrubbedEnv(port: number, extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const k of ENV_ALLOW) {
    if (process.env[k] !== undefined) env[k] = process.env[k];
  }
  env['PORT'] = String(port);
  for (const [k, v] of Object.entries(extra)) env[k] = v;
  return env;
}

/** Replace the {PORT} token in an argv template with the real port. */
export function withPort(argv: string[], port: number): string[] {
  return argv.map((a) => a.replaceAll('{PORT}', String(port)));
}

export interface ManagedProcess {
  onLog: (cb: (line: string) => void) => void;
  /** Last N lines of combined output (for self-heal analysis). */
  recentLog: () => string;
  /** Resolves with the exit code when the process ends. */
  exited: Promise<number | null>;
  kill: () => void;
}

const LOG_CAP = 300;

export function launch(argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }): ManagedProcess {
  const listeners: Array<(line: string) => void> = [];
  const ring: string[] = [];
  const push = (line: string) => {
    const clean = line.replace(/\n$/, '');
    if (!clean) return;
    ring.push(clean);
    if (ring.length > LOG_CAP) ring.shift();
    for (const cb of listeners) cb(clean);
  };

  const child: ChildProcess = spawn(argv[0], argv.slice(1), {
    cwd: opts.cwd,
    env: opts.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (d: Buffer) => d.toString().split('\n').forEach(push));
  child.stderr?.on('data', (d: Buffer) => d.toString().split('\n').forEach(push));
  child.on('error', (err) => push(`[vibe] process error: ${(err as Error).message}`));

  const exited = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  return {
    onLog: (cb) => {
      listeners.push(cb);
    },
    recentLog: () => ring.join('\n'),
    exited,
    kill: () => {
      try {
        if (process.platform === 'win32') child.kill();
        else if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* already dead */
      }
    },
  };
}

/** Run an install/build step with streamed logs and a hard timeout. */
export async function runStep(
  label: string,
  argv: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; onLog?: (line: string) => void }
): Promise<void> {
  const proc = launch(argv, { cwd: opts.cwd, env: opts.env ?? process.env });
  if (opts.onLog) proc.onLog(opts.onLog);
  const timeout = setTimeout(() => proc.kill(), opts.timeoutMs ?? 10 * 60 * 1000);
  const code = await proc.exited;
  clearTimeout(timeout);
  if (code !== 0) {
    const tail = proc.recentLog().split('\n').slice(-15).join('\n');
    throw new Error(`Step failed (${label}, exit ${code}):\n${tail}`);
  }
}

function isUp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
      res.resume();
      resolve(true); // any HTTP response = the app is alive (even a 404)
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait until the app answers HTTP or the child exits.
 * Returns 'ready' | 'exited' | 'timeout'.
 */
export async function waitForReadyOrExit(
  proc: ManagedProcess,
  port: number,
  timeoutMs = 30000
): Promise<'ready' | 'exited' | 'timeout'> {
  const start = Date.now();
  let exitedCode: number | null | undefined;
  void proc.exited.then((c) => {
    exitedCode = c;
  });
  // give the process a moment before the first probe
  await sleep(600);
  while (Date.now() - start < timeoutMs) {
    if (exitedCode !== undefined) return 'exited';
    if (await isUp(port)) return 'ready';
    await sleep(500);
  }
  return exitedCode !== undefined ? 'exited' : 'timeout';
}

/** Open a cloudflared tunnel; resolves with the public URL when it appears. */
export async function openTunnel(port: number, onLog: (line: string) => void): Promise<string> {
  const proc = launch(['cloudflared', 'tunnel', '--url', `http://localhost:${port}`], {
    cwd: process.cwd(),
    env: process.env,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Timed out waiting for cloudflared URL.'));
    }, 25000);
    proc.onLog((line) => {
      onLog(line);
      const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    });
    void proc.exited.then(() => {
      clearTimeout(timer);
      reject(new Error('cloudflared exited before publishing a URL.'));
    });
  });
}

/** Best-effort `docker build` + `docker run` for --docker mode. */
export async function dockerRun(
  tag: string,
  name: string,
  dir: string,
  port: number,
  extraEnv: Record<string, string>,
  onLog: (line: string) => void
): Promise<ManagedProcess> {
  await runStep('docker build', ['docker', 'build', '-t', tag, '.'], {
    cwd: dir,
    onLog,
    timeoutMs: 10 * 60 * 1000,
  });
  const args = ['docker', 'run', '--rm', '--name', name, '-p', `${port}:${port}`, '-e', `PORT=${port}`];
  for (const [k, v] of Object.entries(extraEnv)) args.push('-e', `${k}=${v}`);
  args.push(tag);
  const proc = launch(args, { cwd: dir, env: process.env });
  // stopping the container is the kill path
  const origKill = proc.kill.bind(proc);
  (proc as { kill: () => void }).kill = () => {
    void runCmd(['docker', 'stop', name], { timeoutMs: 15000 });
    origKill();
  };
  return proc;
}
