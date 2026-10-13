import chalk from 'chalk';
import { toolVersion, which } from './util';

interface Tool {
  name: string;
  cmd: string;
  args?: string[];
  hint: string;
  required: boolean;
}

const TOOLS: Tool[] = [
  { name: 'git', cmd: 'git', hint: 'https://git-scm.com/downloads', required: true },
  { name: 'node', cmd: 'node', hint: 'https://nodejs.org (v18+)', required: true },
  { name: 'npm', cmd: 'npm', hint: 'ships with node', required: true },
  { name: 'python3', cmd: 'python3', hint: 'https://www.python.org/downloads', required: false },
  { name: 'pip3', cmd: 'pip3', hint: 'ships with python3', required: false },
  { name: 'go', cmd: 'go', args: ['version'], hint: 'https://go.dev/dl', required: false },
  { name: 'cargo', cmd: 'cargo', hint: 'https://rustup.rs', required: false },
  { name: 'docker', cmd: 'docker', hint: 'https://docs.docker.com/get-docker', required: false },
  { name: 'cloudflared', cmd: 'cloudflared', hint: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads', required: false },
];

export async function doctor(): Promise<void> {
  console.log(chalk.bold('\nvibe doctor\n'));
  const rows: Array<[string, string, string]> = [];
  for (const t of TOOLS) {
    const present = await which(t.cmd);
    const ver = present ? await toolVersion(t.cmd, t.args) : null;
    const status = present ? chalk.green('ok') : t.required ? chalk.red('MISSING') : chalk.yellow('missing');
    rows.push([t.name, ver ?? '—', present ? status : `${status}  ${chalk.dim(t.hint)}`]);
  }
  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w1 = Math.max(...rows.map((r) => r[1].length));
  for (const [name, ver, status] of rows) {
    console.log(`  ${name.padEnd(w0)}  ${ver.padEnd(w1)}  ${status}`);
  }
  console.log(
    chalk.dim('\n"missing" tools only matter for the stacks that need them (go → Go apps, docker → --docker mode).')
  );
}
