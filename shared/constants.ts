/**
 * Hardcoded constants (specs §1: one hardcoded HCS topic, no discovery). Shared
 * by both apps so the topic and endpoints are defined in exactly one place.
 */

/** The single HCS topic every signal is published to. */
export const TOPIC_ID = "0.0.9746601";

/** Mirror Node REST endpoints by network. */
export const MIRROR_NODE: Record<string, string> = {
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
};

/** Default Hedera network. */
export const NETWORK = "testnet";

/** The only encryption algorithm (specs §2). Clients fail closed on others. */
export const ALG = "AES-256-GCM" as const;

/** Fallback price when a seller omits one. */
export const DEFAULT_PRICE = "$0.50";

/** HCS message size cap (specs §5). */
export const HCS_MAX_BYTES = 1000;

/** Default broker HTTP port. */
export const API_PORT = 3000;
