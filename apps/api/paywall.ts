/**
 * x402 paywall for GET /reveal (specs §6, Phase 2). Mirrors the reference
 * express example (github/.../x402-hedera/.../servers/express): a middleware
 * guards a priced route — unpaid → 402 with `accepts` (which IS the quote),
 * paid → next(). Kept self-contained: instead of a separate facilitator, the
 * buyer's payment is a signed USDC TransferTransaction we settle on-chain here.
 *
 * Wire format (must match apps/cli/x402.ts):
 *   402 body : { accepts: [{ scheme:"exact", network:"hedera:testnet",
 *                            maxAmountRequired:<USD cents>, resource, payTo }] }
 *   X-PAYMENT: base64({ x402Version:1, scheme, network,
 *                       payload:{ transaction:<base64 signed TransferTransaction> } })
 */
import { Status, Transaction } from "@hashgraph/sdk";
import type { NextFunction, Request, Response } from "express";
import { toCents } from "../../shared/index.js";
import { config } from "./config.js";
import * as db from "./db.js";
import { client } from "./hedera.js";

const network = `hedera:${config.network}`;

/** The 402 quote for a signal priced at `cents`. One recipient: the broker. */
const accepts = (resource: string, cents: number) => [
  {
    scheme: "exact",
    network,
    maxAmountRequired: String(cents), // USD cents; the buyer settles USDC atomic units
    resource,
    payTo: config.brokerAccount, // self-broker: seller == broker; forwarding is a later task
  },
];

/** Submit the buyer's signed transfer and confirm consensus. Any error ⇒ unpaid. */
async function settle(header: string): Promise<boolean> {
  try {
    const env = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (env?.scheme !== "exact" || env?.network !== network) return false;
    const tx = Transaction.fromBytes(Buffer.from(env.payload.transaction, "base64"));
    const receipt = await (await tx.execute(client)).getReceipt(client);
    // TODO(api): also assert the transfer amount/recipient match the quote.
    return receipt.status === Status.Success;
  } catch {
    return false;
  }
}

export async function requirePayment(req: Request, res: Response, next: NextFunction) {
  const meta = await db.get(Number(req.query.seq));
  if (!meta) return next(); // unknown seq — let the handler 404
  const quote = accepts(req.originalUrl, toCents(meta.price));

  const header = req.get("x-payment");
  if (header && (await settle(header))) return next();
  res.status(402).json({ accepts: quote });
}
