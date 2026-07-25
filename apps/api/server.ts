/**
 * Broker HTTP server (specs §6). Three routes: health (public), signals (auth'd),
 * reveal (paid). Run: `tsx apps/api/server.ts`.
 */
import express from "express";
import { KeyResponse, PublishRequest, err } from "../../shared/index.js";
import { config, isSelfBroker } from "./config.js";
import { publishSignal } from "./hcs.js";
import { requirePayment } from "./paywall.js";

/** Key vault (specs §9): per-message key by seq. In-memory for the demo. */
const vault = new Map<number, KeyResponse>();

const app = express();
app.use(express.json());

app.post("/signals", async (req, res) => {
  if (req.get("x-publish-secret") !== config.publishSecret) {
    return res.status(401).json(err("UNAUTHORIZED", "bad publish secret"));
  }
  const input = PublishRequest.parse(req.body);
  const { seq, key } = await publishSignal(input);
  vault.set(seq, key);
  res.status(201).json({ seq, key: key.key });
});

app.get("/reveal", requirePayment, (req, res) => {
  const key = vault.get(Number(req.query.seq));
  if (!key) return res.status(404).json(err("NOT_FOUND", `no signal at seq ${req.query.seq}`));
  res.json(key);
});

app.listen(config.port, () =>
  console.error(`nowcast broker :${config.port} — topic ${config.topicId}, ${isSelfBroker ? "self-broker" : `feeBps ${config.feeBps}`}`),
);
