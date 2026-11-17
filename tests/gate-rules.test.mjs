import { test } from "node:test";
import assert from "node:assert/strict";

const rules = await import("../scripts/gate-rules.mjs");
const undetected = (priorHidden = false) => ({ state: "undetected", priorHidden });

test("combatantHidePlan: no gate does nothing", () => {
  assert.deepEqual(rules.combatantHidePlan({ gate: null, combatantHidden: false }), { hide: false, record: false });
});

test("combatantHidePlan: revealed gate does nothing", () => {
  assert.deepEqual(rules.combatantHidePlan({ gate: { state: "globallyRevealed" }, combatantHidden: false }),
    { hide: false, record: false });
});

test("combatantHidePlan: visible row under an undetected gate is hidden and recorded", () => {
  assert.deepEqual(rules.combatantHidePlan({ gate: undetected(), combatantHidden: false }), { hide: true, record: true });
  assert.deepEqual(rules.combatantHidePlan({ gate: undetected(true), combatantHidden: false }), { hide: true, record: true });
});

test("combatantHidePlan: core-copied hide is recorded", () => {
  assert.deepEqual(rules.combatantHidePlan({ gate: undetected(false), combatantHidden: true }), { hide: false, record: true });
});

test("combatantHidePlan: GM's own prior hide is left alone", () => {
  assert.deepEqual(rules.combatantHidePlan({ gate: undetected(true), combatantHidden: true }), { hide: false, record: false });
});

test("shouldPrivatizeInitiative only for an unwhispered undetected initiative card", () => {
  assert.equal(rules.shouldPrivatizeInitiative({ isInitiative: true, gateState: "undetected", whisperCount: 0 }), true);
  assert.equal(rules.shouldPrivatizeInitiative({ isInitiative: false, gateState: "undetected", whisperCount: 0 }), false);
  assert.equal(rules.shouldPrivatizeInitiative({ isInitiative: true, gateState: "globallyRevealed", whisperCount: 0 }), false);
  assert.equal(rules.shouldPrivatizeInitiative({ isInitiative: true, gateState: null, whisperCount: 0 }), false);
  assert.equal(rules.shouldPrivatizeInitiative({ isInitiative: true, gateState: "undetected", whisperCount: 2 }), false);
});

test("isMaskableCaster: scope table", () => {
  const m = (hasPlayerOwner, disposition, scope) => rules.isMaskableCaster({ hasPlayerOwner, disposition, scope });
  assert.equal(m(true, -1, "hostile"), false);
  assert.equal(m(false, -2, "hostile"), true);
  assert.equal(m(false, -1, "hostile"), true);
  assert.equal(m(false, 0, "hostile"), false);
  assert.equal(m(false, 1, "hostile"), false);
  assert.equal(m(false, 0, "hostileNeutral"), true);
  assert.equal(m(false, 1, "hostileNeutral"), false);
  assert.equal(m(false, 1, "allNonPlayer"), true);
  assert.equal(m(false, null, "hostile"), true);
  assert.equal(m(false, 0, "bogus"), false);
});

test("casterDisposition: token first", () => {
  assert.equal(rules.casterDisposition({ token: { disposition: 1 } }, { token: { disposition: -1 } }), 1);
});

test("casterDisposition: reads a placeable's document", () => {
  assert.equal(rules.casterDisposition({ token: { document: { disposition: -1 } } }, {}), -1);
});

test("casterDisposition: falls through to active token then prototype", () => {
  assert.equal(rules.casterDisposition({ token: null }, { token: null, getActiveTokens: () => [{ disposition: 0 }], prototypeToken: { disposition: 1 } }), 0);
  assert.equal(rules.casterDisposition({}, { getActiveTokens: () => [], prototypeToken: { disposition: -2 } }), -2);
});

test("casterDisposition: nothing gives null", () => {
  assert.equal(rules.casterDisposition({}, {}), null);
  assert.equal(rules.casterDisposition(null, null), null);
});
