/**
 * Canvas render layer for pf15-discovery-veil (0.2.0 Perception Gate).
 *
 * Base hide is Foundry's native TokenDocument.hidden (set by the HUD action),
 * which robustly hides the token from all players while the GM still sees it.
 * For players who have personally SPOTTED an undetected token, this layer
 * forces it visible per-client by setting the same public properties core
 * assigns (token.visible / token.mesh.visible). Because a visibility refresh
 * recomputes visible = isVisible (false for a hidden token), the override is
 * reapplied on every refreshToken with the refreshVisibility flag — the same
 * hook-reapply pattern identity-mask uses (0.1.1 spike confirmed). No document
 * is mutated here.
 */

import { MODULE_ID } from "./module-constants.mjs";
import { getPerceptionGate } from "./state.mjs";

/**
 * Resolve a token placeable to its {sceneId, tokenId}, or null.
 * @param {object} token
 * @returns {{sceneId:string, tokenId:string}|null}
 */
function refForToken(token) {
  const sceneId = token?.document?.parent?.id;
  const tokenId = token?.document?.id;
  if ( !sceneId || !tokenId ) return null;
  return { sceneId, tokenId };
}

/**
 * True when THIS non-GM client should force the (natively hidden) token visible
 * because the current user has personally spotted it. The GM never overrides
 * (it sees hidden tokens natively).
 * @param {object} token
 * @returns {boolean}
 */
function shouldShowToUser(token) {
  if ( game.user.isGM ) return false;
  const ref = refForToken(token);
  if ( !ref ) return false;
  let gate = null;
  try { gate = getPerceptionGate(ref.sceneId, ref.tokenId); }
  catch(err) { console.error(`${MODULE_ID} | failed to resolve perception gate`, err); return false; }
  if ( !gate || (gate.state !== "undetected") ) return false;
  return !!(gate.spottedBy && gate.spottedBy[game.user.id]);
}

/**
 * Reapply the per-user show override (public properties only).
 * @param {object} token
 */
function applyShowOverride(token) {
  try {
    if ( !shouldShowToUser(token) ) return;
    token.visible = true;
    if ( token.mesh ) token.mesh.visible = true;
  }
  catch(err) { console.error(`${MODULE_ID} | perception show-override failed`, err); }
}

/**
 * drawToken: apply at first paint.
 * @param {object} token
 */
export function onDrawToken(token) { applyShowOverride(token); }

/**
 * refreshToken: reapply after a visibility recompute stomps it.
 * @param {object} token
 * @param {object} flags
 */
export function onRefreshToken(token, flags) {
  if ( flags && !flags.refreshVisibility ) return;
  applyShowOverride(token);
}

/**
 * Re-evaluate every placeable's visibility after a registry change: setting
 * refreshVisibility recomputes the base (native hidden) state, then the
 * refreshToken handler above reapplies each user's show override.
 */
export function syncPerceptionTokens() {
  try {
    for ( const t of canvas?.tokens?.placeables ?? [] ) t.renderFlags.set({ refreshVisibility: true });
  }
  catch(err) { console.error(`${MODULE_ID} | syncPerceptionTokens failed`, err); }
}
