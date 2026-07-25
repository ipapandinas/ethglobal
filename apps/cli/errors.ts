/**
 * CLI error taxonomy (specs §7). Every failure carries a numeric exit code and
 * a stable string code — the exit signals outcome to shells, the string to
 * agents. `extra` is merged into the error JSON (e.g. a `verified: false`
 * verdict alongside VERIFY_FAILED).
 */
import { z } from "zod";
import { Exit } from "../../shared/index.js";

export class CliError extends Error {
  constructor(
    readonly exit: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Map an unknown thrown value onto the exit-code contract. */
export function classify(e: unknown): CliError {
  if (e instanceof CliError) return e;
  if (e instanceof z.ZodError) return new CliError(Exit.usage, "USAGE", z.prettifyError(e));
  if (e instanceof Error) {
    // node:crypto reports a failed GCM auth tag as "unable to authenticate data";
    // shared/crypto throws "unknown alg" on unrecognised algorithms. Both are §7 exit 6.
    if (/authenticate|unknown alg/i.test(e.message)) {
      return new CliError(Exit.verifyFailed, "VERIFY_FAILED", e.message);
    }
    return new CliError(Exit.api, "API_ERROR", e.message);
  }
  return new CliError(Exit.api, "API_ERROR", String(e));
}
