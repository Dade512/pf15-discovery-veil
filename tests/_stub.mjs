/**
 * Minimal Foundry globals for node --test (no DOM, no canvas).
 * Installs game.user/users/world/settings/messages/i18n, ui.notifications,
 * foundry.utils + a DialogV2 placeholder (skill-request.mjs reads it at import),
 * ChatMessage.implementation spies and CONST.TOKEN_DISPOSITIONS. pf1 stays
 * undefined.
 *
 * 0.7.9: a socketlib stub (one module-level socket, because skill-request.mjs
 * memoizes the first one it is given), notification capture in `notes`
 * ({level, key}), and game.actors = [].
 */
const socket = {
  handlers: {},
  sent: [],
  register(name, fn) { socket.handlers[name] = fn; },
  executeForUsers(type, userIds, payload) { socket.sent.push({ type, userIds: [...userIds], payload: structuredClone(payload) }); },
  executeAsGM: async (type, payload) => socket.handlers[type].call({ socketdata: { userId: game.user.id } }, structuredClone(payload))
};

export function installStub({
  isGM = true, userId = "gm", activeGMId = "gm", registry = {}, settings = {}, messages = []
} = {}) {
  const store = {
    publicRegistry: { schemaVersion: 1, perception: {}, spellcasting: {}, ...structuredClone(registry) },
    privateStore: { schemaVersion: 1, worlds: {} },
    ...structuredClone(settings)
  };
  let writes = 0;
  let ids = 0;
  const created = [];
  const deleted = [];
  const updates = [];
  const notes = [];
  socket.sent = [];
  const users = [
    { id: "gm", name: "gm", isGM: true },
    { id: "u1", name: "u1", isGM: false },
    { id: "u2", name: "u2", isGM: false }
  ];
  users.activeGM = users.find(u => u.id === activeGMId) ?? (activeGMId ? { id: activeGMId, isGM: true } : null);
  users.get = id => users.find(u => u.id === id);
  globalThis.game = {
    user: { isGM, id: userId },
    users,
    world: { id: "w1" },
    messages,
    actors: [],
    settings: {
      get: (_module, key) => structuredClone(store[key]),
      // Commits after a tick, like a real server round-trip, so same-tick races show.
      set: async (_module, key, value) => { await new Promise(r => setTimeout(r, 0)); writes++; store[key] = structuredClone(value); return value; }
    },
    i18n: { localize: k => k, format: k => k }
  };
  const note = level => key => { notes.push({ level, key }); };
  globalThis.ui = { notifications: { warn: note("warn"), error: note("error"), info: note("info") } };
  globalThis.socketlib = { registerModule: () => socket };
  globalThis.foundry = {
    utils: { deepClone: v => structuredClone(v), randomID: () => `cast${++ids}` },
    applications: { api: { DialogV2: {} } }
  };
  globalThis.ChatMessage = {
    implementation: {
      create: async data => { created.push(structuredClone(data)); return data; },
      getSpeaker: ({ actor } = {}) => ({ alias: actor?.name }),
      deleteDocuments: async list => { deleted.push([...list]); return list; }
    }
  };
  globalThis.CONST = { TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 } };
  return {
    writes: () => writes,
    registry: () => structuredClone(store.publicRegistry),
    created, deleted, updates, notes, socket
  };
}
