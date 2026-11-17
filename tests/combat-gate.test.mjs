import { test } from "node:test";
import assert from "node:assert/strict";
import { installStub } from "./_stub.mjs";

const { onCreateCombatant, onPreCreateChatMessage } = await import("../scripts/combat-gate.mjs");

const GATE = { state: "undetected", priorHidden: false, hiddenByModule: true, spottedBy: {}, combatantHides: [] };
const seeded = (opts = {}) => installStub({ registry: { perception: { "S1:T1": structuredClone(GATE) } }, ...opts });

function combatant(hidden) {
  const calls = [];
  return { id: "c9", sceneId: "S1", tokenId: "T1", hidden, calls, update: async data => { calls.push(data); } };
}

function message({ initiative = true, whisper = [] } = {}) {
  const calls = [];
  return {
    flags: initiative ? { core: { initiativeRoll: true } } : {},
    speaker: { scene: "S1", token: "T1" },
    whisper,
    calls,
    updateSource: data => { calls.push(data); }
  };
}

test("late hidden combatant is recorded", async () => {
  const stub = seeded();
  const c = combatant(true);
  await onCreateCombatant(c, {}, "gm");
  assert.deepEqual(stub.registry().perception["S1:T1"].combatantHides, ["c9"]);
  assert.equal(c.calls.length, 0);
});

test("late visible combatant is hidden and recorded", async () => {
  const stub = seeded();
  const c = combatant(false);
  await onCreateCombatant(c, {}, "gm");
  assert.deepEqual(c.calls, [{ hidden: true }]);
  assert.deepEqual(stub.registry().perception["S1:T1"].combatantHides, ["c9"]);
});

test("recording twice keeps one id", async () => {
  const stub = seeded();
  await onCreateCombatant(combatant(true), {}, "gm");
  await onCreateCombatant(combatant(true), {}, "gm");
  assert.deepEqual(stub.registry().perception["S1:T1"].combatantHides, ["c9"]);
});

test("non-active GM does nothing", async () => {
  const stub = seeded({ activeGMId: "gm2" });
  const c = combatant(false);
  await onCreateCombatant(c, {}, "gm");
  assert.deepEqual(stub.registry().perception["S1:T1"].combatantHides, []);
  assert.equal(c.calls.length, 0);
  assert.equal(stub.writes(), 0);
});

test("undetected initiative card goes GM-only", () => {
  seeded();
  const m = message();
  assert.notEqual(onPreCreateChatMessage(m, {}, {}, "gm"), false);
  assert.deepEqual(m.calls, [{ whisper: ["gm"], blind: false }]);
});

test("already-whispered initiative card untouched", () => {
  seeded();
  const m = message({ whisper: ["gm"] });
  onPreCreateChatMessage(m, {}, {}, "gm");
  assert.equal(m.calls.length, 0);
});

test("non-initiative message untouched", () => {
  seeded();
  const m = message({ initiative: false });
  onPreCreateChatMessage(m, {}, {}, "gm");
  assert.equal(m.calls.length, 0);
});

test("player client never rewrites", () => {
  seeded({ isGM: false, userId: "u1" });
  const m = message();
  onPreCreateChatMessage(m, {}, {}, "u1");
  assert.equal(m.calls.length, 0);
});

test("combatants created in one batch are all recorded", async () => {
  const stub = seeded();
  const a = { ...combatant(true), id: "cA" };
  const b = { ...combatant(true), id: "cB" };
  await Promise.all([onCreateCombatant(a, {}, "gm"), onCreateCombatant(b, {}, "gm")]);
  assert.deepEqual(stub.registry().perception["S1:T1"].combatantHides.sort(), ["cA", "cB"]);
});
