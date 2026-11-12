// Copy rules from the MamaDances playbook, checked on every build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fr = JSON.parse(read("copy/fr.json"));
const en = JSON.parse(read("copy/en.json"));
const html = read("index.html");

function shape(o, p = "") {
  if (Array.isArray(o)) return [`${p}[${o.length}]`, ...o.flatMap((v, i) => shape(v, `${p}[${i}]`))];
  if (o && typeof o === "object") return Object.keys(o).sort().flatMap((k) => shape(o[k], p ? `${p}.${k}` : k));
  return [p];
}
function strings(o) {
  if (typeof o === "string") return [o];
  if (o && typeof o === "object") return Object.values(o).flatMap(strings);
  return [];
}

test("fr.json and en.json have the same keys", () => {
  assert.deepEqual(shape(fr), shape(en));
});

test("every key used in index.html exists in both files", () => {
  const keys = [...html.matchAll(/data-(?:t|key|attr-aria-label)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  for (const k of keys) {
    for (const [name, c] of [["fr", fr], ["en", en]]) {
      const v = k.split(".").reduce((o, x) => (o == null ? o : o[x]), c);
      assert.ok(v != null, `${name}.json is missing ${k}`);
    }
  }
});

test("no em dashes or en dashes anywhere", () => {
  for (const f of ["copy/fr.json", "copy/en.json", "index.html", "assets/app.js", "assets/style.css"]) {
    assert.ok(!/[–—]/.test(read(f)), `${f} has an em or en dash`);
  }
});

test("no hype words, no income numbers, no fake urgency", () => {
  const banned = /\b(secret|hack|explode|crush|insane|guaranteed income|passive income|six figures|six-figure|only \d+ left|hurry|countdown|limited time|secrète|exploser|revenu passif|revenu garanti|dépêchez)\b/i;
  for (const [name, c] of [["fr", fr], ["en", en]]) {
    for (const s of strings(c)) assert.ok(!banned.test(s), `${name}: "${s}"`);
  }
});

test("sentences stay short (under 10% run past 16 words)", () => {
  for (const [name, c] of [["fr", fr], ["en", en]]) {
    const sentences = strings(c).flatMap((s) => s.replace(/[*]/g, "").split(/(?<=[.!?])\s+/)).filter((s) => s.trim());
    const long = sentences.filter((s) => s.split(/\s+/).length > 16);
    const share = long.length / sentences.length;
    assert.ok(share < 0.1, `${name}: ${long.length} long sentences:\n${long.join("\n")}`);
  }
});

test("prices match the offer ladder", () => {
  assert.match(fr.buybox.button, /27 \$/);
  assert.match(en.buybox.button, /CA\$27/);
  assert.match(fr.checkout.bump1_pitch, /17 \$/);
  assert.match(en.checkout.bump1_pitch, /CA\$17/);
  assert.match(fr.checkout.bump2_pitch, /27 \$/);
  assert.match(en.checkout.bump2_pitch, /CA\$27/);
});

test("footer carries the earnings line", () => {
  assert.match(fr.footer.earnings, /Aucun revenu n'est promis/);
  assert.match(en.footer.earnings, /No income is promised/);
});
