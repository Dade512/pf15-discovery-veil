/**
 * pf15-discovery-veil — 0.3.0 Perception roll requests + active-GM broker.
 *
 * Cross-client transport uses socketlib (a required dependency). Raw
 * game.socket module messages were not being delivered between clients in the
 * target deployment; socketlib's executeForUsers / executeAsGM handle that
 * reliably.
 *
 * Flow:
 *  1. GM opens "Request Perception" on an undetected token: sets a hidden DC
 *     (active-GM localStorage ONLY) and picks which eligible players to ask.
 *  2. socketlib runs the request handler on those players; each gets a
 *     "Roll Perception" prompt.
 *  3. The player rolls; this module captures the total from pf1ActorRollSkill
 *     (chatMessage.rolls[0].total) on the PLAYER's client and relays {ids+total}
 *     to the GM via socketlib executeAsGM.
 *  4. The GM compares the total to the hidden DC (getHiddenPerceptionDC,
 *     active-GM gated) and, on success, marks the user spotted. The DC NEVER
 *     leaves the GM; there is no automatic global reveal.
 *
 * Eligibility: any non-GM user who owns a player-owned PC (assigned or owned).
 * Perception is untrained-usable, so there is no rank gate (Michael, 0.3.0).
 */

import { MODULE_ID, SETTINGS, SOCKET_TYPES } from "./module-constants.mjs";
import {
  getPerceptionGate, getHiddenPerceptionDC, setHiddenPerceptionDC,
  markSpotted, isActiveGMClient
} from "./state.mjs";
import { syncPerceptionTokens } from "./rendering.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

/** socketlib module socket (set on the socketlib.ready hook). */
let dvSocket = null;

/** Debug log, gated on the module's debugLogging client setting. */
function dlog(...args) {
  try { if ( game.settings.get(MODULE_ID, SETTINGS.debugLogging) ) console.log(`${MODULE_ID} |`, ...args); }
  catch (_) {}
}

/* ---------- socketlib registration ---------- */

/** Register socketlib handlers. Call on the socketlib.ready hook. */
export function registerPerceptionSocket() {
  if ( (typeof socketlib === "undefined") || !socketlib?.registerModule ) {
    console.error(`${MODULE_ID} | socketlib is required for Perception roll requests but was not found. Enable the socketlib module.`);
    return;
  }
  dvSocket = socketlib.registerModule(MODULE_ID);
  dvSocket.register(SOCKET_TYPES.perceptionRequest, onPerceptionRequest);
  dvSocket.register(SOCKET_TYPES.perceptionResult, onPerceptionResult);
  dlog("socketlib handlers registered");
}

/* ---------- eligibility ---------- */

/**
 * The PC a given user will roll for a Perception request: their assigned
 * character if it is player-owned, else the first player-owned actor they own.
 * Eligibility is by OWNERSHIP, not assignment; Perception is untrained-usable.
 * @param {object} user
 * @returns {object|null}
 */
export function perceptionActorForUser(user) {
  if ( !user || user.isGM ) return null;
  if ( user.character?.hasPlayerOwner ) return user.character;
  return game.actors.find(a => a.hasPlayerOwner && a.testUserPermission(user, "OWNER")) ?? null;
}

/**
 * Non-GM users who own a player-owned PC to roll (assigned OR merely owned).
 * @returns {Array} eligible User documents
 */
export function eligiblePerceptionUsers() {
  return game.users.filter(u => !u.isGM && !!perceptionActorForUser(u));
}

/* ---------- GM: request dialog ---------- */

/**
 * Open the GM "Request Perception" dialog for an undetected token: set the
 * hidden DC (active-GM only) and dispatch a roll request to chosen players.
 * @param {{sceneId:string, tokenId:string}} ref
 */
export async function openPerceptionRequestDialog(ref) {
  if ( !game.user.isGM ) return;
  if ( !dvSocket ) {
    ui.notifications?.error(game.i18n.localize("PF15DV.Notify.NoSocketlib"));
    return;
  }
  const gate = getPerceptionGate(ref.sceneId, ref.tokenId);
  if ( !gate || (gate.state !== "undetected") ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.NoActiveGate"));
    return;
  }
  if ( !isActiveGMClient() ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.NotActiveGM"));
    return;
  }
  const users = eligiblePerceptionUsers();
  if ( !users.length ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.NoEligiblePlayers"));
    return;
  }
  const currentDC = getHiddenPerceptionDC(ref.sceneId, ref.tokenId);
  const dcVal = (currentDC === null) ? "" : currentDC;
  const rows = users.map(u =>
    `<div class="form-group"><label class="checkbox"><input type="checkbox" name="${u.id}" checked></label></div>`
  ).join("");
  const content =
    `<p class="hint">${game.i18n.localize("PF15DV.Dialog.RequestHint")}</p>` +
    `<div class="form-group"><label>${game.i18n.localize("PF15DV.Dialog.DCLabel")}</label>` +
    `<input type="number" name="dc" value="${dcVal}" min="0" step="1"></div><hr>${rows}`;

  const result = await DialogV2.wait({
    window: { title: "PF15DV.Dialog.RequestTitle", icon: "fa-solid fa-eye" },
    classes: ["pf15dv-dialog"],
    position: { width: 440 },
    content,
    buttons: [
      {
        action: "request",
        label: "PF15DV.Dialog.RequestSend",
        icon: "fa-solid fa-paper-plane",
        default: true,
        callback: (event, button) => {
          const form = button.form;
          const dcRaw = form?.elements?.dc?.value;
          const dc = (dcRaw === "" || dcRaw == null) ? null : Number(dcRaw);
          const userIds = users.filter(u => form?.elements?.[u.id]?.checked === true).map(u => u.id);
          return { dc, userIds };
        }
      },
      { action: "cancel", label: "PF15DV.Dialog.Cancel", icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    render: (event, dialog) => {
      const el = dialog.element;
      for ( const u of users ) {
        const cb = el.querySelector(`input[name="${globalThis.CSS.escape(u.id)}"]`);
        const pc = perceptionActorForUser(u);
        if ( cb?.parentElement ) cb.parentElement.append(document.createTextNode(` ${u.name}${pc ? " — " + pc.name : ""}`));
      }
    }
  });

  if ( !result || (typeof result !== "object") ) return;
  if ( (result.dc !== null) && !Number.isFinite(result.dc) ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.BadDC"));
    return;
  }
  const stored = await setHiddenPerceptionDC(ref.sceneId, ref.tokenId, result.dc);
  if ( (result.dc !== null) && !stored ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.DCStoreFailed"));
  }
  if ( !result.userIds.length ) return;
  dlog("executeForUsers perceptionRequest", { userIds: result.userIds, tokenId: ref.tokenId });
  dvSocket.executeForUsers(SOCKET_TYPES.perceptionRequest, result.userIds, { sceneId: ref.sceneId, tokenId: ref.tokenId });
  ui.notifications?.info(game.i18n.format("PF15DV.Notify.RequestSent", { count: result.userIds.length }));
}

/* ---------- player: receive request (via socketlib), prompt, roll, relay ---------- */

async function onPerceptionRequest({ sceneId, tokenId } = {}) {
  // Only honor a request that genuinely came from a GM (socketlib's verified
  // sender, this.socketdata.userId), so a player cannot pop roll prompts on
  // other players' screens.
  if ( !game.users.get(this?.socketdata?.userId)?.isGM ) return;
  dlog("onPerceptionRequest (socketlib)", { sceneId, tokenId, me: game.user?.name });
  const actor = perceptionActorForUser(game.user);
  dlog("resolved actor", actor?.name ?? null);
  if ( !actor ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.NoCharacter"));
    return;
  }
  const proceed = await DialogV2.confirm({
    window: { title: "PF15DV.Dialog.RollPromptTitle", icon: "fa-solid fa-eye" },
    classes: ["pf15dv-dialog"],
    position: { width: 360 },
    content: `<p>${game.i18n.localize("PF15DV.Dialog.RollPromptBody")}</p>`,
    rejectClose: false
  });
  if ( !proceed ) return;
  await rollAndRelay(actor, sceneId, tokenId);
}

/**
 * Roll Perception for `actor` on this client, capture the total from the
 * pf1ActorRollSkill payload, and relay ids + total to the GM via socketlib.
 * @param {object} actor
 * @param {string} sceneId
 * @param {string} tokenId
 */
async function rollAndRelay(actor, sceneId, tokenId) {
  let done = false;
  const handler = (rolledActor, chatMessage, skillId) => {
    if ( done || (skillId !== "per") || (rolledActor?.id !== actor.id) ) return;
    done = true;
    const total = chatMessage?.rolls?.[0]?.total;
    dlog("captured perception roll", { actor: actor.name, total });
    if ( !Number.isFinite(total) ) return;
    dvSocket.executeAsGM(SOCKET_TYPES.perceptionResult, {
      sceneId, tokenId,
      userId: game.user.id,
      actorId: actor.id,
      actorName: actor.name,
      total
    });
  };
  Hooks.on("pf1ActorRollSkill", handler);
  try {
    await actor.rollSkill("per");
    await new Promise(resolve => setTimeout(resolve, 800));
  } catch (err) {
    console.error(`${MODULE_ID} | perception roll failed`, err);
  } finally {
    Hooks.off("pf1ActorRollSkill", handler);
  }
}

/* ---------- GM: adjudicate (via socketlib executeAsGM) ---------- */

async function onPerceptionResult({ sceneId, tokenId, total } = {}) {
  // Trust socketlib's verified sender (this.socketdata.userId), NEVER the
  // payload's claimed userId/actor: the result is honored only for the actual
  // sender, and only if that sender is an eligible roller — so a player cannot
  // forge a result for, or spot a token on behalf of, another user, and the
  // attribution is derived from the verified actor. The roll `total` is still
  // client-reported (Foundry has no server-side dice), so an invited roller
  // could fudge their own number, the same as any roll; they cannot forge for
  // anyone else.
  const sender = game.users.get(this?.socketdata?.userId);
  const actor = sender ? perceptionActorForUser(sender) : null;
  if ( !actor || !sceneId || !tokenId || !Number.isFinite(total) ) return;
  dlog("onPerceptionResult (socketlib)", { sceneId, tokenId, userId: sender.id, total, activeGM: isActiveGMClient() });
  const gate = getPerceptionGate(sceneId, tokenId);
  if ( !gate || (gate.state !== "undetected") ) return;
  const dc = getHiddenPerceptionDC(sceneId, tokenId); // null unless active GM (guard) -> manual fallback
  if ( dc === null ) {
    ui.notifications?.info(game.i18n.format("PF15DV.Notify.ResultNoDC", { actor: actor.name, total }));
    return;
  }
  if ( total >= dc ) {
    const round = game.combat?.round ?? null;
    await markSpotted(sceneId, tokenId, sender.id, { actorId: actor.id, actorName: actor.name, round, source: "perception" });
    syncPerceptionTokens();
    ui.notifications?.info(game.i18n.format("PF15DV.Notify.ResultSuccess", { actor: actor.name, total }));
  } else {
    ui.notifications?.info(game.i18n.format("PF15DV.Notify.ResultFail", { actor: actor.name, total }));
  }
}
