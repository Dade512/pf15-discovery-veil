/**
 * pf15-discovery-veil — pure gate rules (0.7.8).
 *
 * Decision functions with no Foundry globals, so node --test can check them
 * directly. Callers read the documents and do the writes.
 */

/**
 * What to do with a combatant created for a token (0.7.8, TD-45 a/d).
 * Core copies token.hidden onto a new combatant, so a combatant created after
 * the mark is usually hidden already but was never recorded in the gate, and
 * Reveal/Clear then left its tracker row hidden.
 *  - no gate, or the gate is no longer "undetected": leave it alone
 *  - row visible (a non-core path): hide it and record it
 *  - row hidden and the module owns the token hide: record it
 *  - row hidden and the GM hid the token before the mark: leave it, because
 *    Reveal keeps that token hidden and its row should stay hidden too
 * @param {{gate: object|null, combatantHidden: boolean}} args
 * @returns {{hide: boolean, record: boolean}}
 */
export function combatantHidePlan({ gate, combatantHidden }) {
  if ( !gate || (gate.state !== "undetected") ) return { hide: false, record: false };
  if ( !combatantHidden ) return { hide: true, record: true };
  if ( gate.priorHidden ) return { hide: false, record: false };
  return { hide: false, record: true };
}

/**
 * Whether an initiative card must be made GM-only (0.7.8, TD-45 c). pf1's
 * initiative dialog sets messageOptions.rollMode, which defeats pf1's own
 * hidden → private rule, so an undetected creature's card posted publicly
 * under its true name.
 * @param {{isInitiative: boolean, gateState: string|null, whisperCount: number}} args
 * @returns {boolean}
 */
export function shouldPrivatizeInitiative({ isInitiative, gateState, whisperCount }) {
  return !!isInitiative && (gateState === "undetected") && (whisperCount === 0);
}

/** Values of the spellMaskScope world setting (0.7.8, TD-46). */
export const SPELL_MASK_SCOPES = ["hostile", "hostileNeutral", "allNonPlayer"];

/**
 * Whether a cast should be masked (0.7.8, TD-46). Ownership is the floor: a
 * player-owned caster is never masked. An unknown disposition stays masked
 * (fail secret). SECRET (-2) counts as hostile. An unknown scope string is
 * treated as the default, "hostile".
 * @param {{hasPlayerOwner: boolean, disposition: number|null, scope: string}} args
 * @returns {boolean}
 */
export function isMaskableCaster({ hasPlayerOwner, disposition, scope }) {
  if ( hasPlayerOwner ) return false;
  if ( scope === "allNonPlayer" ) return true;
  if ( !Number.isFinite(disposition) ) return true;
  if ( scope === "hostileNeutral" ) return disposition <= 0;
  return disposition <= -1;
}

/**
 * The caster's token disposition, or null. Tries the action's token, the
 * actor's synthetic token, the actor's first active token on the viewed scene,
 * then the prototype token. A placeable or a document is accepted.
 * Confirmed (0.7.8 R2): pf1 11.11 actionUse.token is the placeable; its .document is read.
 * @param {object|null} actionUse
 * @param {object|null} actor
 * @returns {number|null}
 */
export function casterDisposition(actionUse, actor) {
  let active = null;
  try { active = actor?.getActiveTokens?.(false, true)?.[0] ?? null; }
  catch ( _ ) { active = null; }
  for ( const candidate of [actionUse?.token, actor?.token, active, actor?.prototypeToken] ) {
    const doc = candidate?.document ?? candidate;
    const d = doc?.disposition;
    if ( Number.isFinite(d) ) return d;
  }
  return null;
}

/** Roll modes that already keep a roll off players' screens. */
const PRIVATE_ROLL_MODES = ["gmroll", "blindroll", "selfroll"];

/**
 * The roll mode a masked cast uses (0.7.9, TD-47 D-3). pf1 plays a cast's
 * Dice So Nice dice with the cast's roll mode before pf1PreDisplayActionUse,
 * so a public mode shows every player the dice of a spell whose card we hide.
 * A mode the GM already made private is kept, never widened.
 * @param {string|undefined} current
 * @returns {string}
 */
export function maskedRollMode(current) {
  return PRIVATE_ROLL_MODES.includes(current) ? current : "gmroll";
}

/**
 * Whether pf1 will post a chat card for this cast: pf1 11.11's own check in
 * ActionUse#postMessage (action-use.mjs:1472), which runs AFTER
 * pf1PreDisplayActionUse. A cast with no card is not masked (0.7.9 D-4).
 * @param {object|undefined} shared  pf1 ActionUse#shared
 * @returns {boolean}
 */
export function castPostsCard(shared) {
  return !!shared?.chatMessage && !shared?.scriptData?.hideChat;
}
