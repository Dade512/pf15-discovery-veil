/**
 * pf15-discovery-veil — 0.3.0 Perception roll requests + active-GM broker.
 *
 * Flow (docs/PLAN.md §C/§D, grounded in docs/0.3.0-PROBE.md):
 *  1. GM opens "Request Perception" on an undetected token: sets a hidden DC
 *     (active-GM localStorage ONLY) and picks which eligible players to ask.
 *  2. A socket request goes to those players; each gets a "Roll Perception" prompt.
 *  3. The player rolls; this module captures the total from pf1ActorRollSkill
 *     (chatMessage.rolls[0].total — confirmed live) on the PLAYER's client and
 *     relays only {ids + total} to the active GM via socket.
 *  4. The active GM compares the total to the hidden DC (getHiddenPerceptionDC,
 *     active-GM gated) and, on success, marks the user spotted. The DC NEVER
 *     leaves the GM; there is no automatic global reveal.
 *
 * Eligibility: any non-GM user with an assigned, player-owned character.
 * Perception is untrained-usable, so there is no rank gate (Michael, 0.3.0).
 *
 * Single-GM assumption: the GM who sets the DC is game.users.activeGM (the same
 * client that brokers results). Multi-GM tables fall back to manual adjudication
 * (no DC found on the active GM → "Manage Spotted").
 */

import { MODULE_ID, SOCKET, SOCKET_TYPES, CSS } from "./module-constants.mjs";
import {
  getPerceptionGate, getHiddenPerceptionDC, setHiddenPerceptionDC,
  markSpotted, isActiveGMClient
} from "./state.mjs";
import { syncPerceptionTokens } from "./rendering.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

/* ---------- socket plumbing ---------- */

/** Register the module socket dispatcher. Call once on ready. */
export function registerPerceptionSocket() {
  game.socket.on(SOCKET, onSocketMessage);
}

function emit(payload) {
  game.socket.emit(SOCKET, payload);
}

function onSocketMessage(data) {
  try {
    if ( !data || (typeof data !== "object") ) return;
    if ( data.type === SOCKET_TYPES.perceptionRequest ) { handlePerceptionRequest(data); return; }
    if ( data.type === SOCKET_TYPES.perceptionResult ) { handlePerceptionResult(data); return; }
  } catch (err) {
    console.error(`${MODULE_ID} | socket handler error`, err);
  }
}

/* ---------- eligibility ---------- */

/**
 * Non-GM users with an assigned, player-owned character. No rank gate
 * (Perception is untrained-usable).
 * @returns {Array} eligible User documents
 */
export function eligiblePerceptionUsers() {
  return game.users.filter(u => !u.isGM && u.character && u.character.hasPlayerOwner);
}

/* ---------- GM: request dialog ---------- */

/**
 * Open the GM "Request Perception" dialog for an undetected token: set the
 * hidden DC (active-GM only) and dispatch a roll request to chosen players.
 * @param {{sceneId:string, tokenId:string}} ref
 */
export async function openPerceptionRequestDialog(ref) {
  if ( !game.user.isGM ) return;
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
        const cb = el.querySelector(`input[name="${CSS.escape(u.id)}"]`);
        if ( cb?.parentElement ) cb.parentElement.append(document.createTextNode(" " + u.name));
      }
    }
  });

  if ( !result || (typeof result !== "object") ) return;
  if ( (result.dc !== null) && !Number.isFinite(result.dc) ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.BadDC"));
    return;
  }
  // Store the hidden DC (active-GM, localStorage). Null clears it (manual mode).
  const stored = await setHiddenPerceptionDC(ref.sceneId, ref.tokenId, result.dc);
  if ( (result.dc !== null) && !stored ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.DCStoreFailed"));
  }
  if ( !result.userIds.length ) return;
  emit({
    type: SOCKET_TYPES.perceptionRequest,
    sceneId: ref.sceneId,
    tokenId: ref.tokenId,
    userIds: result.userIds
  });
  ui.notifications?.info(game.i18n.format("PF15DV.Notify.RequestSent", { count: result.userIds.length }));
}

/* ---------- player: receive request, prompt, roll, relay ---------- */

async function handlePerceptionRequest(data) {
  if ( !Array.isArray(data.userIds) || !data.userIds.includes(game.user.id) ) return;
  const actor = game.user.character;
  if ( !actor ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Notify.NoCharacter"));
    return;
  }
  const proceed = await DialogV2.confirm({
    window: { title: "PF15DV.Dialog.RollPromptTitle", icon: "fa-solid fa-eye" },
    content: `<p>${game.i18n.localize("PF15DV.Dialog.RollPromptBody")}</p>`,
    rejectClose: false
  });
  if ( !proceed ) return;
  await rollAndRelay(actor, data.sceneId, data.tokenId);
}

/**
 * Roll Perception for `actor` on this client, capture the total from the
 * pf1ActorRollSkill payload, and relay only ids + total to the active GM.
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
    if ( !Number.isFinite(total) ) return;
    emit({
      type: SOCKET_TYPES.perceptionResult,
      sceneId, tokenId,
      userId: game.user.id,
      actorId: actor.id,
      actorName: actor.name,
      total
    });
  };
  // Await the roll (this blocks through the PF1 roll dialog, however long the
  // player takes); the hook fires within it. A short grace covers any async gap
  // before the chat message lands. The finally always detaches the listener so
  // it can never match a later, unrelated Perception roll.
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

/* ---------- active GM: adjudicate ---------- */

async function handlePerceptionResult(data) {
  if ( !isActiveGMClient() ) return;
  const { sceneId, tokenId, userId, actorId, actorName, total } = data ?? {};
  if ( !sceneId || !tokenId || !userId || !Number.isFinite(total) ) return;
  const gate = getPerceptionGate(sceneId, tokenId);
  if ( !gate || (gate.state !== "undetected") ) return;
  const name = actorName ?? "?";
  const dc = getHiddenPerceptionDC(sceneId, tokenId);
  if ( dc === null ) {
    // No DC set for this gate — leave it to the GM (Manage Spotted).
    ui.notifications?.info(game.i18n.format("PF15DV.Notify.ResultNoDC", { actor: name, total }));
    return;
  }
  if ( total >= dc ) {
    const round = game.combat?.round ?? null;
    await markSpotted(sceneId, tokenId, userId, { actorId, actorName, round, source: "perception" });
    syncPerceptionTokens();
    ui.notifications?.info(game.i18n.format("PF15DV.Notify.ResultSuccess", { actor: name, total }));
  } else {
    // GM-only feedback. The DC stays on the GM screen and never reaches players.
    ui.notifications?.info(game.i18n.format("PF15DV.Notify.ResultFail", { actor: name, total }));
  }
}
