/** Broker config from env. Loaded once at boot. */
import "dotenv/config";

const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`missing env: ${k}`);
  return v;
};

export const config = {
  port: Number(env("PORT", "3000")),
  network: env("HEDERA_NETWORK", "testnet"),
  brokerAccount: env("ACCOUNT_A_ID"),
  brokerKey: env("ACCOUNT_A_KEY"),
  topicId: env("NOWCAST_TOPIC_ID"),
  feeBps: Number(env("FEE_BPS", "0")), // 0 ⇒ self-broker mode (specs §1)
  price: env("PRICE", "$0.50"), // fallback quote; the committed price is per-signal
  publishSecret: env("PUBLISH_SECRET", "dev-secret"),
};

/** Self-broker: payTo is the seller, nothing forwarded (specs §1). */
export const isSelfBroker = config.feeBps === 0;
