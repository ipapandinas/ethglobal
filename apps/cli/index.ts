/**
 * nowcast CLI (specs §7). stdout is data-only JSON; logs go to stderr. Never
 * interactive. Exit codes per specs §7. `verify` is the shared primitive —
 * `publish` and `buy` both call it so both actors run the same check.
 *
 * Commands: publish · list · buy · verify · describe
 */
import { z } from "zod";
import { Exit, decrypt, toCents, toJsonSchema } from "../../shared/index.js";
import * as api from "./client.js";

const out = (data: unknown) => console.log(JSON.stringify(data, null, 2));
const fail = (code: number, message: string) => {
  console.log(JSON.stringify({ error: { code, message } }));
  process.exit(code);
};

/** Parse `--flag value` pairs into a record. */
const parseFlags = (argv: string[]) => {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) if (argv[i]?.startsWith("--")) f[argv[i].slice(2)] = argv[i + 1];
  return f;
};

/**
 * Fetch the signal at seq and decrypt with the supplied key (specs §7). The iv
 * is public on-chain, so only the key is needed. Returns payload + verdict.
 */
async function verify(seq: number, key: string) {
  const sig = await api.fetchSignal(seq);
  if (!sig) fail(Exit.notFound, `no signal at seq ${seq}`);
  const payload = decrypt({ alg: "AES-256-GCM", ciphertext: sig!.ciphertext, iv: sig!.iv, key });
  return { seq, verified: true, payload, seller: sig!.payer, price: sig!.price, consensusAt: sig!.consensusAt };
}

const commands = {
  async publish(f: Record<string, string>) {
    const price = f.price.startsWith("$") ? f.price : `$${f.price}`; // canonical $X.YZ
    const res = await api.publish({ payload: f.payload, seller: process.env.ACCOUNT_A_ID, price });
    // Seller confirms the broker published what it submitted.
    out(await verify(res.seq, res.key));
  },

  async list(f: Record<string, string>) {
    const sigs = await api.listSignals(f.limit ? Number(f.limit) : 20);
    out(sigs.map((s) => ({ seq: s.seq, price: s.price, seller: s.payer })));
  },

  async buy(f: Record<string, string>) {
    const seq = Number(f.seq);
    const sig = await api.fetchSignal(seq);
    if (!sig) fail(Exit.notFound, `no signal at seq ${seq}`);
    // Price parity BEFORE paying (specs §7): abort without spending on mismatch.
    if (f["max-price"] && toCents(sig!.price) > toCents(f["max-price"])) {
      fail(Exit.priceMismatch, `price ${sig!.price} exceeds max $${f["max-price"]}`);
    }
    const { key } = await api.reveal(seq);
    // Buyer confirms it bought what was sealed.
    out(await verify(seq, key));
  },

  async verify(f: Record<string, string>) {
    out(await verify(Number(f.seq), f.key));
  },

  describe() {
    out({
      name: "nowcast",
      tools: [
        { name: "publish", input: toJsonSchema(z.object({ payload: z.string(), price: z.string() })) },
        { name: "list", input: toJsonSchema(z.object({ limit: z.number().optional() })) },
        { name: "buy", input: toJsonSchema(z.object({ seq: z.number(), "max-price": z.string().optional() })) },
        { name: "verify", input: toJsonSchema(z.object({ seq: z.number(), key: z.string() })) },
      ],
    });
  },
};

const [cmd, ...rest] = process.argv.slice(2);
const run = commands[cmd as keyof typeof commands];
if (!run) fail(Exit.usage, `unknown command: ${cmd ?? "(none)"}`);

Promise.resolve(run(parseFlags(rest))).catch((e: Error) => fail(Exit.api, e.message));
