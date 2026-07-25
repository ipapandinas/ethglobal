/**
 * Broker + Mirror Node reads. The CLI verifies against the chain, so signals are
 * read from Mirror Node (seq is the id, payer_account_id is the attested seller).
 */
import "dotenv/config";
import { API_PORT, Exit, KeyResponse, MIRROR_NODE, NETWORK, PublishResponse, Signal, TOPIC_ID } from "../../shared/index.js";
import { CliError } from "./errors.js";
import { payAndRetry } from "./x402.js";

const API = process.env.NOWCAST_API_URL ?? `http://localhost:${process.env.PORT ?? API_PORT}`;
const MIRROR =
  process.env.MIRROR_NODE_URL ?? MIRROR_NODE[process.env.HEDERA_NETWORK ?? NETWORK] ?? MIRROR_NODE[NETWORK];
const TOPIC = process.env.NOWCAST_TOPIC_ID ?? TOPIC_ID;

export type SignalRecord = Signal & { seq: number; consensusAt: string; payer: string };

const decode = (m: any): SignalRecord => ({
  ...Signal.parse(JSON.parse(Buffer.from(m.message, "base64").toString("utf8"))),
  seq: Number(m.sequence_number),
  consensusAt: new Date(Number(m.consensus_timestamp.split(".")[0]) * 1000).toISOString(),
  payer: m.payer_account_id,
});

/** Surface a non-2xx broker response as a stable API error. */
async function apiError(res: Response): Promise<CliError> {
  const body = (await res.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
  const message = body?.error?.message ?? `broker returned ${res.status}`;
  if (res.status === 401) return new CliError(Exit.api, "UNAUTHORIZED", message);
  if (res.status === 404) return new CliError(Exit.notFound, "NOT_FOUND", message);
  return new CliError(Exit.api, "API_ERROR", message);
}

export async function publish(body: { payload: string; seller: string; price: string }): Promise<PublishResponse> {
  const res = await fetch(`${API}/signals`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-publish-secret": process.env.PUBLISH_SECRET ?? "dev-secret" },
    body: JSON.stringify(body),
  }).catch((e: Error) => {
    throw new CliError(Exit.api, "API_ERROR", `broker unreachable at ${API}: ${e.message}`);
  });
  if (!res.ok) throw await apiError(res);
  return PublishResponse.parse(await res.json());
}

/**
 * Fetch one signal by seq from Mirror Node. Polls up to `attempts` times 2 s
 * apart — Mirror Node lags consensus, so publish's auto-verify needs a few.
 */
export async function fetchSignal(seq: number, attempts = 1): Promise<SignalRecord | undefined> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${MIRROR}/api/v1/topics/${TOPIC}/messages/${seq}`);
    if (res.ok) {
      try {
        return decode(await res.json());
      } catch {
        throw new CliError(Exit.notFound, "NOT_FOUND", `message at seq ${seq} is not a nowcast signal`);
      }
    }
    if (res.status !== 404) throw new CliError(Exit.api, "API_ERROR", `mirror node returned ${res.status}`);
  }
  return undefined;
}

/** List recent signals from Mirror Node (specs §7 `list`). Skips foreign messages. */
export async function listSignals(limit = 20): Promise<SignalRecord[]> {
  const res = await fetch(`${MIRROR}/api/v1/topics/${TOPIC}/messages?order=desc&limit=${limit}`);
  if (!res.ok) throw new CliError(Exit.api, "API_ERROR", `mirror node returned ${res.status}`);
  const { messages } = (await res.json()) as { messages?: any[] };
  const signals: SignalRecord[] = [];
  for (const m of messages ?? []) {
    try {
      signals.push(decode(m));
    } catch {
      console.error(`skipping non-signal message at seq ${m.sequence_number}`);
    }
  }
  return signals;
}

/**
 * Paid reveal (specs §6): 402 → price parity → pay (x402.ts) → retry → key.
 * `expectedCents` is the on-chain committed price, re-checked against the quote.
 */
export async function reveal(seq: number, expectedCents: number): Promise<KeyResponse> {
  const res = await payAndRetry(`${API}/reveal?seq=${seq}`, expectedCents);
  if (!res.ok) throw await apiError(res);
  return KeyResponse.parse(await res.json());
}
