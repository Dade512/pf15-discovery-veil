/**
 * pf15-discovery-veil — combat side of the perception gate (0.7.8, TD-45).
 *
 *  - createCombatant: a combatant created after the mark is recorded in the
 *    gate (and hidden if it somehow isn't), so Reveal/Clear restore its row.
 *  - preCreateChatMessage: an undetected creature's initiative card becomes
 *    GM-only. Players see "<GM> privately rolled some dice"; the document still
 *    holds the roll (presentation-layer posture, like identity-mask).
 */

import { MODULE_ID } from "./module-constants.mjs";
import { getPerceptionGate, isActiveGMClient, addCombatantHide } from "./state.mjs";
import { combatantHidePlan, shouldPrivatizeInitiative } from "./gate-rules.mjs";

/**
 * createCombatant handler. Fires on every client; only the active GM writes.
 * Records before hiding, so a failed hide never leaves an unrecorded hidden row.
 * @param {object} combatant
 * @returns {Promise<void>}
 */
export async function onCreateCombatant(combatant) {
  try {
    if ( !isActiveGMClient() ) return;
    const gate = getPerceptionGate(combatant?.sceneId, combatant?.tokenId);
    const plan = combatantHidePlan({ gate, combatantHidden: combatant?.hidden === true });
    if ( plan.record ) await addCombatantHide(combatant.sceneId, combatant.tokenId, combatant.id);
    if ( plan.hide ) await combatant.update({ hidden: true });
  } catch ( err ) {
    console.error(`${MODULE_ID} | onCreateCombatant error`, err);
  }
}

/**
 * preCreateChatMessage handler. Runs on the creating client; only a GM client
 * rewrites. Never returns false (the card is kept, only its audience changes).
 * @param {object} message  the pending ChatMessage document
 */
export function onPreCreateChatMessage(message) {
  try {
    if ( !game.user?.isGM ) return;
    const isInitiative = message?.flags?.core?.initiativeRoll === true;
    if ( !isInitiative ) return;
    const gate = getPerceptionGate(message?.speaker?.scene, message?.speaker?.token);
    const whisperCount = Array.isArray(message?.whisper) ? message.whisper.length : (message?.whisper?.size ?? 0);
    if ( !shouldPrivatizeInitiative({ isInitiative, gateState: gate?.state ?? null, whisperCount }) ) return;
    const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
    message.updateSource({ whisper: gmIds, blind: false });
  } catch ( err ) {
    console.error(`${MODULE_ID} | onPreCreateChatMessage error`, err);
  }
}
