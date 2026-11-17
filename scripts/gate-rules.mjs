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
