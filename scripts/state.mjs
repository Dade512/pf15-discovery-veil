import { MODULE_ID, SETTINGS, SCHEMA_VERSION } from "./module-constants.mjs";

/* ============================================================
 * pf15-discovery-veil — state layer (perception + spellcasting)
 *
 * Two stores, strictly separated (docs/ARCHITECTURE.md + SECURITY_AND_PRIVACY.md):
 *  - publicRegistry: WORLD setting, replicated to all clients. SAFE state ONLY
 *    (gate existence, display labels, spottedBy/identifiedBy maps, global-reveal
 *    + module-ownership flags). Guarded by assertNoSecrets on every write.
 *  - privateStore: CLIENT setting (window.localStorage, per-browser, NOT
 *    replicated — Foundry client-settings.mjs maps CLIENT -> localStorage).
 *    Holds GM secrets (hidden DCs, true spell identities). World-partitioned by
 *    game.world.id; written ONLY by the active-GM client.
 *
 * No feature code (hooks/HUD/render/token writes) lives here — this is the
 * storage + guard layer only (Lyra audit F-3/F-4; build-order step 1).
 * ============================================================ */

/** Keys that must NEVER appear anywhere in the replicated public registry. */
export const FORBIDDEN_PUBLIC_KEYS = new Set([
  "dc", "spellName", "spellId", "spellItemUuid", "casterActorUuid",
  "originalChatData", "gmNotes", "trapName", "description", "casterPlans"
]);

/* ---------- world id ---------- */

/**
 * The current world id, or null if unavailable. The private store is keyed by
 * this; everything touching private data fails closed when it is null.
 * @returns {string|null}
 */
export function getCurrentWorldIdOrNull() {
  const id = game?.world?.id;
  return (typeof id === "string" && id) ? id : null;
}

/* ---------- active-GM gate ---------- */

/**
 * True only when THIS client is Foundry's single active GM (game.users.activeGM)
 * — the canonical adjudicator and the machine that owns the private store
 * (Lyra F-5). Fails closed (false) when there is no active GM.
 * @returns {boolean}
 */
export function isActiveGMClient() {
  const active = game?.users?.activeGM;
  return !!active && (active.id === game.user?.id);
}

/**
 * Guard for active-GM-only operations. Returns true if allowed; otherwise warns
 * (with context) and returns false. Never throws.
 * @param {string} context
 * @returns {boolean}
 */
export function ensureActiveGMClient(context = "") {
  if ( isActiveGMClient() ) return true;
  console.warn(`${MODULE_ID} | active-GM-only operation refused (${context}); this client is not game.users.activeGM`);
  return false;
}

/* ---------- secret assertion ---------- */

/**
 * Recursively scan a value destined for the PUBLIC registry for forbidden
 * (secret) keys. Returns the list of offending key paths (empty = clean).
 * @param {unknown} value
 * @param {string} [path]
 * @returns {string[]}
 */
export function findForbiddenKeys(value, path = "") {
  const hits = [];
  if ( !value || (typeof value !== "object") ) return hits;
  for ( const [k, v] of Object.entries(value) ) {
    const here = path ? `${path}.${k}` : k;
    if ( FORBIDDEN_PUBLIC_KEYS.has(k) ) hits.push(here);
    if ( v && (typeof v === "object") ) hits.push(...findForbiddenKeys(v, here));
  }
  return hits;
}

/**
 * Throw if a public-registry payload contains any forbidden key. The public
 * write path calls this so a secret can never reach a replicated surface.
 * @param {unknown} payload
 * @param {string} context
 */
export function assertNoSecrets(payload, context = "") {
  const hits = findForbiddenKeys(payload);
  if ( hits.length ) {
    throw new Error(`${MODULE_ID} | refused public write (${context}): forbidden secret key(s) present: ${hits.join(", ")}`);
  }
}

/* ---------- public registry ---------- */

/**
 * Normalize a raw public-registry value. Unknown/newer schemaVersion -> empty
 * for READS (fail safe); writers refuse over an unknown version.
 * @param {unknown} raw
 * @returns {{schemaVersion:number, perception:object, spellcasting:object}}
 */
function normalizePublicRegistry(raw) {
  const empty = { schemaVersion: SCHEMA_VERSION, perception: {}, spellcasting: {} };
  if ( !raw || (typeof raw !== "object") ) return empty;
  if ( (raw.schemaVersion !== undefined) && (raw.schemaVersion !== SCHEMA_VERSION) ) return empty;
  return {
    schemaVersion: SCHEMA_VERSION,
    perception: (raw.perception && typeof raw.perception === "object") ? raw.perception : {},
    spellcasting: (raw.spellcasting && typeof raw.spellcasting === "object") ? raw.spellcasting : {}
  };
}

/**
 * Read the public registry (normalized; never null).
 * @returns {{schemaVersion:number, perception:object, spellcasting:object}}
 */
export function readPublicRegistry() {
  return normalizePublicRegistry(game.settings.get(MODULE_ID, SETTINGS.publicRegistry));
}

/**
 * Apply a mutation to a CLONE of the public registry and persist it. GM-only.
 * Refuses to write over an unknown/newer schemaVersion (no silent rebuild).
 * assertNoSecrets gates the result so no secret reaches this replicated surface.
 * @param {(reg:{perception:object, spellcasting:object}) => boolean} mutate  Return true if changed.
 * @param {string} [context]
 * @returns {Promise<boolean>}
 */
export async function updatePublicRegistry(mutate, context = "publicRegistry") {
  if ( !game.user?.isGM ) {
    console.warn(`${MODULE_ID} | public registry write refused: not a GM (${context})`);
    return false;
  }
  const raw = game.settings.get(MODULE_ID, SETTINGS.publicRegistry);
  if ( raw && (typeof raw === "object") && (raw.schemaVersion !== undefined) && (raw.schemaVersion !== SCHEMA_VERSION) ) {
    console.error(`${MODULE_ID} | public registry schemaVersion ${raw.schemaVersion} unsupported; write refused (${context})`);
    return false;
  }
  const reg = foundry.utils.deepClone(readPublicRegistry());
  if ( !mutate(reg) ) return false;
  const next = { schemaVersion: SCHEMA_VERSION, perception: reg.perception, spellcasting: reg.spellcasting };
  try {
    assertNoSecrets(next, context);
  } catch (err) {
    console.error(err);
    return false;
  }
  try {
    await game.settings.set(MODULE_ID, SETTINGS.publicRegistry, next);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | failed to persist public registry (${context})`, err);
    return false;
  }
}

/* ---------- private store (active-GM only, world-partitioned, localStorage) ---------- */

/**
 * Read the private-store root (normalized; never null).
 * @returns {{schemaVersion:number, worlds:object}}
 */
export function readPrivateStoreRoot() {
  const raw = game.settings.get(MODULE_ID, SETTINGS.privateStore);
  if ( !raw || (typeof raw !== "object") ) return { schemaVersion: SCHEMA_VERSION, worlds: {} };
  return {
    schemaVersion: SCHEMA_VERSION,
    worlds: (raw.worlds && typeof raw.worlds === "object") ? raw.worlds : {}
  };
}

/**
 * Read the current world's private bucket (normalized; never null). Returns an
 * empty bucket when the world id is unavailable (fail closed for reads).
 * @returns {{perception:object, spellcasting:object}}
 */
export function readPrivateWorldBucket() {
  const worldId = getCurrentWorldIdOrNull();
  const empty = { perception: {}, spellcasting: {} };
  if ( !worldId ) return empty;
  const bucket = readPrivateStoreRoot().worlds[worldId];
  if ( !bucket || (typeof bucket !== "object") ) return empty;
  return {
    perception: (bucket.perception && typeof bucket.perception === "object") ? bucket.perception : {},
    spellcasting: (bucket.spellcasting && typeof bucket.spellcasting === "object") ? bucket.spellcasting : {}
  };
}

/**
 * Apply a mutation to a CLONE of the current world's private bucket and persist
 * the whole root (preserving every OTHER world's data exactly). Active-GM-only.
 * Fails closed if there is no world id. CLIENT scope, so secrets never leave
 * this browser.
 * @param {(bucket:{perception:object, spellcasting:object}) => boolean} mutate  Return true if changed.
 * @param {string} [context]
 * @returns {Promise<boolean>}
 */
export async function writePrivateWorldBucket(mutate, context = "privateStore") {
  if ( !ensureActiveGMClient(context) ) return false;
  const worldId = getCurrentWorldIdOrNull();
  if ( !worldId ) {
    console.error(`${MODULE_ID} | private write refused: no world id (${context})`);
    return false;
  }
  const root = foundry.utils.deepClone(readPrivateStoreRoot());
  const bucket = (root.worlds[worldId] && typeof root.worlds[worldId] === "object")
    ? root.worlds[worldId] : { perception: {}, spellcasting: {} };
  bucket.perception ??= {};
  bucket.spellcasting ??= {};
  if ( !mutate(bucket) ) return false;
  root.worlds[worldId] = bucket;
  try {
    await game.settings.set(MODULE_ID, SETTINGS.privateStore, root);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | failed to persist private store (${context})`, err);
    return false;
  }
}

/* ---------- perception public CRUD (0.2.0) ---------- */

/**
 * Registry key for a placed token.
 * @param {string} sceneId
 * @param {string} tokenId
 * @returns {string|null}
 */
export function perceptionKey(sceneId, tokenId) {
  if ( !sceneId || !tokenId ) return null;
  return `${sceneId}:${tokenId}`;
}

/**
 * Read a perception gate entry (or null).
 * @param {string} sceneId
 * @param {string} tokenId
 * @returns {object|null}
 */
export function getPerceptionGate(sceneId, tokenId) {
  const key = perceptionKey(sceneId, tokenId);
  if ( !key ) return null;
  return readPublicRegistry().perception[key] ?? null;
}

/**
 * Create/replace a perception gate marking a token undetected. Records the
 * token's PRIOR native hidden value and that the module owns the hide (Lyra
 * F-6) so a later clear can restore correctly. Does NOT write the TokenDocument
 * — the caller performs the native hidden write. `combatantHides` lists the
 * Combatant ids the caller hid in the combat tracker (safe ids only, never a
 * secret) so clear/reveal restore exactly those rows (F1: an undetected
 * creature in combat must not leak via the tracker).
 * @param {string} sceneId
 * @param {string} tokenId
 * @param {{priorHidden?:boolean, hiddenByModule?:boolean, combatantHides?:string[]}} [opts]
 * @returns {Promise<boolean>}
 */
export async function markUndetected(sceneId, tokenId, { priorHidden = false, hiddenByModule = true, combatantHides = [] } = {}) {
  const key = perceptionKey(sceneId, tokenId);
  if ( !key ) return false;
  const hides = Array.isArray(combatantHides) ? combatantHides.filter(id => typeof id === "string") : [];
  return updatePublicRegistry(reg => {
    const prev = reg.perception[key];
    reg.perception[key] = {
      state: "undetected",
      spottedBy: (prev && typeof prev.spottedBy === "object") ? prev.spottedBy : {},
      priorHidden: !!priorHidden,
      hiddenByModule: !!hiddenByModule,
      combatantHides: hides
    };
    return true;
  }, "markUndetected");
}

/**
 * Record that a user (the person at the screen) has personally spotted the
 * token. Render allowlist is keyed by userId; safe actor attribution is stored
 * alongside for the GM panel (Lyra F-7). Player-safe only.
 * @param {string} sceneId
 * @param {string} tokenId
 * @param {string} userId
 * @param {{actorId?:string, actorName?:string, round?:number, source?:string}} [attribution]
 * @returns {Promise<boolean>}
 */
export async function markSpotted(sceneId, tokenId, userId, attribution = {}) {
  const key = perceptionKey(sceneId, tokenId);
  if ( !key || !userId ) return false;
  return updatePublicRegistry(reg => {
    const entry = reg.perception[key];
    if ( !entry ) return false;
    entry.spottedBy ??= {};
    entry.spottedBy[userId] = {
      actorId: attribution.actorId ?? null,
      actorName: attribution.actorName ?? null,
      round: Number.isFinite(attribution.round) ? attribution.round : null,
      source: (attribution.source === "perception") ? "perception" : "manual"
    };
    return true;
  }, "markSpotted");
}

/**
 * Remove a user from a gate's spottedBy map (the GM un-spots them).
 * @param {string} sceneId
 * @param {string} tokenId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function unmarkSpotted(sceneId, tokenId, userId) {
  const key = perceptionKey(sceneId, tokenId);
  if ( !key || !userId ) return false;
  return updatePublicRegistry(reg => {
    const entry = reg.perception[key];
    if ( !entry || !entry.spottedBy || !(userId in entry.spottedBy) ) return false;
    delete entry.spottedBy[userId];
    return true;
  }, "unmarkSpotted");
}

/**
 * Globally reveal a gate (every player sees the token). Leaves the entry so the
 * caller can restore the native hidden flag to priorHidden.
 * @param {string} sceneId
 * @param {string} tokenId
 * @returns {Promise<boolean>}
 */
export async function setGlobalReveal(sceneId, tokenId) {
  const key = perceptionKey(sceneId, tokenId);
  if ( !key ) return false;
  return updatePublicRegistry(reg => {
    const entry = reg.perception[key];
    if ( !entry || (entry.state === "globallyRevealed") ) return false;
    entry.state = "globallyRevealed";
    return true;
  }, "setGlobalReveal");
}

/**
 * Remove a perception gate entirely (the caller restores native hidden state).
 * @param {string} sceneId
 * @param {string} tokenId
 * @returns {Promise<boolean>}
 */
export async function clearPerceptionGate(sceneId, tokenId) {
  const key = perceptionKey(sceneId, tokenId);
  if ( !key ) return false;
  return updatePublicRegistry(reg => {
    if ( !(key in reg.perception) ) return false;
    delete reg.perception[key];
    return true;
  }, "clearPerceptionGate");
}

/* ---------- perception private DC (GM secret) ---------- */

/**
 * Store/clear a hidden Perception DC for a token (active-GM client only;
 * localStorage; never replicated). Pass null to clear. Returns false on an
 * invalid (non-finite, non-null) dc.
 * @param {string} sceneId
 * @param {string} tokenId
 * @param {number|null} dc
 * @returns {Promise<boolean>}
 */
export async function setHiddenPerceptionDC(sceneId, tokenId, dc) {
  const key = perceptionKey(sceneId, tokenId);
  if ( !key ) return false;
  const clean = (dc === null || dc === "" || dc === undefined) ? null
    : (Number.isFinite(Number(dc)) ? Number(dc) : undefined);
  if ( clean === undefined ) return false;
  return writePrivateWorldBucket(bucket => {
    if ( clean === null ) {
      if ( !(key in bucket.perception) ) return false;
      delete bucket.perception[key];
      return true;
    }
    bucket.perception[key] = { dc: clean };
    return true;
  }, "setHiddenPerceptionDC");
}

/**
 * Read the hidden Perception DC for a token. Active-GM client ONLY: this helper
 * enforces the gate itself (Lyra 0.2.0 audit #1) rather than trusting callers,
 * so a non-active-GM client always gets null. The read fails closed and now
 * matches the strictness of setHiddenPerceptionDC's writer. Returns null when
 * refused, absent, or unavailable.
 * @param {string} sceneId
 * @param {string} tokenId
 * @returns {number|null}
 */
export function getHiddenPerceptionDC(sceneId, tokenId) {
  if ( !isActiveGMClient() ) return null;
  const key = perceptionKey(sceneId, tokenId);
  if ( !key ) return null;
  const rec = readPrivateWorldBucket().perception[key];
  return (rec && Number.isFinite(rec.dc)) ? rec.dc : null;
}

/* ---------- spellcasting public CRUD (0.5.0) ---------- */

/**
 * Read a spell gate entry (or null). Keyed by a synthesized castId.
 * @param {string} castId
 * @returns {object|null}
 */
export function getSpellGate(castId) {
  if ( !castId ) return null;
  return readPublicRegistry().spellcasting[castId] ?? null;
}

/**
 * Create a masked spell gate: the player-visible card was suppressed and
 * replaced with a generic notice. Stores ONLY safe state — never the spell
 * name/school/uuid (those live in the active-GM private store). publicLabel is
 * the generic player-facing string.
 * @param {string} castId
 * @param {{publicLabel?:string}} [opts]
 * @returns {Promise<boolean>}
 */
export async function markMasked(castId, { publicLabel = "A spell is being cast." } = {}) {
  if ( !castId ) return false;
  return updatePublicRegistry(reg => {
    const prev = reg.spellcasting[castId];
    reg.spellcasting[castId] = {
      state: "masked",
      identifiedBy: (prev && typeof prev.identifiedBy === "object") ? prev.identifiedBy : {},
      publicLabel: String(publicLabel)
    };
    return true;
  }, "markMasked");
}

/**
 * Record that a user has personally identified the masked spell (safe actor
 * attribution only; the spell name is delivered to them out-of-band, not here).
 * @param {string} castId
 * @param {string} userId
 * @param {{actorId?:string, actorName?:string, round?:number, source?:string}} [attribution]
 * @returns {Promise<boolean>}
 */
export async function markIdentified(castId, userId, attribution = {}) {
  if ( !castId || !userId ) return false;
  return updatePublicRegistry(reg => {
    const entry = reg.spellcasting[castId];
    if ( !entry ) return false;
    entry.identifiedBy ??= {};
    entry.identifiedBy[userId] = {
      actorId: attribution.actorId ?? null,
      actorName: attribution.actorName ?? null,
      round: Number.isFinite(attribution.round) ? attribution.round : null,
      source: (attribution.source === "spellcraft") ? "spellcraft" : "manual"
    };
    return true;
  }, "markIdentified");
}

/**
 * Globally reveal a masked spell (every player may now learn its identity).
 * @param {string} castId
 * @returns {Promise<boolean>}
 */
export async function setSpellGlobalReveal(castId) {
  if ( !castId ) return false;
  return updatePublicRegistry(reg => {
    const entry = reg.spellcasting[castId];
    if ( !entry || (entry.state === "globallyRevealed") ) return false;
    entry.state = "globallyRevealed";
    return true;
  }, "setSpellGlobalReveal");
}

/**
 * Remove a spell gate from the public registry entirely.
 * @param {string} castId
 * @returns {Promise<boolean>}
 */
export async function clearSpellGate(castId) {
  if ( !castId ) return false;
  return updatePublicRegistry(reg => {
    if ( !(castId in reg.spellcasting) ) return false;
    delete reg.spellcasting[castId];
    return true;
  }, "clearSpellGate");
}

/* ---------- spell identity (GM secret: name/school/uuid/DC) ---------- */

/**
 * Store the true spell identity + derived Spellcraft DC for a masked cast on
 * the active-GM client only (localStorage; never replicated). All of these are
 * forbidden on any public surface (assertNoSecrets / FORBIDDEN_PUBLIC_KEYS).
 * @param {string} castId
 * @param {{spellName:string, school?:string, spellItemUuid?:string,
 *          casterActorUuid?:string, spellLevel?:number, dc?:number}} identity
 * @returns {Promise<boolean>}
 */
export async function setHiddenSpellIdentity(castId, identity = {}) {
  if ( !castId || !identity || typeof identity !== "object" ) return false;
  return writePrivateWorldBucket(bucket => {
    bucket.spellcasting[castId] = {
      spellName: identity.spellName ?? null,
      school: identity.school ?? null,
      spellItemUuid: identity.spellItemUuid ?? null,
      casterActorUuid: identity.casterActorUuid ?? null,
      spellLevel: Number.isFinite(identity.spellLevel) ? identity.spellLevel : null,
      dc: Number.isFinite(identity.dc) ? identity.dc : null
    };
    return true;
  }, "setHiddenSpellIdentity");
}

/**
 * Read the true spell identity for a masked cast. Active-GM client ONLY (fails
 * closed to null on any other client), mirroring getHiddenPerceptionDC.
 * @param {string} castId
 * @returns {object|null}
 */
export function getHiddenSpellIdentity(castId) {
  if ( !isActiveGMClient() || !castId ) return null;
  const rec = readPrivateWorldBucket().spellcasting[castId];
  return (rec && typeof rec === "object") ? rec : null;
}

/**
 * Read the hidden Spellcraft DC for a masked cast (active-GM only; null else).
 * @param {string} castId
 * @returns {number|null}
 */
export function getHiddenSpellcraftDC(castId) {
  const rec = getHiddenSpellIdentity(castId);
  return (rec && Number.isFinite(rec.dc)) ? rec.dc : null;
}

/**
 * Override the hidden Spellcraft DC for an existing masked cast (active-GM
 * only). Returns false if there is no stored identity or the dc is invalid.
 * @param {string} castId
 * @param {number} dc
 * @returns {Promise<boolean>}
 */
export async function setHiddenSpellcraftDC(castId, dc) {
  if ( !castId || !Number.isFinite(Number(dc)) ) return false;
  return writePrivateWorldBucket(bucket => {
    const rec = bucket.spellcasting[castId];
    if ( !rec || typeof rec !== "object" ) return false;
    rec.dc = Number(dc);
    return true;
  }, "setHiddenSpellcraftDC");
}

/**
 * Remove a masked cast's hidden identity from the active-GM private store.
 * @param {string} castId
 * @returns {Promise<boolean>}
 */
export async function clearHiddenSpellIdentity(castId) {
  if ( !castId ) return false;
  return writePrivateWorldBucket(bucket => {
    if ( !(castId in bucket.spellcasting) ) return false;
    delete bucket.spellcasting[castId];
    return true;
  }, "clearHiddenSpellIdentity");
}

/* ---------- status api ---------- */

export function initializeStateApi() {
  globalThis.pf15DiscoveryVeil = {
    moduleId: MODULE_ID,
    version: "0.7.3",
    status: "perception-gate+requests+spell-identification+discovery-panel+stripped-effects",
    // Read-only console helpers (no secrets): for manual checks.
    _state: { readPublicRegistry, getPerceptionGate, getSpellGate, isActiveGMClient, getCurrentWorldIdOrNull }
  };
}
