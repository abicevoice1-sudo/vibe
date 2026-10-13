# r/SideProject Launch Post — Vibe

## Title

I built a CLI that runs any GitHub repo with one command — no setup, no Dockerfile, no README archaeology

## Body

Hey r/SideProject — long-time lurker, finally shipping something.

**The problem:** I kept finding cool repos, cloning them, and then losing an afternoon to stale READMEs — wrong Node version, missing env vars, "just run docker-compose" (there is no compose file). Half the time I gave up before seeing the thing run.

**What I built:** Vibe, a zero-config CLI. You give it any repo link, it figures out the rest:

```
npx abicevoice1-sudo/vibe https://github.com/user/cool-project
```

Under the hood it shallow-clones, detects the stack from lockfiles/manifests/framework fingerprints (Node, Python, Go, Rust, static sites), installs dependencies with the correct package manager, picks a start command, allocates a free port, and runs it in a sandboxed process (or Docker if you prefer). There's also a small self-healing loop: it watches stderr, and on common failures — missing npm/pip module, port collision, unset env var — it fixes the obvious thing and retries, printing everything it does. Two retries max, then it gives you the real error instead of guessing forever.

**Honest scope:** v0.1.0, ~2k lines of TypeScript, MIT, no telemetry. Monorepos, GPU stuff, and private registries aren't handled yet. It *will* break on weird repos — I'm collecting those as issues.

**Why I'm posting here:** I'd love for people to try it on the repo in their bookmarks that never ran, and tell me where the detection goes wrong. The heuristics are the heart of the project and they need adversarial testing.

Repo: https://github.com/abicevoice1-sudo/vibe

Happy to answer anything about the implementation — stack detection, the sandboxing model, or why I didn't just write a Dockerfile generator (short answer: I wanted zero files authored, ever).
