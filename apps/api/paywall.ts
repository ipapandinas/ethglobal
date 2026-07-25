/**
 * x402 paywall for GET /reveal (specs §6, Phase 2). Unpaid → 402 with `accepts`,
 * which IS the price quote. Payment is x402 `exact` on hedera:testnet.
 *
 * ── API DEV SEAM ── The whole payment boundary lives here; nothing else imports
 * @x402/*. Wire `verifyPayment` against the x402 Hedera facilitator (see
 * github/tutorial-a2a-x402-trustless-agent/x402-hedera). Until then every reveal
 * 402s, which is the correct fail-closed default.
 */
import type { NextFunction, Request, Response } from "express";
import { DEFAULT_PRICE, toCents } from "../../shared/index.js";
import { config, isSelfBroker } from "./config.js";

/**
 * The 402 quote. One recipient: broker in marketplace mode, seller in self-broker.
 * TODO(api): quote the SIGNAL's committed price (read it from the store by seq),
 * not a broker-wide default — the seller sets price per signal at publish time.
 */
const accepts = (resource: string, seller: string, price = DEFAULT_PRICE) => [
  {
    scheme: "exact",
    network: `hedera:${config.network}`,
    maxAmountRequired: String(toCents(price)), // TODO: atomic units after spike S1
    resource,
    payTo: isSelfBroker ? seller : config.brokerAccount,
  },
];

// TODO(api): verify the x402 payment header via the facilitator; true only when settled.
async function verifyPayment(_req: Request): Promise<boolean> {
  return false;
}

export function requirePayment(req: Request, res: Response, next: NextFunction) {
  const seller = (res.locals.seller as string) ?? config.brokerAccount;
  verifyPayment(req).then((paid) =>
    paid ? next() : res.status(402).json({ accepts: accepts(req.originalUrl, seller) }),
  );
}
