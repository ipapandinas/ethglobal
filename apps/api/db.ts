/**
 * Key store (specs §9): the per-message key vaulted by HCS sequence number,
 * plus the committed price so the paywall can quote it. Postgres-backed so it
 * survives restarts.
 */
import { Pool } from "pg";
import type { KeyResponse } from "../../shared/index.js";
import { config } from "./config.js";

const pool = new Pool({ connectionString: config.databaseUrl });

export interface SignalRow extends KeyResponse {
  price: string;
}

/** Create the table if needed, and add the price column if an old table lacks it. */
export async function init() {
  await pool.query(`
    create table if not exists keys (
      seq   bigint primary key,
      key   text not null,
      iv    text not null,
      price text not null
    )
  `);
  await pool.query("alter table keys add column if not exists price text not null default '$0.00'");
}

export async function put(seq: number, k: KeyResponse, price: string) {
  await pool.query(
    "insert into keys (seq, key, iv, price) values ($1, $2, $3, $4) on conflict (seq) do nothing",
    [seq, k.key, k.iv, price],
  );
}

export async function get(seq: number): Promise<SignalRow | undefined> {
  const { rows } = await pool.query("select key, iv, price from keys where seq = $1", [seq]);
  return rows[0];
}
