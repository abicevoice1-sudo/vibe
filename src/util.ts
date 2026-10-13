import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export class VibeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VibeError';
  }
}

/** Run a command without a shell; resolves with exit code + captured output. */
export function runCmd(
  argv: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      argv[0],
      argv.slice(1),
      {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        timeout: opts.timeoutMs ?? 10 * 60 * 1000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as unknown as { code?: unknown }).code === 'number'
            ? ((err as unknown as { code: number }).code as number)
            : err
              ? 1
              : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      }
    );
    void child;
  });
}

/** True if a binary is on PATH. */
export async function which(bin: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? ['where', bin] : ['command', '-v', bin];
  const runner = process.platform === 'win32' ? probe : ['sh', '-c', `command -v ${bin}`];
  const r = await runCmd(runner, { timeoutMs: 5000 });
  return r.code === 0 && r.stdout.trim().length > 0;
}

/** `tool --version`, trimmed to one line; null when unavailable. */
export async function toolVersion(cmd: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const r = await runCmd([cmd, ...args], { timeoutMs: 8000 });
    if (r.code !== 0) return null;
    const line = (r.stdout.trim() || r.stderr.trim()).split('\n')[0].trim();
    return line || null;
  } catch {
    return null;
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'app';
}

export function vibeHome(): string {
  return path.join(os.homedir(), '.vibe');
}

export function runsDir(): string {
  return path.join(vibeHome(), 'runs');
}

const COPY_EXCLUDES = new Set(['node_modules', '.git', '.vibe-venv', 'dist', '__pycache__', '.next', '.venv', 'venv']);

/** Recursive copy that skips heavy/derived directories. */
export function copyDirFiltered(src: string, dest: string): void {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => {
      const base = path.basename(p);
      if (p !== src && COPY_EXCLUDES.has(base)) return false;
      return true;
    },
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
