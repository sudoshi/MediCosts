import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

/**
 * Resolve the repository root robustly, regardless of whether this module runs
 * from source (`server/lib` via tsx) or compiled (`server/dist/lib` via node).
 *
 * Asset paths (`.env`, `client/dist`, `.resendapikey`, abby schema context) live
 * at fixed locations relative to the repo root, but `__dirname` shifts one level
 * deeper after a `tsc` build into `dist/`. Anchoring to the repo root keeps those
 * lookups correct under every runtime.
 *
 * Resolution order:
 *   1. `APP_ROOT` env var, if set.
 *   2. Walk up from this module until a directory contains both `client/` and `server/`.
 *   3. Fall back to two levels above this file.
 */
export function projectRoot(): string {
  if (process.env.APP_ROOT) return process.env.APP_ROOT;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'client')) && fs.existsSync(path.join(dir, 'server'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}
