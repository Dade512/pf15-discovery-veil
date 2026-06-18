/**
 * pf15-discovery-veil — Spellcraft identification requests (0.5.0 flow).
 *
 * Thin configuration over the shared `createSkillBroker` factory
 * (`skill-request.mjs`), mirroring the Perception broker over the same socketlib
 * transport. The shared flow — GM request dialog with a hidden DC, socketlib
 * dispatch to chosen eligible players, per-client roll capture, active-GM
 * adjudication — lives in the factory; only the Spellcraft differences are here.
 *
 * Key difference: Spellcraft is TRAINED-ONLY (`actor.system.skills.spl.rt` is
 * true; confirmed in docs/0.4.0-PROBE.md), so eligibility requires
 * `spl.rank >= 1` in addition to player ownership — unlike untrained-usable
 * Perception. On success the user is marked identified and whispered the spell
 * name + school; the DC and identity never leave the GM and there is no
 * automatic global reveal.
 */

import { SOCKET_TYPES } from "./module-constants.mjs";
import {
  getSpellGate, getHiddenSpellcraftDC, setHiddenSpellcraftDC, markIdentified
} from "./state.mjs";
import { revealSpellToUser } from "./spell-identification.mjs";
import { createSkillBroker } from "./skill-request.mjs";

const broker = createSkillBroker({
  skillKey: "spl",
  label: "spellcraft",
  icon: "fa-solid fa-wand-magic-sparkles",
  trained: true,                        // Spellcraft is trained-only: requires spl.rank >= 1.
  source: "spellcraft",
  socketMissingMsg: "socketlib is required for Spellcraft requests but was not found.",
  socketTypes: { request: SOCKET_TYPES.spellcraftRequest, result: SOCKET_TYPES.spellcraftResult },

  gate: {
    get: (t) => getSpellGate(t),        // t is castId
    activeState: "masked"
  },
  dc: {
    get: (t) => getHiddenSpellcraftDC(t)
  },
  // Spellcraft stores only a finite DC and never warns (a null/blank DC is left
  // as-is rather than cleared).
  commitDC: async (t, dc) => {
    if ( (dc !== null) && Number.isFinite(dc) ) {
      await setHiddenSpellcraftDC(t, dc);
    }
    return true;
  },

  requestPayload: (t) => ({ castId: t }),
  readTarget: (p) => p.castId,
  targetValid: (t) => !!t,

  onSuccess: async (t, senderId, meta) => {
    await markIdentified(t, senderId, meta);
    await revealSpellToUser(t, senderId);
  },

  i18n: {
    noActiveGate: "PF15DV.Spell.NoActiveMask",
    notActiveGM: "PF15DV.Spell.NotActiveGM",
    noEligible: "PF15DV.Spell.NoEligiblePlayers",
    requestHint: "PF15DV.Spell.RequestHint",
    dcLabel: "PF15DV.Spell.DCLabel",
    requestTitle: "PF15DV.Spell.RequestTitle",
    requestSend: "PF15DV.Spell.RequestSend",
    cancel: "PF15DV.Dialog.Cancel",
    requestSent: "PF15DV.Notify.RequestSent",
    noCharacter: "PF15DV.Spell.NoCharacter",
    rollPromptTitle: "PF15DV.Spell.RollPromptTitle",
    rollPromptBody: "PF15DV.Spell.RollPromptBody",
    resultNoDC: "PF15DV.Spell.ResultNoDC",
    resultSuccess: "PF15DV.Spell.ResultSuccess",
    resultFail: "PF15DV.Spell.ResultFail"
  }
});

/** Register socketlib handlers. Call on the socketlib.ready hook. */
export const registerSpellcraftSocket = broker.registerSocket;

/** Open the GM "Request Spellcraft" dialog for a masked cast (castId). */
export const openSpellcraftRequestDialog = broker.openRequestDialog;

/** The PC a given user will roll Spellcraft for (owned + trained), or null. */
export const spellcraftActorForUser = broker.actorForUser;

/** Non-GM users who own a player-owned PC trained in Spellcraft. */
export const eligibleSpellcraftUsers = broker.eligibleUsers;
