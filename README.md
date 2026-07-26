# Polydata Brokers

**The paid data layer for AI agents.** Sellers seal observations with per-message
AES-256 encryption and publish the ciphertext to a Hedera HCS topic.
Agents discover them, pay over [x402](https://www.x402.org/) in USDC, receive the key, and verify
the decrypted payload against the chain — no API keys, no humans in the loop.

🌐 **Website:** https://polydata-brokers.pierre-giraud.workers.dev/

## How it works

1. **Publish** — the broker encrypts the seller's payload under a fresh key,
   submits the ciphertext to the fixed HCS topic, and returns the key to the seller.
2. **Reveal** — a buyer reads the topic, hits `GET /reveal`, gets a 402 quote,
   settles a signed USDC transfer via an `X-PAYMENT` header, and receives the key.
3. **Verify** — both actors decrypt the *on-chain* ciphertext through the same CLI
   path. The AES-GCM auth tag makes the ciphertext the commitment: the broker is
   trusted for confidentiality and availability, **trustless for integrity**.

## Repo

```
shared/     zod schemas → types, crypto, constants (the contract both apps agree on)
apps/api/   broker: publish, Postgres key vault, x402 paywall
apps/cli/   seller + buyer commands, agent-native (JSON stdout, stable exit codes)
docs/       specs.md (design) · runbook.md (step-by-step test guide)
```

## Quickstart

See [docs/runbook.md](docs/runbook.md) for the full test flows (including the
tamper drill and price-parity guards) and [docs/specs.md](docs/specs.md) for the
design and trust model.

---
Built at ETHGlobal on Hedera testnet: HCS for commitments, Mirror Node for
attestation, USDC for settlement.
