/**
 * Key store (specs §9): the per-message key vaulted by HCS sequence number.
 * Postgres-backed so it survives restarts. Routes use put/get only.
 */
import { Pool } from "pg";
import type { KeyResponse } from "../../shared/index.js";
import { config } from "./config.js";

const pool = new Pool({ connectionString: config.databaseUrl });

/** Create the table if it does not exist. Called once at boot. */
export async function init() {
  await pool.query(`
    create table if not exists keys (
      seq bigint primary key,
      key text not null,
      iv  text not null
    )
  `);
}

export async function put(seq: number, k: KeyResponse) {
  await pool.query(
    "insert into keys (seq, key, iv) values ($1, $2, $3) on conflict (seq) do nothing",
    [seq, k.key, k.iv],
  );
}

export async function get(seq: number): Promise<KeyResponse | undefined> {
  const { rows } = await pool.query("select key, iv from keys where seq = $1", [seq]);
  return rows[0];
}
