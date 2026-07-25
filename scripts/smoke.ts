import { createHash } from "node:crypto";

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

const obsA = { value: 42.5, sensor: "buoy-7", ts: 1753449600 };
const obsB = { ts: 1753449600, value: 42.5, sensor: "buoy-7" };
const nestedA = { meta: { unit: "C", zone: "atl" }, id: 1 };
const nestedB = { id: 1, meta: { zone: "atl", unit: "C" } };
const tampered = { ...obsA, value: 42.6 };

const cases: [string, boolean][] = [
  ["key-order independence", sealHash(obsA) === sealHash(obsB)],
  ["nested key-order independence", sealHash(nestedA) === sealHash(nestedB)],
  ["tampered payload hashes differently", sealHash(obsA) !== sealHash(tampered)],
  ["seal -> reveal -> verify round trip", sealHash(obsA) === sealHash({ ...obsA })],
];

let failures = 0;
for (const [name, pass] of cases) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}`);
  if (!pass) failures++;
}

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
