/**
 * The shared contract. apps/api and apps/cli import ONLY from here — this is the
 * surface the two developers agree on. Changing an export here is cross-cutting;
 * changing anything inside apps/* is not.
 */
import { z } from "zod";

export * from "./schema.js";
export * from "./crypto.js";

/** CLI exit codes (specs §7). stdout stays data-only; these signal outcome. */
export const Exit = {
  ok: 0,
  usage: 1,
  api: 2,
  payment: 3,
  notFound: 4,
  priceMismatch: 5,
  verifyFailed: 6,
} as const;

/** Wire error shape (specs §7). `code` stays stable across versions. */
export const err = (code: string, message: string) => ({ error: { code, message } });

/** Parse `$0.50` → integer cents, for on-chain/402 price parity (specs §2). */
export const toCents = (p: string) => {
  const m = /^\$?(\d+)(?:\.(\d{1,2}))?$/.exec(p.trim());
  if (!m) throw new Error(`bad price: ${p}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
};

/** Render a zod schema to JSON Schema for the `describe` manifest. */
export const toJsonSchema = (s: z.ZodType) => z.toJSONSchema(s, { io: "input" });
