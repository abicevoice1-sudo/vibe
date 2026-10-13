import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { detect } from './detect';
import { matchHeal, type HealAction } from './heal';
import { findFreePort } from './ports';
import {
  launch,
  runStep,
  scrubbedEnv,
  withPort,
  waitForReadyOrExit,
  openTunnel,
  dockerRun,
  type ManagedProcess,
} from './sandbox';
import { VibeError, runCmd, copyDirFiltered, slugify, runsDir, which } from './util';

export interface RunOptions {
  docker?: boolean;
  tunnel?: boolean;
  env?: Record<string, string>;
  port?: number;
  install?: boolean;
}

interface Target {
  kind: 'local' | 'git';
  slug: string;
  url?: string;
  localDir?: string;
}

function resolveTarget(input: string): Target {
  const trimmed = input.trim();
  // Local directory?
  try {
    if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) {
      return { kind: 'local', slug: slugify(path.basename(path.resolve(trimmed))), localDir: path.resolve(trimmed) };
    }
  } catch {
    /* fall through */
  }
  // GitHub shorthand: owner/repo
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    const [owner, repo] = trimmed.split('/');
    return { kind: 'git', slug: slugify(`${owner}-${repo}`), url: `https://github.com/${owner}/${repo}.git` };
  }
  // Full git URL
  if (/^https?:\/\/.+/.test(trimmed)) {
    const m = trimmed.match(/\/([\w.-]+?)(?:\.git)?\/?$/);
    return { kind: 'git', slug: slugify(m ? m[1] : 'repo'), url: trimmed };
  }
  throw new VibeError(
    `Could not understand "${input}". Use a local directory, owner/repo, or a git URL.`
  );
}

async function fetchTarget(t: Target): Promise<string> {
  const runDir = path.join(runsDir(), `${t.slug}-${Date.now()}`);
  fs.mkdirSync(runDir, { recursive: true });
  if (t.kind === 'git') {
    const spin = ora(`Cloning ${t.url}`).start();
    const r = await runCmd(['git', 'clone', '--depth', '1', t.url!, runDir], { timeoutMs: 5 * 60 * 1000 });
    if (r.code !== 0) {
      spin.fail('Clone failed');
      throw new VibeError(`git clone failed:\n${(r.stderr || r.stdout).split('\n').slice(-8).join('\n')}`);
    }
    spin.succeed(`Cloned into ${chalk.dim(runDir)}`);
  } else {
    const spin = ora(`Copying ${t.localDir}`).start();
    copyDirFiltered(t.localDir!, runDir);
    spin.succeed(`Working copy at ${chalk.dim(runDir)}`);
  }
  return runDir;
}

async function applyHeal(action: HealAction, stack: ReturnType<typeof detect>, runDir: string): Promise<void> {
  console.log(chalk.yellow(`  ↻ self-heal: ${action.message}`));
  switch (action.kind) {
    case 'npm-install': {
      const pm = stack.pm ?? 'npm';
      const argv = pm === 'npm' ? ['npm', 'install', action.target] : [pm, 'add', action.target];
      await runStep(`${argv.join(' ')}`, argv, { cwd: runDir, onLog: (l) => console.log(chalk.dim(`  [heal] ${l}`)) });
      break;
    }
    case 'pip-install': {
      const pip = stack.pip ?? 'pip3';
      await runStep(`pip install ${action.target}`, [pip, 'install', action.target], {
        cwd: runDir,
        onLog: (l) => console.log(chalk.dim(`  [heal] ${l}`)),
      });
      break;
    }
    case 'env-stub': {
      fs.appendFileSync(path.join(runDir, '.env'), `\n${action.target}=changeme\n`);
      console.log(
        chalk.yellow.bold(`  ⚠ wrote ${action.target}=changeme to .env — set a real value before trusting this run.`)
      );
      break;
    }
    case 'next-port':
      break; // handled by the retry loop
  }
}

function waitForShutdown(proc: ManagedProcess): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const bye = () => {
      if (done) return;
      done = true;
      console.log(chalk.dim('\nShutting down…'));
      proc.kill();
      setTimeout(resolve, 800);
    };
    process.once('SIGINT', bye);
    process.once('SIGTERM', bye);
    void proc.exited.then((code) => {
      if (!done) {
        done = true;
        console.log(chalk.yellow(`\nApp exited on its own (code ${code}).`));
      }
      resolve();
    });
  });
}

async function maybeTunnel(port: number): Promise<void> {
  if (!(await which('cloudflared'))) {
    console.log(chalk.yellow('  --tunnel requested but cloudflared is not installed — staying local-only.'));
    return;
  }
  const spin = ora('Opening public tunnel').start();
  try {
    const url = await openTunnel(port, (l) => console.log(chalk.dim(`  [tunnel] ${l}`)));
    spin.succeed(`Public URL: ${chalk.cyan.underline(url)}`);
  } catch (err) {
    spin.fail(`Tunnel failed (${(err as Error).message}) — staying local-only.`);
  }
}

function printReady(port: number): void {
  console.log();
  console.log(chalk.green.bold('  🚀 Running at ') + chalk.cyan.bold.underline(`http://localhost:${port}`));
  console.log(chalk.dim('  Press Ctrl+C to stop.\n'));
}

async function runDockerMode(runDir: string, slug: string, opts: RunOptions): Promise<void> {
  if (!(await which('docker'))) {
    throw new VibeError('docker is not installed. Run `vibe doctor` for install hints, or drop --docker.');
  }
  const tag = `vibe-${slug}`;
  const name = `vibe-${slug}-${Date.now()}`;
  const port = opts.port ?? (await findFreePort());
  const proc = await dockerRun(tag, name, runDir, port, opts.env ?? {}, (l) =>
    console.log(chalk.dim(`  [docker] ${l}`))
  );
  const status = await waitForReadyOrExit(proc, port, 60000);
  if (status !== 'ready') {
    proc.kill();
    throw new VibeError(
      `Container did not become ready in 60s.\n${proc.recentLog().split('\n').slice(-15).join('\n')}`
    );
  }
  printReady(port);
  if (opts.tunnel) await maybeTunnel(port);
  await waitForShutdown(proc);
}

export async function run(input: string, opts: RunOptions): Promise<void> {
  console.log(chalk.bold('\nvibe ') + chalk.dim('v0.1.0 — zero-touch execution engine'));
  const target = resolveTarget(input);
  console.log(chalk.dim(`Target: ${target.kind === 'git' ? target.url : target.localDir}`));

  const runDir = await fetchTarget(target);
  const stack = detect(runDir);
  if (stack.error) throw new VibeError(stack.error);

  console.log(`\nDetected  ${chalk.cyan.bold(stack.label)}`);
  console.log(chalk.dim(`Command   ${stack.startLabel}`));
  for (const n of stack.notes) console.log(chalk.dim(`Note      ${n}`));

  if (opts.docker) {
    if (!stack.hasDockerfile) throw new VibeError('No Dockerfile found — run without --docker to use native detection.');
    console.log(chalk.dim('\n--docker: building container image…'));
    await runDockerMode(runDir, target.slug, opts);
    return;
  }

  if (opts.install !== false) {
    for (const step of stack.install) {
      const spin = ora(step.label).start();
      try {
        await runStep(step.label, step.argv, {
          cwd: runDir,
          onLog: (l) => console.log(chalk.dim(`  [install] ${l}`)),
        });
        spin.succeed(step.label);
      } catch (err) {
        spin.fail(step.label);
        throw err instanceof Error ? err : new VibeError(String(err));
      }
    }
  } else {
    console.log(chalk.dim('\nSkipping install (--no-install).'));
  }

  const extraEnv = opts.env ?? {};
  let port = opts.port ?? (await findFreePort());
  const maxAttempts = 3; // initial launch + 2 self-heals

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const argv = withPort(stack.start, port);
    console.log(chalk.dim(`\nStarting: ${argv.join(' ')}  (PORT=${port})`));
    const proc = launch(argv, { cwd: runDir, env: scrubbedEnv(port, extraEnv) });
    proc.onLog((line) => console.log(chalk.dim('  [app] ') + line));

    const status = await waitForReadyOrExit(proc, port, 30000);
    if (status === 'ready') {
      printReady(port);
      if (opts.tunnel) await maybeTunnel(port);
      await waitForShutdown(proc);
      return;
    }

    const log = proc.recentLog();
    proc.kill();
    const action = attempt < maxAttempts ? matchHeal(log) : null;
    if (!action) {
      const tail = log.split('\n').slice(-20).join('\n');
      throw new VibeError(
        status === 'timeout'
          ? `App did not answer on port ${port} within 30s. Last output:\n${tail}`
          : `App exited before becoming ready (no self-heal rule matched). Last output:\n${tail}`
      );
    }
    await applyHeal(action, stack, runDir);
    if (action.kind === 'next-port') port = await findFreePort(port + 1);
  }
}
