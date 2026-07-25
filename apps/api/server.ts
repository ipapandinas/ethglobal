/**
 * Broker HTTP server (specs §6). Two routes: signals (auth'd), reveal (paid).
 * Run: `tsx apps/api/server.ts`.
 */
import express from "express";
import { PublishRequest, err } from "../../shared/index.js";
import { config, isSelfBroker } from "./config.js";
import * as db from "./db.js";
import { publishSignal } from "./hcs.js";
import { requirePayment } from "./paywall.js";

const app = express();
app.use(express.json());

app.post("/signals", async (req, res) => {
  if (req.get("x-publish-secret") !== config.publishSecret) {
    return res.status(401).json(err("UNAUTHORIZED", "bad publish secret"));
  }
  const input = PublishRequest.parse(req.body);
  const { seq, key } = await publishSignal(input);
  await db.put(seq, key, input.price);
  res.status(201).json({ seq, key: key.key });
});

app.get("/reveal", requirePayment, async (req, res) => {
  const row = await db.get(Number(req.query.seq));
  if (!row) return res.status(404).json(err("NOT_FOUND", `no signal at seq ${req.query.seq}`));
  res.json({ key: row.key, iv: row.iv });
});

await db.init();
app.listen(config.port, () =>
  console.error(`nowcast broker :${config.port} — topic ${config.topicId}, ${isSelfBroker ? "self-broker" : `feeBps ${config.feeBps}`}`),
);
