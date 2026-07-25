/**
 * Sealed-data crypto (specs §2). AES-GCM's auth tag binds ciphertext to key and
 * plaintext, so the ciphertext IS the commitment — no separate hash. Keys are
 * per message. `decrypt` dispatches on `alg` and throws on anything unknown
 * (fail closed) — callers never fall back to a default.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Alg } from "./schema.js";

/** Seal plaintext under a fresh key + iv. Returns everything base64. */
export function encrypt(plaintext: string) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plaintext, "utf8"), c.final(), c.getAuthTag()]);
  return {
    alg: "AES-256-GCM" as Alg,
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    key: key.toString("base64"),
  };
}

/** Open a sealed payload. Throws if alg is unknown or the tag fails to verify. */
export function decrypt(args: { alg: string; ciphertext: string; iv: string; key: string }) {
  if (args.alg !== "AES-256-GCM") throw new Error(`unknown alg: ${args.alg}`);
  const buf = Buffer.from(args.ciphertext, "base64");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(args.key, "base64"), Buffer.from(args.iv, "base64"));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString("utf8");
}
