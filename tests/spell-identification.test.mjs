import { test } from "node:test";
import assert from "node:assert/strict";
import { installStub } from "./_stub.mjs";
import { makeShared } from "./_fixtures.mjs";

const ID = "pf15-discovery-veil";
const SETTINGS = { spellcraftEnabled: true, spellMaskScope: "hostile", spellPublicEffect: false, debugLogging: false };
installStub({ settings: SETTINGS });
const spell = await import("../scripts/spell-identification.mjs");
const state = await import("../scripts/state.mjs");
const { extractMechanics } = await import("../scripts/cast-mechanics.mjs");

const plainShared = () => ({ rollMode: "publicroll", chatMessage: true, scriptData: {}, chatAttacks: [] });

function au(disposition, owned = false, shared = plainShared()) {
  return {
    item: { type: "spell", name: "Fireball", uuid: "I1", system: { level: 3, school: "evo" } },
    actor: { name: "Cultist", uuid: "A1", hasPlayerOwner: owned, prototypeToken: { disposition } },
    token: null,
    action: null,
    shared
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

test("a masked cast's dice go to GMs only", () => {
  installStub({ settings: SETTINGS });
  const a = au(-1);
  spell.onPreActionUse(a);
  assert.equal(a.shared.rollMode, "gmroll");
});

test("a friendly cast keeps its roll mode", () => {
  installStub({ settings: SETTINGS });
  const a = au(1);
  spell.onPreActionUse(a);
  assert.equal(a.shared.rollMode, "publicroll");
});

test("a cast with chatMessage false masks nothing", async () => {
  const stub = installStub({ settings: SETTINGS });
  const a = au(-1);
  a.shared.chatMessage = false;
  spell.onPreActionUse(a);
  assert.equal(spell.onPreDisplayActionUse(a), undefined);
  await flush();
  assert.equal(stub.created.length, 0);
  assert.deepEqual(stub.registry().spellcasting, {});
});

test("a script call that hides chat masks nothing", async () => {
  const stub = installStub({ settings: SETTINGS });
  const a = au(-1);
  spell.onPreActionUse(a);
  a.shared.scriptData = { hideChat: true };
  assert.equal(spell.onPreDisplayActionUse(a), undefined);
  await flush();
  assert.equal(stub.created.length, 0);
  assert.deepEqual(stub.registry().spellcasting, {});
});

test("the stored identity carries the cast's mechanics", async () => {
  const stub = installStub({ settings: SETTINGS });
  const a = au(-1, false, makeShared());
  spell.onPreActionUse(a);
  spell.onPreDisplayActionUse(a);
  await flush();
  const castId = stub.created[0].flags[ID].castId;
  assert.deepEqual(state.getHiddenSpellIdentity(castId).mechanics, extractMechanics(makeShared()));
});

test("the card and the public registry carry no mechanics", async () => {
  const stub = installStub({ settings: SETTINGS });
  const a = au(-1, false, makeShared());
  spell.onPreActionUse(a);
  spell.onPreDisplayActionUse(a);
  await flush();
  for ( const text of [JSON.stringify(stub.registry()), JSON.stringify(stub.created[0])] ) {
    assert.ok(!text.includes("mechanics"));
    assert.ok(!text.includes("critConfirm"));
  }
});

test("a non-active GM's masked cast stores no mechanics", async () => {
  installStub({ settings: SETTINGS, activeGMId: "gm2" });
  const a = au(-1, false, makeShared());
  spell.onPreActionUse(a);
  assert.equal(spell.onPreDisplayActionUse(a), false);
  await flush();
  assert.deepEqual(game.settings.get(ID, "privateStore").worlds, {});
});
