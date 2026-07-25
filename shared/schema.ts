/**
 * Zod schemas — the single source of truth (specs §2). Runtime validation,
 * static types via z.infer, and the JSON Schema the CLI `describe` emits.
 * Both apps/api and apps/cli import from here; neither redefines a shape.
 */
import { z } from "zod";

/** Encryption algorithms the broker may declare. Clients fail closed on others. */
export const Alg = z.enum(["AES-256-GCM"]);
export type Alg = z.infer<typeof Alg>;

const AccountId = z.string().regex(/^\d+\.\d+\.\d+$/); // 0.0.1234
const Price = z.string().regex(/^\$\d+(\.\d{1,2})?$/); // $0.50

/** The HCS message (specs §5). Under 1000 bytes. Ciphertext is the commitment. */
export const Signal = z.object({
  ciphertext: z.base64(),
  iv: z.base64(),
  price: Price,
  seller: AccountId,
  broker_url: z.url(),
});
export type Signal = z.infer<typeof Signal>;

// ── API bodies (specs §6) ───────────────────────────────────────────────────

/** POST /signals in. The seller sets the price at publish time. */
export const PublishRequest = z.object({
  payload: z.string().min(1).max(400).describe("plaintext to seal"),
  seller: AccountId,
  price: Price,
});
export type PublishRequest = z.infer<typeof PublishRequest>;

/** POST /signals out — seller's copy of the key. */
export const PublishResponse = z.object({
  seq: z.number().int(),
  key: z.base64(),
});
export type PublishResponse = z.infer<typeof PublishResponse>;

/** GET /reveal out — key only, never the payload (specs §2). */
export const KeyResponse = z.object({ key: z.base64(), iv: z.base64() });
export type KeyResponse = z.infer<typeof KeyResponse>;
