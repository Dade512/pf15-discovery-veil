/**
 * pf15-discovery-veil — Perception roll requests (0.3.0 flow).
 *
 * Thin configuration over the shared `createSkillBroker` factory
 * (`skill-request.mjs`). The flow itself — GM request dialog with a hidden DC,
 * socketlib dispatch to chosen eligible players, per-client roll capture from
 * pf1ActorRollSkill, and active-GM adjudication against the hidden DC — lives in
 * the factory. Only the Perception-specific differences are described here.
 *
 * Eligibility: any non-GM user who owns a player-owned PC (assigned or owned).
 * Perception is untrained-usable, so there is no rank gate (Michael, 0.3.0).
 * On success the user is marked spotted and the canvas re-syncs; the DC NEVER
 * leaves the GM and there is no automatic global reveal.
 */

import { SOCKET_TYPES } from "./module-constants.mjs";
import {
  getPerceptionGate, getHiddenPerceptionDC, setHiddenPerceptionDC, markSpotted
} from "./state.mjs";
import { syncPerceptionTokens } from "./rendering.mjs";
import { createSkillBroker } from "./skill-request.mjs";

const broker = createSkillBroker({
  skillKey: "per",
  label: "perception",
  icon: "fa-solid fa-eye",
  trained: false,                       // Perception is untrained-usable: ownership only.
  source: "perception",
  socketMissingMsg: "socketlib is required for Perception roll requests but was not found. Enable the socketlib module.",
  socketTypes: { request: SOCKET_TYPES.perceptionRequest, result: SOCKET_TYPES.perceptionResult },

  gate: {
    get: (t) => getPerceptionGate(t.sceneId, t.tokenId),
    activeState: "undetected"
  },
  dc: {
    get: (t) => getHiddenPerceptionDC(t.sceneId, t.tokenId)
  },
  // Perception validates the DC and always re-stores it (even null, to clear),
  // warning on a bad value (abort) or a failed store (continue).
  commitDC: async (t, dc) => {
    if ( (dc !== null) && !Number.isFinite(dc) ) {
      ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.BadDC"));
      return false;
    }
    const stored = await setHiddenPerceptionDC(t.sceneId, t.tokenId, dc);
    if ( (dc !== null) && !stored ) {
      ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.DCStoreFailed"));
    }
    return true;
  },

  requestPayload: (t) => ({ sceneId: t.sceneId, tokenId: t.tokenId }),
  readTarget: (p) => ({ sceneId: p.sceneId, tokenId: p.tokenId }),
  targetValid: (t) => !!t.sceneId && !!t.tokenId,

  onSuccess: async (t, senderId, meta) => {
    await markSpotted(t.sceneId, t.tokenId, senderId, meta);
    syncPerceptionTokens();
  },

  i18n: {
    noActiveGate: "PF15DV.Notify.NoActiveGate",
    notActiveGM: "PF15DV.Notify.NotActiveGM",
    noEligible: "PF15DV.Notify.NoEligiblePlayers",
    requestHint: "PF15DV.Dialog.RequestHint",
    dcLabel: "PF15DV.Dialog.DCLabel",
    requestTitle: "PF15DV.Dialog.RequestTitle",
    requestSend: "PF15DV.Dialog.RequestSend",
    cancel: "PF15DV.Dialog.Cancel",
    requestSent: "PF15DV.Notify.RequestSent",
    noCharacter: "PF15DV.Notify.NoCharacter",
    rollPromptTitle: "PF15DV.Dialog.RollPromptTitle",
    rollPromptBody: "PF15DV.Dialog.RollPromptBody",
    resultNoDC: "PF15DV.Notify.ResultNoDC",
    resultSuccess: "PF15DV.Notify.ResultSuccess",
    resultFail: "PF15DV.Notify.ResultFail"
  }
});

/** Register socketlib handlers. Call on the socketlib.ready hook. */
export const registerPerceptionSocket = broker.registerSocket;

/** Open the GM "Request Perception" dialog for an undetected token ref {sceneId,tokenId}. */
export const openPerceptionRequestDialog = broker.openRequestDialog;

/** The PC a given user will roll Perception for (ownership-based), or null. */
export const perceptionActorForUser = broker.actorForUser;

/** Non-GM users who own a player-owned PC to roll Perception. */
export const eligiblePerceptionUsers = broker.eligibleUsers;
