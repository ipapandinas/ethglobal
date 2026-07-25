/**
 * x402 buyer seam (specs §6, §7). On 402 the `accepts` array IS the quote:
 * re-check it against the on-chain committed price BEFORE spending (specs §2 —
 * a mismatch means bait-and-switch), then settle with a signed USDC
 * TransferTransaction carried base64 in an X-PAYMENT header and retry.
 *
 * ── CLI DEV SEAM ── The entire payment wire format lives here. Coordinate with
 * apps/api's `verifyPayment`: the header is
 *   base64({ x402Version: 1, scheme: "exact", network: "hedera:testnet",
 *            payload: { transaction: <base64 signed TransferTransaction bytes> } })
 * settling USDC (USDC_TOKEN_ID, USD cents × 10^4 atomic units) to accepts[0].payTo.
 */
import { AccountId, Client, PrivateKey, TransferTransaction } from "@hashgraph/sdk";
import { z } from "zod";
import { Exit } from "../../shared/index.js";
import { CliError } from "./errors.js";

const NETWORK = "hedera:testnet";
/** Circle's Hedera testnet USDC. 6 decimals, so USD cents × 10^4 = atomic units. */
const DEFAULT_USDC = "0.0.429274";

/** One entry of the 402 quote. Clients fail closed on unrecognised values. */
const Accepts = z.object({
  scheme: z.string(),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string(),
  payTo: z.string().regex(/^\d+\.\d+\.\d+$/),
});
type Accepts = z.infer<typeof Accepts>;

/** Sign a USDC transfer of `cents` to the quoted payTo; return the X-PAYMENT header. */
async function buildPayment(quote: Accepts, cents: number): Promise<string> {
  const buyerId = process.env.ACCOUNT_B_ID;
  const buyerKey = process.env.ACCOUNT_B_KEY;
  if (!buyerId || !buyerKey) {
    throw new CliError(Exit.usage, "USAGE", "set ACCOUNT_B_ID and ACCOUNT_B_KEY to pay for a reveal");
  }
  const key = PrivateKey.fromStringECDSA(buyerKey);
  const client = Client.forTestnet().setOperator(AccountId.fromString(buyerId), key);
  try {
    const usdc = process.env.USDC_TOKEN_ID ?? DEFAULT_USDC;
    const atomic = cents * 10_000;
    const tx = await new TransferTransaction()
      .addTokenTransfer(usdc, buyerId, -atomic)
      .addTokenTransfer(usdc, quote.payTo, atomic)
      .setTransactionMemo(`x402 ${quote.resource}`.slice(0, 100))
      .freezeWith(client);
    const signed = await tx.sign(key);
    const envelope = {
      x402Version: 1,
      scheme: quote.scheme,
      network: quote.network,
      payload: { transaction: Buffer.from(signed.toBytes()).toString("base64") },
    };
    return Buffer.from(JSON.stringify(envelope)).toString("base64");
  } finally {
    client.close();
  }
}

/**
 * GET url; on 402, parity-check the quote against `expectedCents` (the on-chain
 * committed price), pay, and retry once. Never spends on a mismatched quote.
 */
export async function payAndRetry(url: string, expectedCents: number): Promise<Response> {
  const first = await fetch(url);
  if (first.status !== 402) return first;

  const body = await first.json().catch(() => undefined);
  const parsed = z.object({ accepts: z.array(Accepts).min(1) }).safeParse(body);
  if (!parsed.success) {
    throw new CliError(Exit.payment, "PAYMENT_UNSUPPORTED", "402 without a parseable accepts quote");
  }
  const quote = parsed.data.accepts.find((a) => a.scheme === "exact" && a.network === NETWORK);
  if (!quote) {
    throw new CliError(Exit.payment, "PAYMENT_UNSUPPORTED", `no exact/${NETWORK} entry in accepts`);
  }

  // Price parity (specs §2): the 402 quote must match the on-chain commitment.
  const quoted = Number(quote.maxAmountRequired);
  if (!Number.isInteger(quoted) || quoted !== expectedCents) {
    throw new CliError(
      Exit.priceMismatch,
      "PRICE_MISMATCH",
      `402 quote is ${quote.maxAmountRequired}¢ but the on-chain committed price is ${expectedCents}¢ — aborting before payment`,
    );
  }

  console.error(`paying ${quoted}¢ USDC to ${quote.payTo} for ${quote.resource}`);
  const header = await buildPayment(quote, quoted);

  const retry = await fetch(url, { headers: { "x-payment": header } });
  if (retry.status === 402) {
    throw new CliError(Exit.payment, "PAYMENT_FAILED", "broker did not accept the x402 payment");
  }
  return retry;
}
