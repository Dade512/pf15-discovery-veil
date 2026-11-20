import { test } from "node:test";
import assert from "node:assert/strict";
import { installStub } from "./_stub.mjs";

let stub = installStub({ settings: { debugLogging: false } });
const { createSkillBroker } = await import("../scripts/skill-request.mjs");

const gates = new Map();
const dcs = new Map();
const wins = [];
const I18N_KEYS = ["noActiveGate", "notActiveGM", "noEligible", "requestHint", "dcLabel", "requestTitle",
  "requestSend", "cancel", "requestSent", "noCharacter", "rollPromptTitle", "rollPromptBody",
  "resultNoDC", "resultSuccess", "resultFail"];

const broker = createSkillBroker({
  skillKey: "per", label: "perception", icon: "x", trained: false, source: "perception",
  socketMissingMsg: "no socketlib",
  socketTypes: { request: "tReq", result: "tRes" },
  gate: { get: t => gates.get(t) ?? null, activeState: "open" },
  dc: { get: t => dcs.get(t) ?? null },
  commitDC: async (t, dc) => { dcs.set(t, dc); return true; },
  requestPayload: t => ({ key: t }),
  readTarget: p => p.key,
  targetValid: t => !!t,
  targetKey: t => t,
  onSuccess: async (t, userId) => { wins.push([t, userId]); },
  i18n: Object.fromEntries(I18N_KEYS.map(k => [k, k]))
});

let rollValue;
function fresh() {
  stub = installStub({ settings: { debugLogging: false } });
  gates.clear(); dcs.clear(); wins.length = 0;
  rollValue = { rolls: [{ total: 20 }] };
  const actor = (id, name, owner) => ({
    id, name, hasPlayerOwner: true, system: { skills: {} },
    testUserPermission: u => u.id === owner,
    rollSkill: async () => rollValue
  });
  game.actors = [actor("a1", "Oswald", "u1"), actor("a2", "Brin", "u2")];
  broker.registerSocket();
  return stub;
}

const gmUser = () => { game.user = { id: "gm", isGM: true }; };

/** GM dispatches a request for `target` to `userIds`; returns the new sent entries. */
async function dispatch(target, userIds) {
  gmUser();
  gates.set(target, { state: "open" });
  const before = stub.socket.sent.length;
  foundry.applications.api.DialogV2.wait = async () => ({ dc: 15, userIds });
  await broker.openRequestDialog(target);
  return stub.socket.sent.slice(before);
}

/** A player receives a request payload, accepts the prompt and rolls. */
async function asPlayer(uid, payload) {
  game.user = { id: uid, isGM: false };
  foundry.applications.api.DialogV2.confirm = async () => true;
  await stub.socket.handlers.tReq.call({ socketdata: { userId: "gm" } }, payload);
  gmUser();
}

/** A result arriving at the GM from `uid`. */
const result = (uid, payload) => stub.socket.handlers.tRes.call({ socketdata: { userId: uid } }, payload);

test("an uninvited result is rejected and marks nothing", async () => {
  fresh();
  gates.set("A", { state: "open" }); dcs.set("A", 15);
  assert.equal(await result("u1", { key: "A", total: 99 }), "rejected");
  assert.deepEqual(wins, []);
});

test("each invited player gets their own request id", async () => {
  fresh();
  const sent = await dispatch("A", ["u1", "u2"]);
  assert.equal(sent.length, 2);
  for ( const s of sent ) assert.equal(s.userIds.length, 1);
  assert.notEqual(sent[0].payload.requestId, sent[1].payload.requestId);
});

test("an invited result is received and adjudicated", async () => {
  fresh();
  const [s] = await dispatch("A", ["u1"]);
  assert.equal(await result("u1", { key: "A", requestId: s.payload.requestId, total: 20 }), "received");
  assert.deepEqual(wins, [["A", "u1"]]);
});

test("a request id is spent on use", async () => {
  fresh();
  const [s] = await dispatch("A", ["u1"]);
  const p = { key: "A", requestId: s.payload.requestId, total: 20 };
  await result("u1", p);
  assert.equal(await result("u1", p), "stale");
  assert.equal(wins.length, 1);
});

test("another player cannot use someone else's request id", async () => {
  fresh();
  const [s] = await dispatch("A", ["u1"]);
  const p = { key: "A", requestId: s.payload.requestId, total: 20 };
  assert.equal(await result("u2", p), "rejected");
  assert.equal(await result("u1", p), "received");
});

test("a request id only answers its own target", async () => {
  fresh();
  const [s] = await dispatch("A", ["u1"]);
  gates.set("B", { state: "open" }); dcs.set("B", 15);
  assert.equal(await result("u1", { key: "B", requestId: s.payload.requestId, total: 20 }), "rejected");
  assert.deepEqual(wins, []);
});

test("re-requesting the same player and target retires the older id", async () => {
  fresh();
  const [oldReq] = await dispatch("A", ["u1"]);
  const [newReq] = await dispatch("A", ["u1"]);
  assert.equal(await result("u1", { key: "A", requestId: oldReq.payload.requestId, total: 20 }), "stale");
  assert.equal(await result("u1", { key: "A", requestId: newReq.payload.requestId, total: 20 }), "received");
});

test("one roll answers only its own request", async () => {
  fresh();
  const [a] = await dispatch("A", ["u1"]);
  const [b] = await dispatch("B", ["u1"]);
  rollValue = { rolls: [{ total: 21 }] };
  await asPlayer("u1", a.payload);
  assert.deepEqual(wins, [["A", "u1"]]);
  assert.equal(await result("u1", { key: "B", requestId: b.payload.requestId, total: 21 }), "received");
  assert.deepEqual(wins, [["A", "u1"], ["B", "u1"]]);
});

test("a cancelled roll relays nothing", async () => {
  fresh();
  const [a] = await dispatch("A", ["u1"]);
  rollValue = undefined;
  await asPlayer("u1", a.payload);
  assert.deepEqual(wins, []);
  assert.ok(!stub.notes.some(n => n.key === "PF15DV.Notify.RollReceived"));
});

test("the player sees a neutral received notice", async () => {
  fresh();
  const [a] = await dispatch("A", ["u1"]);
  await asPlayer("u1", a.payload);
  assert.ok(stub.notes.some(n => (n.level === "info") && (n.key === "PF15DV.Notify.RollReceived")));
});

test("an unknown request id gets the closed notice", async () => {
  fresh();
  gates.set("A", { state: "open" }); dcs.set("A", 15);
  await asPlayer("u1", { key: "A", requestId: "from-before-a-reload" });
  assert.ok(stub.notes.some(n => (n.level === "warn") && (n.key === "PF15DV.Notify.RequestClosed")));
  assert.deepEqual(wins, []);
});

test("a closed gate makes the result stale", async () => {
  fresh();
  const [s] = await dispatch("A", ["u1"]);
  gates.delete("A");
  assert.equal(await result("u1", { key: "A", requestId: s.payload.requestId, total: 20 }), "stale");
  assert.deepEqual(wins, []);
});
