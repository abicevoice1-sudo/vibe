# Show HN Submission Pack — Vibe

## Title options (pick one)

1. **Show HN: Vibe – run any GitHub repo with one command** ← recommended (classic form)
2. Show HN: I built a CLI that runs any repo with zero setup (`npx vibe <repo>`)
3. Show HN: Vibe, a zero-config runner that auto-detects your stack and self-heals common errors

## Post body (~250 words)

Hey HN. I got tired of the same ritual: find an interesting repo, clone it, read a stale README, install the wrong Node version, chase a missing env var, give up. So I built Vibe — a CLI that takes any repo link and gets it running with zero manual configuration.

```
npx abicevoice1-sudo/vibe https://github.com/user/cool-project
```

That's the whole thing. It shallow-clones the repo, sniffs the stack (package.json / requirements.txt / go.mod / Cargo.toml / Dockerfile / static files), installs dependencies with the right package manager, figures out the start command, grabs a free port, injects PORT, and runs it in a sandboxed child process — or Docker, if you'd rather. It streams logs with a clean TUI while it works.

The part I'm proudest of is the self-healing loop. It watches stderr with pattern matchers and retries transparently: `Cannot find module 'x'` → installs it; `No module named 'y'` → pip-installs it; port taken → tries the next one; missing env var → stubs a `.env` entry and warns you loudly. Everything it does is printed — nothing silent, nothing magic. It caps at 2 retries, then hands you the real error instead of guessing forever.

Honest scope: this is v0.1.0. Node, Python, Go, Rust, and static sites work today. Monorepos, GPU workloads, and private registries mostly don't yet. It's ~2k lines of TypeScript, no telemetry, MIT licensed.

The 10-second demo: point it at any small Express or Flask app you've never seen before and watch it figure out the whole pipeline itself. That's the moment I built it for.

Repo: https://github.com/abicevoice1-sudo/vibe

I'd genuinely love teardowns — especially of the stack-detection heuristics (I'm sure they're wrong in interesting ways) and the sandboxing model. What's the repo in your bookmarks that never ran? Try it on that one and tell me where it breaks.

---

## Posting checklist

- [ ] Post Tuesday 7:00 AM ET (peak HN morning window, US east-coast readers arriving)
- [ ] Use title option 1 (classic "Show HN:" prefix — the community filters on it)
- [ ] First 3 hours: reply to EVERY comment, fastest on the critical ones — HN rewards maker presence more than polish
- [ ] Don't argue with teardowns; ask follow-up questions and note the fix publicly
- [ ] If a commenter posts a repo that breaks Vibe, reproduce it same-day and reply with the result
- [ ] Evening: summarize top feedback as GitHub issues on the repo (shows the loop is real)
- [ ] Do NOT post the link anywhere else asking for upvotes (HN detects and buries brigading)
