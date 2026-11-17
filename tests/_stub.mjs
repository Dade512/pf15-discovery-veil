/**
 * Minimal Foundry globals for node --test (no DOM, no canvas).
 * Installs game.user/users/world/settings/messages/i18n, ui.notifications,
 * foundry.utils + a DialogV2 placeholder (skill-request.mjs reads it at import),
 * ChatMessage.implementation spies and CONST.TOKEN_DISPOSITIONS. pf1 stays
 * undefined.
 */
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
    settings: {
      get: (_module, key) => structuredClone(store[key]),
      set: async (_module, key, value) => { writes++; store[key] = structuredClone(value); return value; }
    },
    i18n: { localize: k => k, format: k => k }
  };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {}, info: () => {} } };
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
    created, deleted, updates
  };
}
