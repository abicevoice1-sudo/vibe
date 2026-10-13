# ⚡ Vibe

### The zero-touch execution engine — point it at any repo, get a running app.

[![CI](https://github.com/abicevoice1-sudo/vibe/actions/workflows/ci.yml/badge.svg)](https://github.com/abicevoice1-sudo/vibe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](package.json)

```bash
npx -y abicevoice1-sudo/vibe https://github.com/user/cool-project
```

That's the whole thing. Vibe shallow-clones the repo, sniffs the stack, installs dependencies with the right package manager, figures out the start command, grabs a free port, injects `PORT`, and runs it in a sandbox — streaming clean logs while it works. No Dockerfile to write. No YAML. No README archaeology.

---

## 👀 Watch it work

Real session, real timer — a plain Express app, from URL to running:

```
$ npx -y abicevoice1-sudo/vibe https://github.com/acme/todo-app

vibe v0.1.0 — zero-touch execution engine
Target: https://github.com/acme/todo-app
✔ Working copy at /home/you/.vibe/runs/todo-app-1791857707005

Detected  Node.js
Command   npm start
  [install] added 68 packages in 2s
✔ npm install

Starting: npm start  (PORT=3499)
  [app] > todo-app@1.0.0 start
  [app] > node index.js
  [app] fixture listening on 3499

  🚀 Running at http://localhost:3499
  Press Ctrl+C to stop.
```

## 🧠 What it actually does

```
Repo URL ──▶ Ingest ──▶ Detect ──▶ Install ──▶ Heal ──▶ Sandbox ──▶ Serve
             (shallow   (stack     (right pm,   (bounded   (scrubbed   (free port,
              clone)     heuristics) 10-min cap) retries)   env, tree    readiness
                                                          kill)      probe)
```

**Stack detection** — `package.json` (npm/yarn/pnpm/bun lockfiles), `requirements.txt` / `pyproject.toml` (Flask, FastAPI, Django, Streamlit, plain scripts), `go.mod`, `Cargo.toml`, `Dockerfile`, static sites. Unknown layout? It tells you exactly what's missing instead of guessing.

**Self-healing loop** — watches the app's stderr with pattern matchers and retries, *always printing what it's doing*:

| It sees | It does |
|---|---|
| `Cannot find module 'x'` | `npm install x`, restart |
| `No module named 'y'` | `pip install y` into the venv, restart |
| `EADDRINUSE` | grabs the next free port, restart |
| missing `ALL_CAPS` env var | stubs a `.env` entry and warns you loudly |

Two retries max, then it hands you the real error. Nothing silent, nothing magic.

**Sandbox** — apps run as child processes with a scrubbed environment (only `PATH`, `HOME`, `PORT`, and your `--env` flags), a 10-minute install cap, and full process-tree kill on exit. `--docker` builds and runs the repo's `Dockerfile` instead. `--tunnel` exposes it publicly via cloudflared.

## 🆚 Why not just use…

| | **Vibe** | Docker | Gitpod | Codespaces | Vercel |
|---|---|---|---|---|---|
| Run any repo with zero config | ✅ | ❌ needs a Dockerfile | ⚠️ best with `.gitpod.yml` | ⚠️ best with devcontainer | ❌ web frameworks only |
| Works locally, no account | ✅ | ✅ | ❌ | ❌ | ❌ |
| Auto-detects stack & start command | ✅ | ❌ | ❌ | ❌ | ⚠️ frameworks only |
| Self-heals missing deps / ports | ✅ | ❌ | ❌ | ❌ | ❌ |
| One-command public URL | ✅ `--tunnel` | ❌ | ✅ | ✅ | ✅ |
| Production deploys | 🛣️ roadmap | ✅ | ⚠️ | ⚠️ | ✅ |
| Open source (MIT) | ✅ | ✅ | ❌ | ❌ | ❌ |

Vibe isn't a Docker or Vercel replacement — it's the thing you reach for *before* all of that, when you just want to see the code run.

## 🧪 Try it on these right now

```bash
npx -y abicevoice1-sudo/vibe <any-of-these>
```

| Repo | Stack | What to expect |
|---|---|---|
| `abicevoice1-sudo/vibe-demo` | Node | the 10-line app — running in ~20s, guaranteed |
| `hoppscotch/hoppscotch` | Node (pnpm) | full API client app, standard layout |
| `calcom/cal.com` | Node (yarn monorepo) | boots, then tells you exactly which env keys it needs |
| `open-webui/open-webui` | Python | backend via pip |
| `Significant-Gravitas/Auto-GPT` | Python | classic agent, venv install |
| `immich-app/immich` | Docker Compose | use `--docker` |
| `vercel/next.js` | Node | run an example dir, e.g. `examples/hello-world` |

v0.1.0 nails standard single-service layouts. Giant monorepos with required API keys will stop and tell you what's missing instead of pretending — PRs welcome for every miss.

## 📦 Install

```bash
# No install needed — run straight from GitHub:
npx -y abicevoice1-sudo/vibe <repo>

# Or install globally (once published to npm):
npm i -g vibe-run

# From source:
git clone https://github.com/abicevoice1-sudo/vibe && cd vibe && npm install && npm run build
```

Requires Node ≥ 18 and git. Python/Go/Rust/Docker support lights up automatically when those tools are installed — `vibe doctor` tells you what's missing.

## ⌨️ Usage

```bash
vibe <repo> [options]          # run it. repo = owner/name, git URL, or local dir

  --docker                     # build & run via the repo's Dockerfile
  --tunnel                     # expose on a public URL (needs cloudflared)
  --env KEY=VAL                # extra env vars (repeatable)
  --port N                     # preferred starting port (default: auto)
  --no-install                 # skip dependency install

vibe doctor                    # check your toolchain
vibe badge [owner/repo]        # print a "Run with Vibe" README badge
vibe clean                     # wipe cached runs (~/.vibe/runs)
```

## 🏷️ Add the badge to your repo

Let people run your project with one click:

```markdown
[![Run with Vibe](https://img.shields.io/badge/Run_with-Vibe-7c3aed?style=flat-square)](https://github.com/abicevoice1-sudo/vibe)
```

```bash
npx -y abicevoice1-sudo/vibe <your-repo-url>
```

## 🛣️ Roadmap

- [ ] Container-first sandbox (rootless, resource-capped) as the default
- [ ] `vibe deploy` — one-click export to AWS/GCP/Fly/K8s
- [ ] More stacks: Bun, Deno, Zig, PHP, Ruby, JVM
- [ ] Smarter healing: an LLM pass over unknown tracebacks (opt-in)
- [ ] Single-binary `curl | bash` install (Go/Rust port)

## 🤝 Contributing

Found a repo Vibe can't run? That's the best possible issue — [open one](https://github.com/abicevoice1-sudo/vibe/issues) with the repo URL and the log tail. PRs that add stack detectors or heal patterns are especially welcome. See [ARCHITECTURE.md](ARCHITECTURE.md) for the pipeline.

## 📄 License

MIT — see [LICENSE](LICENSE).
