import * as fs from 'node:fs';
import * as path from 'node:path';

export type StackKind = 'node' | 'python' | 'go' | 'rust' | 'static' | 'unknown';

export interface InstallStep {
  label: string;
  argv: string[];
}

/**
 * A detected runnable stack. `start` is an argv template where the literal
 * token `{PORT}` is replaced with the allocated port at launch time.
 */
export interface DetectedStack {
  kind: StackKind;
  label: string;
  install: InstallStep[];
  /** Human-readable start command, e.g. "npm start". */
  startLabel: string;
  start: string[];
  hasDockerfile: boolean;
  notes: string[];
  /** Set for node stacks: npm | yarn | pnpm (used by self-heal). */
  pm?: 'npm' | 'yarn' | 'pnpm';
  /** Set for python stacks: absolute path to the venv pip (used by self-heal). */
  pip?: string;
  /** Non-empty when detection failed with a user-actionable message. */
  error?: string;
}

const exists = (dir: string, ...parts: string[]): boolean =>
  fs.existsSync(path.join(dir, ...parts));

const read = (dir: string, ...parts: string[]): string | null => {
  try {
    return fs.readFileSync(path.join(dir, ...parts), 'utf8');
  } catch {
    return null;
  }
};

function firstExisting(dir: string, files: string[]): string | null {
  for (const f of files) if (exists(dir, f)) return f;
  return null;
}

function venvBin(dir: string, name: string): string {
  const venv = path.join(dir, '.vibe-venv');
  return process.platform === 'win32'
    ? path.join(venv, 'Scripts', `${name}.exe`)
    : path.join(venv, 'bin', name);
}

function detectNode(dir: string, hasDockerfile: boolean, notes: string[]): DetectedStack {
  let pkg: { scripts?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(read(dir, 'package.json') ?? '{}') as typeof pkg;
  } catch {
    /* keep empty */
  }
  let pm: 'npm' | 'yarn' | 'pnpm' = 'npm';
  let installArgv: string[];
  if (exists(dir, 'pnpm-lock.yaml')) {
    pm = 'pnpm';
    installArgv = ['pnpm', 'install', '--frozen-lockfile'];
  } else if (exists(dir, 'yarn.lock')) {
    pm = 'yarn';
    installArgv = ['yarn', 'install', '--frozen-lockfile'];
  } else if (exists(dir, 'package-lock.json')) {
    installArgv = ['npm', 'ci'];
  } else {
    installArgv = ['npm', 'install'];
  }

  const scripts = pkg.scripts ?? {};
  let start: string[];
  let startLabel: string;
  if (scripts.start) {
    start = [pm, 'start'];
    startLabel = `${pm} start`;
  } else {
    const entry = firstExisting(dir, [
      'server.js',
      'index.js',
      'app.js',
      'main.js',
      'src/index.js',
      'src/server.js',
      'src/app.js',
    ]);
    if (entry) {
      start = ['node', entry];
      startLabel = `node ${entry}`;
    } else if (scripts.dev) {
      start = pm === 'npm' ? ['npm', 'run', 'dev'] : [pm, 'dev'];
      startLabel = `${pm}${pm === 'npm' ? ' run' : ''} dev`;
      notes.push('No "start" script found — falling back to the "dev" script.');
    } else {
      return {
        kind: 'node',
        label: 'Node.js',
        install: [],
        startLabel: '',
        start: [],
        hasDockerfile,
        notes,
        pm,
        error:
          'package.json has no "start" script and no recognized entry file ' +
          '(server.js, index.js, app.js, main.js). Add a "start" script, then run vibe again.',
      };
    }
  }

  return {
    kind: 'node',
    label: 'Node.js',
    install: [{ label: installArgv.join(' '), argv: installArgv }],
    startLabel,
    start,
    hasDockerfile,
    notes,
    pm,
  };
}

type PyFramework = 'streamlit' | 'django' | 'flask' | 'fastapi' | 'plain';

function detectPython(dir: string, hasDockerfile: boolean, notes: string[]): DetectedStack | null {
  const hasReq = exists(dir, 'requirements.txt');
  const hasPyproject = exists(dir, 'pyproject.toml');
  const entry = firstExisting(dir, [
    'app.py',
    'main.py',
    'application.py',
    'wsgi.py',
    'app/app.py',
    'src/app.py',
    'src/main.py',
  ]);
  if (!hasReq && !hasPyproject && !exists(dir, 'setup.py') && !exists(dir, 'setup.cfg') && !entry) {
    return null;
  }

  const venvPython = venvBin(dir, process.platform === 'win32' ? 'python' : 'python');
  const pip = venvBin(dir, 'pip');

  // Framework sniffing across candidate entry files.
  let framework: PyFramework = 'plain';
  let entryFile = entry;
  if (exists(dir, 'manage.py')) {
    framework = 'django';
    entryFile = 'manage.py';
  } else {
    const candidates = [
      'app.py',
      'main.py',
      'application.py',
      'wsgi.py',
      'app/app.py',
      'src/app.py',
      'src/main.py',
    ];
    outer: for (const f of candidates) {
      const src = read(dir, f);
      if (!src) continue;
      if (/import\s+streamlit|from\s+streamlit\s+import/.test(src)) {
        framework = 'streamlit';
        entryFile = f;
        break outer;
      }
      if (/FastAPI\s*\(/.test(src)) {
        framework = 'fastapi';
        entryFile = f;
        break outer;
      }
      if (/Flask\s*\(/.test(src)) {
        framework = 'flask';
        entryFile = f;
        break outer;
      }
    }
  }

  const install: InstallStep[] = [
    { label: 'python3 -m venv .vibe-venv', argv: ['python3', '-m', 'venv', '.vibe-venv'] },
  ];
  if (hasReq) install.push({ label: 'pip install -r requirements.txt', argv: [pip, 'install', '-r', 'requirements.txt'] });
  else if (hasPyproject) install.push({ label: 'pip install .', argv: [pip, 'install', '.'] });
  else notes.push('No requirements.txt found — skipping dependency install.');

  let start: string[];
  let startLabel: string;
  if (!entryFile) {
    return {
      kind: 'python',
      label: 'Python',
      install: [],
      startLabel: '',
      start: [],
      hasDockerfile,
      notes,
      error:
        'Found Python markers but no entry file (app.py, main.py, manage.py, …). ' +
        'Add one, then run vibe again.',
    };
  }
  const mod = path.basename(entryFile, '.py');
  switch (framework) {
    case 'django':
      start = [venvPython, 'manage.py', 'runserver', '127.0.0.1:{PORT}', '--noreload'];
      startLabel = 'python manage.py runserver (django)';
      break;
    case 'streamlit':
      start = [venvPython, '-m', 'streamlit', 'run', entryFile, '--server.port', '{PORT}', '--server.headless', 'true'];
      startLabel = `streamlit run ${entryFile}`;
      break;
    case 'flask':
      start = [venvPython, '-m', 'flask', '--app', mod, 'run', '--host', '127.0.0.1', '--port', '{PORT}'];
      startLabel = `flask run ${entryFile}`;
      break;
    case 'fastapi':
      start = [venvPython, '-m', 'uvicorn', `${mod}:app`, '--host', '127.0.0.1', '--port', '{PORT}'];
      startLabel = `uvicorn ${mod}:app`;
      notes.push('FastAPI detected — needs uvicorn (auto-installed if missing).');
      break;
    default:
      start = [venvPython, entryFile];
      startLabel = `python ${entryFile}`;
      break;
  }

  return {
    kind: 'python',
    label: `Python (${framework})`,
    install,
    startLabel,
    start,
    hasDockerfile,
    notes,
    pip,
  };
}

/** Honest heuristic stack detection. Never guesses silently — unknown is a result. */
export function detect(dir: string): DetectedStack {
  const hasDockerfile = exists(dir, 'Dockerfile') || exists(dir, 'dockerfile');
  const notes: string[] = [];
  if (hasDockerfile) notes.push('Dockerfile present — ignored unless you pass --docker.');

  if (exists(dir, 'package.json')) return detectNode(dir, hasDockerfile, notes);

  const py = detectPython(dir, hasDockerfile, notes);
  if (py) return py;

  if (exists(dir, 'go.mod')) {
    return {
      kind: 'go',
      label: 'Go',
      install: [{ label: 'go mod download', argv: ['go', 'mod', 'download'] }],
      startLabel: 'go run .',
      start: ['go', 'run', '.'],
      hasDockerfile,
      notes,
    };
  }

  if (exists(dir, 'Cargo.toml')) {
    return {
      kind: 'rust',
      label: 'Rust',
      install: [],
      startLabel: 'cargo run',
      start: ['cargo', 'run'],
      hasDockerfile,
      notes: [...notes, 'First build may take a while — that is cargo, not vibe.'],
    };
  }

  if (exists(dir, 'index.html')) {
    return {
      kind: 'static',
      label: 'Static site',
      install: [],
      startLabel: 'python3 -m http.server {PORT}',
      start: ['python3', '-m', 'http.server', '{PORT}'],
      hasDockerfile,
      notes: [...notes, 'No app framework detected — serving static files.'],
    };
  }

  return {
    kind: 'unknown',
    label: 'Unknown',
    install: [],
    startLabel: '',
    start: [],
    hasDockerfile,
    notes,
    error:
      'Could not detect a runnable stack. vibe looks for: package.json (Node), ' +
      'requirements.txt/pyproject.toml/app.py (Python), go.mod (Go), Cargo.toml (Rust), ' +
      'index.html (static), or a Dockerfile (with --docker).',
  };
}
