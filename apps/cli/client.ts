/**
 * Broker + Mirror Node reads. The CLI verifies against the chain, so signals are
 * read from Mirror Node (seq is the id, payer_account_id is the attested seller).
 */
import "dotenv/config";
import { Signal } from "../../shared/index.js";

const API = process.env.NOWCAST_API_URL ?? "http://localhost:3000";
const MIRROR = process.env.MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com";
const TOPIC = process.env.NOWCAST_TOPIC_ID!;

export type SignalRecord = Signal & { seq: number; consensusAt: string; payer: string };

const decode = (m: any): SignalRecord => ({
  ...Signal.parse(JSON.parse(Buffer.from(m.message, "base64").toString("utf8"))),
  seq: m.sequence_number,
  consensusAt: new Date(Number(m.consensus_timestamp.split(".")[0]) * 1000).toISOString(),
  payer: m.payer_account_id,
});

export async function publish(body: { payload: string; seller?: string; price: string }): Promise<{ seq: number; key: string }> {
  const res = await fetch(`${API}/signals`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-publish-secret": process.env.PUBLISH_SECRET ?? "dev-secret" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Fetch one signal by seq from Mirror Node. */
export async function fetchSignal(seq: number): Promise<SignalRecord | undefined> {
  const res = await fetch(`${MIRROR}/api/v1/topics/${TOPIC}/messages/${seq}`);
  if (!res.ok) return undefined;
  return decode(await res.json());
}

/** List recent signals from Mirror Node (specs §7 `list`). */
export async function listSignals(limit = 20): Promise<SignalRecord[]> {
  const res = await fetch(`${MIRROR}/api/v1/topics/${TOPIC}/messages?order=desc&limit=${limit}`);
  const { messages } = (await res.json()) as { messages: any[] };
  return messages.map(decode);
}

/**
 * Paid reveal (specs §6). Returns the key.
 * ── CLI DEV SEAM ── Wire the x402 client here (axios/fetch interceptor from the
 * x402-hedera example) so a 402 triggers payment + retry. Stub throws for now.
 */
export async function reveal(seq: number): Promise<{ key: string; iv: string }> {
  const res = await fetch(`${API}/reveal?seq=${seq}`);
  if (res.status === 402) throw new Error("x402 payment not wired yet (CLI seam)");
  return res.json();
}
