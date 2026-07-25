/**
 * HCS submit (specs §9). Seal, publish the Signal to the fixed topic, return the
 * consensus seq (the signal id) + the key to vault.
 *
 * ── API DEV ── This is where the seal → publish path lives. The seq comes off
 * the submit receipt so the key is vaulted under the right id immediately.
 */
import { TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { Signal, encrypt } from "../../shared/index.js";
import { config } from "./config.js";
import { client } from "./hedera.js";

export async function publishSignal(input: { payload: string; seller: string; price: string }) {
  const sealed = encrypt(input.payload);

  const body: Signal = {
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    price: input.price, // seller sets the price at publish time
    seller: input.seller,
    broker_url: process.env.BROKER_URL ?? `http://localhost:${config.port}`,
  };

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(config.topicId)
    .setMessage(JSON.stringify(body))
    .execute(client);
  const seq = (await tx.getReceipt(client)).topicSequenceNumber!.toNumber();

  return { seq, key: { key: sealed.key, iv: sealed.iv } };
}
