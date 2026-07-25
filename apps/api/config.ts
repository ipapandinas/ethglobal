/** Broker config from env. Loaded once at boot. */
import "dotenv/config";
import { API_PORT, NETWORK, TOPIC_ID } from "../../shared/index.js";

const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`missing env: ${k}`);
  return v;
};

export const config = {
  port: Number(env("PORT", String(API_PORT))),
  network: env("HEDERA_NETWORK", NETWORK),
  brokerAccount: env("ACCOUNT_A_ID"),
  brokerKey: env("ACCOUNT_A_KEY"),
  topicId: TOPIC_ID, // hardcoded (specs §1)
  databaseUrl: env("DATABASE_URL"),
  feeBps: Number(env("FEE_BPS", "0")), // 0 ⇒ self-broker mode (specs §1)
  publishSecret: env("PUBLISH_SECRET", "dev-secret"),
};

/** Self-broker: payTo is the seller, nothing forwarded (specs §1). */
export const isSelfBroker = config.feeBps === 0;
