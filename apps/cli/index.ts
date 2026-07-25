/**
 * nowcast CLI (specs §7). stdout is data-only JSON; logs go to stderr. Never
 * interactive. Exit codes per specs §7. `verify` is the shared primitive —
 * `publish` and `buy` both call it so both actors run the same check.
 *
 * Commands: publish · list · buy · verify · describe
 */
import { z } from "zod";
import { Exit, decrypt, err, toCents, toJsonSchema } from "../../shared/index.js";
import * as api from "./client.js";
import { CliError, classify } from "./errors.js";

const out = (data: unknown) => console.log(JSON.stringify(data, null, 2));

const fail = (e: CliError): never => {
  console.log(JSON.stringify({ ...e.extra, ...err(e.code, e.message) }));
  process.exit(e.exit);
};

/** Parse `--flag value` and `--flag=value` pairs into a record. */
const parseFlags = (argv: string[]) => {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new CliError(Exit.usage, "USAGE", `unexpected argument: ${a}`);
    const eq = a.indexOf("=");
    if (eq !== -1) {
      f[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) {
        throw new CliError(Exit.usage, "USAGE", `missing value for ${a}`);
      }
      f[a.slice(2)] = v;
    }
  }
  return f;
};

// ── Command inputs — one zod shape each: validation here, JSON Schema in
// `describe` (specs §2: one shape, three uses). Flags arrive as strings.
const AccountFlag = z.string().regex(/^\d+\.\d+\.\d+$/);
const PriceFlag = z.string().regex(/^\$?\d+(\.\d{1,2})?$/).describe("USD price, e.g. 0.50 or $0.50");
const SeqFlag = z.string().regex(/^\d+$/).transform(Number).describe("HCS sequence number (the signal id)");

const Inputs = {
  publish: z.object({
    payload: z.string().min(1).max(400).describe("plaintext to seal"),
    price: PriceFlag,
    seller: AccountFlag.optional().describe("seller account id; defaults to ACCOUNT_A_ID"),
  }),
  list: z.object({
    limit: z.string().regex(/^\d+$/).transform(Number).optional().describe("max signals to return (default 20)"),
  }),
  buy: z.object({
    seq: SeqFlag,
    "max-price": PriceFlag.optional().describe("abort with exit 5 if the on-chain price exceeds this"),
  }),
  verify: z.object({
    seq: SeqFlag,
    key: z.base64().describe("per-message key from publish or buy"),
  }),
  describe: z.object({}),
};

/** Canonical `$X.YZ` form so prices compare and publish cleanly. */
const canonicalPrice = (p: string) => {
  const cents = toCents(p);
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
};

/**
 * The shared check (specs §7): decrypt the on-chain ciphertext at seq with the
 * supplied key (the iv is public on-chain) and return payload + verdict.
 * Identity comes from Mirror Node's payer_account_id; the body's `seller` is a
 * hint (specs §2).
 */
function verifyRecord(sig: api.SignalRecord, key: string) {
  if (sig.seller !== sig.payer) {
    console.error(`warning: body seller ${sig.seller} != attested payer ${sig.payer}`);
  }
  let payload: string;
  try {
    payload = decrypt({ alg: "AES-256-GCM", ciphertext: sig.ciphertext, iv: sig.iv, key });
  } catch {
    throw new CliError(
      Exit.verifyFailed,
      "VERIFY_FAILED",
      `ciphertext at seq ${sig.seq} does not decrypt with the supplied key`,
      { seq: sig.seq, verified: false },
    );
  }
  return { seq: sig.seq, verified: true, payload, seller: sig.payer, price: sig.price, consensusAt: sig.consensusAt };
}

async function verify(seq: number, key: string, attempts = 1) {
  const sig = await api.fetchSignal(seq, attempts);
  if (!sig) throw new CliError(Exit.notFound, "NOT_FOUND", `no signal at seq ${seq}`);
  return verifyRecord(sig, key);
}

const commands: Record<string, (f: Record<string, string>) => void | Promise<void>> = {
  async publish(f) {
    const input = Inputs.publish.parse(f);
    const seller = input.seller ?? process.env.ACCOUNT_A_ID;
    if (!seller) throw new CliError(Exit.usage, "USAGE", "pass --seller or set ACCOUNT_A_ID");
    const price = canonicalPrice(input.price);
    console.error("submitting payload to broker…");
    const res = await api.publish({ payload: input.payload, seller, price });
    console.error(`published at seq ${res.seq}; verifying against the chain…`);
    // Seller confirms the broker published what it submitted (specs §7).
    const v = await verify(res.seq, res.key, 10); // mirror node lags consensus
    if (v.payload !== input.payload) {
      throw new CliError(Exit.verifyFailed, "VERIFY_FAILED", "broker published different bytes than submitted", {
        seq: res.seq,
        verified: false,
      });
    }
    out({ ...v, key: res.key });
  },

  async list(f) {
    const input = Inputs.list.parse(f);
    const sigs = await api.listSignals(input.limit ?? 20);
    out(sigs.map((s) => ({ seq: s.seq, price: s.price, seller: s.payer, consensusAt: s.consensusAt })));
  },

  async buy(f) {
    const input = Inputs.buy.parse(f);
    const sig = await api.fetchSignal(input.seq);
    if (!sig) throw new CliError(Exit.notFound, "NOT_FOUND", `no signal at seq ${input.seq}`);
    const committed = toCents(sig.price);
    // Buyer-side ceiling BEFORE any payment call (specs §7): exit 5 having spent nothing.
    const max = input["max-price"];
    if (max !== undefined && committed > toCents(max)) {
      throw new CliError(
        Exit.priceMismatch,
        "PRICE_MISMATCH",
        `on-chain price ${sig.price} exceeds max ${canonicalPrice(max)}`,
      );
    }
    // reveal() re-checks `committed` against the 402 quote before paying (specs §2).
    const { key } = await api.reveal(input.seq, committed);
    // Buyer confirms it bought what was sealed (specs §7).
    out(verifyRecord(sig, key));
  },

  async verify(f) {
    const input = Inputs.verify.parse(f);
    out(await verify(input.seq, input.key));
  },

  describe() {
    const tools = [
      { name: "publish", description: "Seal a payload via the broker, publish to HCS, auto-verify; returns the per-message key." },
      { name: "list", description: "List recent signals on the topic (seq, price, attested seller)." },
      { name: "buy", description: "Pay for the key at seq over x402, decrypt the on-chain ciphertext, auto-verify." },
      { name: "verify", description: "Decrypt the signal at seq with a key and print the payload with a verdict." },
      { name: "describe", description: "Print this manifest." },
    ] as const;
    out({
      name: "nowcast",
      description: "sealed-data broker CLI — stdout is JSON only, logs on stderr, never interactive",
      tools: tools.map((t) => ({ ...t, input: toJsonSchema(Inputs[t.name]) })),
      exitCodes: Exit,
      errorShape: { error: { code: "STABLE_CODE", message: "human-readable detail" } },
    });
  },
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const run = cmd ? commands[cmd] : undefined;
  if (!run) {
    throw new CliError(Exit.usage, "USAGE", `unknown command: ${cmd ?? "(none)"} — try: publish, list, buy, verify, describe`);
  }
  await run(parseFlags(rest));
}

main().catch((e) => fail(classify(e)));
