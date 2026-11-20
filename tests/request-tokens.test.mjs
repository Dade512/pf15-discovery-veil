import { test } from "node:test";
import assert from "node:assert/strict";

const { createRequestLedger } = await import("../scripts/request-tokens.mjs");
const ledger = () => { let n = 0; return createRequestLedger(() => `r${++n}`); };

test("a minted id redeems once", () => {
  const l = ledger();
  const id = l.mint("u1", "A");
  assert.equal(l.redeem(id, "u1", "A"), "ok");
  assert.equal(l.redeem(id, "u1", "A"), "stale");
});

test("a mismatched user or key is rejected and leaves the id open", () => {
  const l = ledger();
  const id = l.mint("u1", "A");
  assert.equal(l.redeem(id, "u2", "A"), "rejected");
  assert.equal(l.redeem(id, "u1", "B"), "rejected");
  assert.equal(l.redeem(id, "u1", "A"), "ok");
});

test("an unknown id is rejected", () => {
  const l = ledger();
  l.mint("u1", "A");
  assert.equal(l.redeem("nope", "u1", "A"), "rejected");
  assert.equal(l.redeem(undefined, "u1", "A"), "rejected");
});

test("minting again for the same user and key retires the old id", () => {
  const l = ledger();
  const old = l.mint("u1", "A");
  const other = l.mint("u2", "A");
  const fresh = l.mint("u1", "A");
  assert.notEqual(old, fresh);
  assert.equal(l.redeem(old, "u1", "A"), "stale");
  assert.equal(l.redeem(fresh, "u1", "A"), "ok");
  assert.equal(l.redeem(other, "u2", "A"), "ok");
});
