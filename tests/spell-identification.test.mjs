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

test("hostile caster is masked", () => {
  installStub({ settings: SETTINGS });
  const a = au(-1);
  spell.onPreActionUse(a);
  assert.equal(spell.onPreDisplayActionUse(a), false);
});
