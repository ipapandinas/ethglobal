import "dotenv/config";
import { createHash } from "node:crypto";
import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  Status,
  TransferTransaction,
} from "@hashgraph/sdk";

// ---------- reporting ----------

let failures = 0;

function report(name: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}`);
  if (!pass) failures++;
}

function skip(name: string, reason: string) {
  console.log(`SKIP - ${name} (${reason})`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ---------- shared helpers ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIRROR_NODE = "https://testnet.mirrornode.hedera.com";

async function getHbarBalance(accountId: string): Promise<number> {
  const res = await fetch(`${MIRROR_NODE}/api/v1/accounts/${accountId}`);
  if (!res.ok) throw new Error(`mirror node lookup failed for ${accountId}: ${res.status}`);
  const { balance } = await res.json();
  return balance.balance / 1e8;
}

async function pollForChange(accountId: string, before: number, attempts = 10): Promise<number> {
  for (let i = 0; i < attempts; i++) {
    const balance = await getHbarBalance(accountId);
    if (balance !== before) return balance;
    await sleep(2000);
  }
  return getHbarBalance(accountId);
}

function requireEnv(...names: string[]): string[] | undefined {
  const values = names.map((n) => process.env[n]);
  if (values.some((v) => !v)) return undefined;
  return values as string[];
}

// ---------- canonicalization + hash ----------

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map(
      (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`
    );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sealHash(observation: unknown): string {
  return createHash("sha256").update(canonicalize(observation), "utf8").digest("hex");
}

function runCanonicalizationChecks() {
  section("Canonical JSON hash");

  const obsA = { value: 42.5, sensor: "buoy-7", ts: 1753449600 };
  const obsB = { ts: 1753449600, value: 42.5, sensor: "buoy-7" };
  const nestedA = { meta: { unit: "C", zone: "atl" }, id: 1 };
  const nestedB = { id: 1, meta: { zone: "atl", unit: "C" } };
  const tampered = { ...obsA, value: 42.6 };

  report("key-order independence", sealHash(obsA) === sealHash(obsB));
  report("nested key-order independence", sealHash(nestedA) === sealHash(nestedB));
  report("tampered payload hashes differently", sealHash(obsA) !== sealHash(tampered));
  report("seal -> reveal -> verify round trip", sealHash(obsA) === sealHash({ ...obsA }));
}

// ---------- HBAR transfer ----------

async function runTransferChecks() {
  section("HBAR transfer");

  const env = requireEnv("ACCOUNT_A_ID", "ACCOUNT_A_KEY", "ACCOUNT_B_ID");
  if (!env) {
    skip("HBAR transfer", "set ACCOUNT_A_ID, ACCOUNT_A_KEY, ACCOUNT_B_ID in .env");
    return;
  }
  const [accountAId, accountAKey, accountBId] = env;

  const balanceA = await getHbarBalance(accountAId);
  const balanceB = await getHbarBalance(accountBId);
  report(`fetched balance for ${accountAId} (${balanceA} ℏ)`, Number.isFinite(balanceA));
  report(`fetched balance for ${accountBId} (${balanceB} ℏ)`, Number.isFinite(balanceB));

  const client = Client.forTestnet().setOperator(
    AccountId.fromString(accountAId),
    PrivateKey.fromStringECDSA(accountAKey)
  );

  const amount = 1;
  const tx = await new TransferTransaction()
    .addHbarTransfer(accountAId, new Hbar(-amount))
    .addHbarTransfer(accountBId, new Hbar(amount))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  report("transfer transaction reached consensus", receipt.status === Status.Success);

  const newBalanceB = await pollForChange(accountBId, balanceB);
  report("receiver balance increased", newBalanceB === balanceB + amount);

  client.close();
}

// ---------- main ----------

runCanonicalizationChecks();
await runTransferChecks();

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
