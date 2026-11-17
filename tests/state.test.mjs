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
