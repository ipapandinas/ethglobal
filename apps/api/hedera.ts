/** Shared Hedera client for the broker operator (submits HCS, settles x402). */
import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";
import { config } from "./config.js";

export const client = Client.forTestnet().setOperator(
  AccountId.fromString(config.brokerAccount),
  PrivateKey.fromStringECDSA(config.brokerKey),
);
