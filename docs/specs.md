# Nowcast - Sealed-observation micropayment protocol

seller seals hash on HCS → buyer discovers → pays via x402/HBAR → seller reveals → buyer verifies hash

## Smoke Tests

- [ ] Dumb HBAR transfer succeeds
- [ ] HCS: create topic → submit message → read it back
- [ ] Canonical JSON hash
- [ ] x402 → pay

## Decisions

- Which canonicalization scheme and hashing algorithm to use for Hedera Consensus Service (HCS)?
Canonicalization: To be improved.
SHA-256, hex-encoded, via Node's built-in node:crypto. Native, zero-dependency choice and is collision-resistant enough for a commit/reveal-style seal.