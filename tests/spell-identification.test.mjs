import { test } from "node:test";
import assert from "node:assert/strict";
import { installStub } from "./_stub.mjs";

const ID = "pf15-discovery-veil";
const SETTINGS = { spellcraftEnabled: true, spellMaskScope: "hostile", spellPublicEffect: false, debugLogging: false };
installStub({ settings: SETTINGS });
const spell = await import("../scripts/spell-identification.mjs");

function au(disposition, owned = false) {
  return {
    item: { type: "spell", name: "Fireball", uuid: "I1", system: { level: 3, school: "evo" } },
    actor: { name: "Cultist", uuid: "A1", hasPlayerOwner: owned, prototypeToken: { disposition } },
    token: null,
    action: null
  };
}

test("friendly caster is not masked under hostile scope", () => {
  installStub({ settings: SETTINGS });
  const a = au(1);
  spell.onPreActionUse(a);
  assert.equal(spell.onPreDisplayActionUse(a), undefined);
});

test("hostile caster is masked", async () => {
  installStub({ settings: SETTINGS });
  const a = au(-1);
  spell.onPreActionUse(a);
  assert.equal(spell.onPreDisplayActionUse(a), false);
  await flush();
});

// Several sequential registry/private-store writes, each a tick in the stub.
const flush = async () => { for ( let i = 0; i < 10; i++ ) await new Promise(r => setTimeout(r, 0)); };

test("cancelled cast leaves no card or gate", async () => {
  const stub = installStub({ settings: SETTINGS });
  spell.onPreActionUse(au(-1));
  await flush();
  assert.equal(stub.created.length, 0);
  assert.deepEqual(stub.registry().spellcasting, {});
});

test("displayed cast posts one generic card and a masked gate", async () => {
  const stub = installStub({ settings: SETTINGS });
  const a = au(-1);
  spell.onPreActionUse(a);
  assert.equal(spell.onPreDisplayActionUse(a), false);
  await flush();
  assert.equal(stub.created.length, 1);
  const flag = stub.created[0].flags[ID];
  assert.equal(flag.kind, "maskedSpell");
  assert.equal(stub.registry().spellcasting[flag.castId].state, "masked");
});

test("generic card carries no identity", async () => {
  const stub = installStub({ settings: SETTINGS });
  const a = au(-1);
  spell.onPreActionUse(a);
  spell.onPreDisplayActionUse(a);
  await flush();
  assert.ok(!stub.created[0].content.includes("Fireball"));
  assert.ok(!JSON.stringify(stub.registry()).includes("Fireball"));
});

function msg(id, castId, kind) { return { id, flags: { [ID]: { castId, kind } } }; }

test("clear deletes only that cast's generic card", async () => {
  const stub = installStub({ settings: SETTINGS, messages: [msg("m1", "X", "maskedSpell"), msg("m2", "X", "spellReveal"), msg("m3", "Y", "maskedSpell")] });
  await spell.clearSpellMask("X");
  assert.deepEqual(stub.deleted, [["m1"]]);
});

test("clear with no card deletes nothing", async () => {
  const stub = installStub({ settings: SETTINGS, messages: [msg("m1", "X", "maskedSpell")] });
  await spell.clearSpellMask("Z");
  assert.equal(stub.deleted.length, 0);
});

test("a repeat display call suppresses without a second card", async () => {
  const stub = installStub({ settings: SETTINGS });
  const a = au(-1);
  spell.onPreActionUse(a);
  spell.onPreDisplayActionUse(a);
  assert.equal(spell.onPreDisplayActionUse(a), false);
  await flush();
  assert.equal(stub.created.length, 1);
});
