import { test } from "node:test";
import assert from "node:assert/strict";
import { installStub } from "./_stub.mjs";

const state = await import("../scripts/state.mjs");

test("markUndetected records combatantHides", async () => {
  const stub = installStub();
  assert.equal(await state.markUndetected("S1", "T1", { combatantHides: ["c1"] }), true);
  assert.deepEqual(stub.registry().perception["S1:T1"].combatantHides, ["c1"]);
});

test("assertNoSecrets rejects a spellName", () => {
  installStub();
  assert.throws(() => state.assertNoSecrets({ spellcasting: { x: { spellName: "Fireball" } } }));
});

test("identity keeps a copy of its mechanics", async () => {
  installStub();
  const mechanics = { attacks: [{ attack: { total: 23, natural: 20, isCrit: false }, critConfirm: null, damage: [], critDamage: [] }], save: null };
  assert.equal(await state.setHiddenSpellIdentity("c1", { spellName: "Fireball", mechanics }), true);
  mechanics.attacks[0].attack.total = 1;
  assert.equal(state.getHiddenSpellIdentity("c1").mechanics.attacks[0].attack.total, 23);
});

test("mechanics is a forbidden public key", () => {
  installStub();
  assert.throws(() => state.assertNoSecrets({ spellcasting: { x: { mechanics: {} } } }));
});

test("no active GM: identity is neither stored nor read", async () => {
  installStub({ activeGMId: null });
  assert.equal(await state.setHiddenSpellIdentity("c1", { spellName: "Fireball" }), false);
  assert.equal(state.getHiddenSpellIdentity("c1"), null);
});
