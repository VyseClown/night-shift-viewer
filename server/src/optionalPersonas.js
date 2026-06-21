import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { SCRIPT_PATH, WORKSPACE_ROOT } from '../config.js';

const execFileAsync = promisify(execFile);

// Memoize only a successful result — failures are not cached so a server restart
// or engine upgrade can recover without restarting.
let memo = null;

export async function getOptionalPersonas() {
  if (memo) return memo;
  try {
    if (!existsSync(SCRIPT_PATH)) {
      return { optional_personas: [], unavailable: true };
    }
    const { stdout } = await execFileAsync(
      'bash',
      [SCRIPT_PATH, '--list-optional-personas'],
      { cwd: WORKSPACE_ROOT, timeout: 10_000, maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout);
    if (
      !parsed ||
      !Array.isArray(parsed.optional_personas) ||
      !parsed.optional_personas.every(
        (p) => typeof p.name === 'string' && typeof p.contractHeading === 'string',
      )
    ) {
      return { optional_personas: [], unavailable: true };
    }
    memo = { optional_personas: parsed.optional_personas, unavailable: false };
    return memo;
  } catch {
    return { optional_personas: [], unavailable: true };
  }
}
