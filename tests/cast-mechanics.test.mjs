import { test } from "node:test";
import assert from "node:assert/strict";
import { makeShared } from "./_fixtures.mjs";

const m = await import("../scripts/cast-mechanics.mjs");
const fire = { types: ["fire"] };

test("extract keeps attack, crit and damage and skips empty entries", () => {
  const mech = m.extractMechanics(makeShared());
  assert.equal(mech.attacks.length, 1);
  const [a] = mech.attacks;
  assert.deepEqual(a.attack, { total: 23, natural: 20, isCrit: true });
  assert.equal(a.critConfirm, 12);
  assert.deepEqual(a.damage, [{ total: 7, damageType: fire }, { total: 1, damageType: fire }]);
  assert.equal(a.critDamage[0].total, 10);
  assert.deepEqual(mech.save, { type: "ref", dc: 17 });
});

test("a save DC without a save type stores no save", () => {
  const s = makeShared();
  s.save = undefined; s.saveDC = 12;
  assert.equal(m.extractMechanics(s).save, null);
});

test("a cast with no attack, damage or save stores nothing", () => {
  const s = makeShared();
  s.chatAttacks = [s.chatAttacks[1]];
  s.save = undefined;
  assert.equal(m.extractMechanics(s), null);
});

test("a damage-only entry is kept with a null attack", () => {
  const s = makeShared();
  s.chatAttacks[0].attack = null;
  const [a] = m.extractMechanics(s).attacks;
  assert.equal(a.attack, null);
  assert.equal(a.damage.length, 2);
});

const rec = () => m.extractMechanics(makeShared()).attacks[0];

test("normal plan sums the parts", () => {
  const p = m.damagePlan(rec(), "normal");
  assert.equal(p.value, 8);
  assert.equal(p.parts.length, 2);
  assert.equal(p.isCritical, false);
});

test("half floors each instance", () => {
  const p = m.damagePlan(rec(), "half");
  assert.deepEqual(p.parts.map(x => x.value), [3, 0]);
  assert.equal(p.value, 3);
});

test("crit adds crit damage and flags it", () => {
  const p = m.damagePlan(rec(), "crit");
  assert.equal(p.value, 18);
  assert.equal(p.parts.length, 3);
  assert.equal(p.isCritical, true);
});

test("crit with no crit damage is null", () => {
  const r = rec(); r.critDamage = [];
  assert.equal(m.damagePlan(r, "crit"), null);
});

test("no damage gives no plan for any mode", () => {
  const r = rec(); r.damage = [];
  for ( const mode of ["normal", "half", "crit"] ) assert.equal(m.damagePlan(r, mode), null);
});

test("mechanicsLines lists attack, crit, damage, crit damage, then save", () => {
  const lines = m.mechanicsLines(m.extractMechanics(makeShared()),
    { typeLabel: id => id.toUpperCase(), saveLabel: () => "Reflex" });
  assert.deepEqual(lines.map(l => l.key), [
    "PF15DV.Spell.MechAttack", "PF15DV.Spell.MechCrit", "PF15DV.Spell.MechDamage",
    "PF15DV.Spell.MechCritDamage", "PF15DV.Spell.MechSave"
  ]);
  assert.deepEqual(lines[0].data, { n: 1, total: 23, natural: 20 });
  assert.deepEqual(lines[1].data, { n: 1, confirm: 12 });
  assert.deepEqual(lines[2].data, { n: 1, total: 8, types: "FIRE" });
  assert.deepEqual(lines[3].data, { n: 1, total: 10, types: "FIRE" });
  assert.deepEqual(lines[4].data, { save: "Reflex", dc: 17 });
});

test("applyDamagePlan hands pf1 typed instances", async () => {
  const calls = [];
  globalThis.pf1 = {
    models: { action: { DamagePartModel: class { constructor(d) { Object.assign(this, structuredClone(d)); } } } },
    documents: { actor: { ActorPF: { applyDamage: async (value, opts) => { calls.push({ value, opts }); } } } }
  };
  await m.applyDamagePlan(m.damagePlan(rec(), "crit"));
  delete globalThis.pf1;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].value, 18);
  assert.equal(calls[0].opts.isCritical, true);
  assert.equal(calls[0].opts.interactive, true);
  assert.equal(calls[0].opts.instances.length, 3);
  assert.equal(calls[0].opts.instances[2].value, 10);
  assert.deepEqual(calls[0].opts.instances[2].types, ["fire"]);
});

const healingShared = () => { const s = makeShared(); s.chatAttacks[0].isHealing = true; return s; };

test("healing entries are flagged", () => {
  assert.equal(m.extractMechanics(makeShared()).attacks[0].isHealing, false);
  assert.equal(m.extractMechanics(healingShared()).attacks[0].isHealing, true);
});

test("a healing plan heals", () => {
  const p = m.damagePlan(m.extractMechanics(healingShared()).attacks[0], "normal");
  assert.equal(p.value, -8);
  assert.deepEqual(p.parts.map(x => x.value), [7, 1]);
});

test("healing has no crit plan", () => {
  assert.equal(m.damagePlan(m.extractMechanics(healingShared()).attacks[0], "crit"), null);
});

test("healing lines say healing", () => {
  const keys = m.mechanicsLines(m.extractMechanics(healingShared()), { typeLabel: id => id, saveLabel: t => t }).map(l => l.key);
  assert.ok(keys.includes("PF15DV.Spell.MechHealing"));
  assert.ok(!keys.includes("PF15DV.Spell.MechDamage"));
});
