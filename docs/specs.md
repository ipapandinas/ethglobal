# Nowcast — sealed-data broker

TypeScript throughout. One hardcoded HCS topic. No discovery. The broker encrypts, custodies keys, and hands the key to both the seller and the buyer.

## 1. Scope

**In.** Seller submits plaintext to a broker. Broker encrypts under a fresh key, publishes the ciphertext to a fixed HCS topic, and returns the key to the seller. A buyer agent reads the topic, pays over x402, receives the key, decrypts the on-chain ciphertext, and verifies. Both actors verify through the same CLI path. Self-broker mode (`FEE_BPS=0`) for sellers who don't want a marketplace.

**Out.** Discovery, search, channel registry, seller authorization, reputation, refunds, durable persistence, UI.

---

## 2. Decisions

**The ciphertext is the commitment.** No separate hash. AES-GCM's auth tag binds the ciphertext to its key and plaintext — a tampered ciphertext fails to decrypt, and no second key produces a valid tag for the same bytes. The HCS consensus timestamp binds *when*. A sha256 alongside this is redundant and costs message budget.

**The key goes to both parties.** The seller receives it in the publish response; the buyer receives it in the paid reveal. Each can independently confirm the ciphertext at a given sequence number decrypts to the payload they expect. Neither has to trust the broker for integrity.

**Reveal returns the key, never the payload.** The buyer already holds the ciphertext — it read the topic to find the signal. Returning only the key makes the chain the sole source of the plaintext, so verification is structural instead of optional. Returning both invites clients to read the plaintext and skip the check.

**Keys are per message.** A single topic key means the first buyer decrypts the entire feed, past and future.

**The broker picks the algorithm** and declares it as `alg` in the message and in every key response. Clients fail closed on an unrecognised value — never fall back to a default.

**Sequence number is the id.** Free from Mirror Node, and what `GET /reveal` keys on.

**Identity comes from `payer_account_id`.** Mirror Node attests who submitted each message. The `broker` field in the body is a hint; on mismatch, discard the signal.

**Price is committed on-chain and re-checked at the 402.** A mismatch means bait-and-switch, and the buyer aborts before spending anything.

**Zod schemas are the single source of truth** — runtime wire validation, static types via `z.infer`, and the JSON Schema the CLI emits from `describe`. One shape, three uses.

**One recipient in `payTo`.** In marketplace mode the broker collects and forwards the seller's cut; in self-broker mode `payTo` is the seller and nothing is forwarded. If the Hedera x402 payload can carry a multi-party `TransferTransaction` (spike S2), use it and delete the forwarding path.

---

## 3. Trust model

| The broker can | The broker cannot |
|---|---|
| read every plaintext | alter a published observation undetected |
| withhold a key after payment | hand the buyer content the seller didn't submit |
| refuse to publish | backdate or reorder a signal |
| leak a payload to a third party | forge a key that decrypts published ciphertext |

Trusted for **confidentiality and availability**. Trustless for **integrity**. Not a guarantee of truthfulness — a seller can faithfully submit a lie, and no amount of crypto detects it.

---

## 4. Repo

```
shared/          zod schemas → types, crypto, canonical helpers
apps/api/        broker: publish, key vault, x402 paywall
apps/cli/        seller + buyer commands, agent-native
```

Strict TS, `module: NodeNext`, `tsx` in dev, `tsc --noEmit` in CI.

---

## 5. HCS message

Under 1000 bytes — payload cap ~400 chars. `alg` is fixed (`AES-256-GCM`, the only
value in the enum) and omitted from the wire for the MVP; clients still fail closed
on any unrecognised alg if the enum grows.

```jsonc
{
  "ciphertext": "base64",
  "iv": "base64",
  "price": "$0.50",        // set by the seller at publish time
  "seller": "0.0.5555",
  "broker_url": "https://broker.example"
}
```

---

## 6. API

| Route | Paid | In → out |
|---|---|---|
| `POST /signals` | no | `{ payload, seller, price }` → `{ seq, key }` |
| `GET /reveal?seq=N` | **yes** | → `{ key, iv }` |

(`GET /health` is deferred — not needed for the MVP demo.)

No price endpoint — an unpaid `GET /reveal` returns 402 with `accepts`, and that is the quote.

`POST /signals` authenticates with a shared-secret header; localhost-only in self-broker mode. Payment is x402 `exact` on `hedera:testnet`.

---

## 7. CLI

Verification lives here, and both actors run the same code path.

```
cli publish --payload <s> --price <usd>
cli list    [--limit 20]
cli buy     --seq <n> [--max-price <usd>]
cli verify  --seq <n> --key <b64>
cli describe
```

`verify` fetches the message at `seq`, decrypts with the supplied key (the `iv` is public on-chain, so only the key is needed), and prints the payload with a verdict. `publish` and `buy` both call it automatically before returning — the seller confirms the broker published what it submitted, the buyer confirms it bought what was sealed. Standalone `verify` re-checks any signal later.

Agent contract, all non-negotiable:

- **stdout is data only** — JSON, no ANSI, no spinners. Logs and progress go to stderr.
- **Never interactive** — no prompts, no TTY checks. Every input is a flag or stdin.
- **Exit codes:** `0` ok · `1` usage · `2` api/network · `3` payment failed · `4` not found or expired · `5` price mismatch · `6` verification failed.
- **Errors are JSON:** `{ "error": { "code": "VERIFY_FAILED", "message": "…" } }`, codes stable across versions.
- `describe` emits a tool manifest — one entry per command, zod rendered to JSON Schema — so an agent constructs valid calls without reading `--help`.

`buy` checks price parity before paying and exits `5` without spending on mismatch.

---

## 8. Runbook

Each phase ends with a command that prints PASS or doesn't. Don't start one until the last is green.

**Phase 0 — spikes (90 min).** S1: does `hedera:testnet` settle HBAR or a token? S2: can the x402 Hedera payload express a multi-party transfer? S3: does a >1 KB HCS message chunk and reassemble? S4: which SDK does `@x402/hedera` peer on? Record answers here. Only S2 can change the architecture.

**Phase 1 — publish + seller verify (3 h).** Schemas, crypto, `POST /signals`, HCS submit. *Done:* `cli publish --payload "lot is full" --price 0.50` returns a key and prints `verified: true`; two identical payloads produce different ciphertexts.

**Phase 2 — paywall (2 h).** x402 on `GET /reveal`. *Done:* unpaid → 402 with `accepts`; paid → 200 with the key.

**Phase 3 — buyer (2 h).** `list`, `buy`, price parity, exit codes. *Done:* `cli buy --seq N | jq .payload` prints the original string; `--max-price 0.01` against a $0.50 signal exits `5` having spent nothing.

**Phase 4 — split (1–2 h).** Skip in self-broker mode. *Done:* one purchase, HashScan shows both credits.

**Phase 5 — demo (2 h).** Seed script, a deliberate tamper run exiting `6`, recorded fallback video, a one-line answer for each non-guarantee in §3.

---

## 9. Tasks

**shared**
- [ ] `Signal`, `PublishRequest`, `PublishResponse`, `KeyResponse` zod schemas
- [ ] `encrypt` / `decrypt`, per-message key, `alg` dispatch that throws on unknown
- [ ] `zodToJsonSchema` export for the CLI manifest

**apps/api**
- [ ] `POST /signals` — encrypt, submit, vault key by seq, return key
- [ ] `GET /reveal` behind x402
- [ ] `FEE_BPS` payout path

**apps/cli**
- [ ] arg parsing, JSON-only stdout, exit-code map
- [ ] `verify` first — `publish` and `buy` both depend on it
- [ ] `publish`, `list`, `buy`, `health`, `describe`
- [ ] price-parity guard

**demo**
- [ ] seed script · tamper run · video

---

## 10. Later

Channel registry · `submitKey` authorization · reputation from verification history · bounty channels · public post-expiry key release for third-party audit · MCP server wrapping `describe` · persistence.