/**
 * Self-healing: pattern-match common startup failures and produce a concrete,
 * user-visible repair action. Heuristics only — every action is printed before
 * it runs, and the retry budget is capped by the caller (max 2 attempts).
 */

export type HealKind = 'npm-install' | 'pip-install' | 'next-port' | 'env-stub';

export interface HealAction {
  kind: HealKind;
  /** Module name / env var name the action targets (empty for next-port). */
  target: string;
  /** Human-readable description, printed before the action runs. */
  message: string;
}

export function matchHeal(log: string): HealAction | null {
  // Node: Cannot find module 'express'
  let m = log.match(/Cannot find module '([^']+)'/);
  if (m && !m[1].startsWith('.') && !m[1].startsWith('/')) {
    // npm install the top-level package ("@scope/name" or "name")
    const top = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
    return {
      kind: 'npm-install',
      target: top,
      message: `Missing node module '${top}' — installing it now.`,
    };
  }

  // Python: ModuleNotFoundError: No module named 'flask'
  m = log.match(/ModuleNotFoundError: No module named '([^']+)'/);
  if (m) {
    const top = m[1].split('.')[0];
    return {
      kind: 'pip-install',
      target: top,
      message: `Missing python module '${top}' — pip installing it now.`,
    };
  }

  // Port conflicts
  if (/EADDRINUSE|address already in use|port .* already allocated/i.test(log)) {
    return {
      kind: 'next-port',
      target: '',
      message: 'Port already in use — allocating the next free port.',
    };
  }

  // Missing env vars: ALL_CAPS names only, to avoid "fixing" code bugs.
  m =
    log.match(/\b([A-Z][A-Z0-9_]{2,}) is not defined\b/) ||
    log.match(/required environment variable ["']?([A-Z][A-Z0-9_]{2,})["']?/i) ||
    log.match(/environment variable ["']?([A-Z][A-Z0-9_]{2,})["']? (is required|not set|missing|cannot be (empty|null))/i) ||
    log.match(/\b([A-Z][A-Z0-9_]{2,}) (env(ironment)? )?var(iable)? (is )?(required|missing|not set|not defined)\b/i);
  if (m) {
    const name = m[1];
    return {
      kind: 'env-stub',
      target: name,
      message: `Missing env var ${name} — writing a stub to .env (set a real value!).`,
    };
  }

  return null;
}
