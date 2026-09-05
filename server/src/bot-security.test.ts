/**
 * Bot security tests — /track ownership (H1): order ids are enumerable
 * (DL-1000…DL-9999) and courier_note is manager free text, so a public
 * search without scope is an IDOR. Only the owner (or admin/courier) may
 * resolve an order.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

const TOKEN = "bot-security-token";
const ADMIN_ID = 770001;
const COURIER_CHAT = 660001;
process.env.TG_BOT_TOKEN = TOKEN;
process.env.ADMIN_CHAT_ID = String(ADMIN_ID);
process.env.COURIER_CHAT_IDS = String(COURIER_CHAT);
process.env.DELIS_DB_PATH = ":memory:";
process.env.DELIS_AUTOSTART = "0";
process.env.DELIS_DISABLE_NOTIFY = "1";
process.env.SEED_ON_START = "false";

let db: ReturnType<Awaited<typeof import("./index.js")>["ensureDb"]>;

function insertOrder(id: string, tgId: number, note: string | null = null) {
  db.prepare(`INSERT OR IGNORE INTO users (tg_id, first_name) VALUES (?, 'Test')`).run(tgId);
  db.prepare(
    `INSERT INTO orders (id, tg_id, subtotal, total, delivery_method, payment_method, status, courier_note, delivery_zone)
     VALUES (?, ?, 100000, 100000, 'courier_uzb', 'cash', 'new', ?, 'tashkent_city')`,
  ).run(id, tgId, note);
}

before(async () => {
  const mod = await import("./index.js");
  db = mod.ensureDb();
  const { seedOnStart } = await import("./seed-runner.js");
  seedOnStart(true);
  insertOrder("DL-1001", 111001);
  insertOrder("DL-1002", 111002, "BTS-99887 delivery code");
});

describe("/track order lookup is owner-scoped (IDOR fix)", async () => {
  const { trackOrderLookup } = await import("./bot.js");

  it("owner finds their own order by id", () => {
    const r = trackOrderLookup(db, { fromId: 111001, chatId: 111001, arg: "DL-1001" });
    assert.equal(r.found, true);
    if (r.found) assert.equal(r.order.id, "DL-1001");
  });

  it("stranger does NOT find another user's order by id", () => {
    const r = trackOrderLookup(db, { fromId: 120001, chatId: 120001, arg: "DL-1001" });
    assert.equal(r.found, false);
  });

  it("stranger does NOT find an order via BTS code in courier_note", () => {
    const r = trackOrderLookup(db, { fromId: 120002, chatId: 120002, arg: "BTS-99887" });
    assert.equal(r.found, false);
  });

  it("owner finds their own order via BTS code in courier_note", () => {
    const r = trackOrderLookup(db, { fromId: 111002, chatId: 111002, arg: "bts 99887" });
    assert.equal(r.found, true);
    if (r.found) assert.equal(r.order.id, "DL-1002");
  });

  it("admin may look up any order", () => {
    const r = trackOrderLookup(db, { fromId: ADMIN_ID, chatId: ADMIN_ID, arg: "DL-1001" });
    assert.equal(r.found, true);
  });

  it("courier (allowed chat) may look up any order", () => {
    const r = trackOrderLookup(db, { fromId: 55001, chatId: COURIER_CHAT, arg: "DL-1002" });
    assert.equal(r.found, true);
  });

  it("no identity (channel/service message) resolves nothing", () => {
    const r = trackOrderLookup(db, { chatId: 55001, arg: "DL-1001" });
    assert.equal(r.found, false);
  });

  it("unknown order id is simply not found", () => {
    const r = trackOrderLookup(db, { fromId: 111001, chatId: 111001, arg: "DL-9999" });
    assert.equal(r.found, false);
  });
});
