/**
 * pf15-discovery-veil — 0.5.0 Spellcraft identification requests + active-GM broker.
 *
 * Mirrors the proven 0.3.0 Perception broker (perception-requests.mjs) over the
 * same socketlib transport, swapping Perception ("per") for Spellcraft ("spl").
 *
 * Key difference: Spellcraft is TRAINED-ONLY (`actor.system.skills.spl.rt` is
 * true; confirmed in docs/0.4.0-PROBE.md), so eligibility requires
 * `spl.rank >= 1` in addition to player ownership — unlike untrained-usable
 * Perception.
 *
 * Flow:
 *  1. GM clicks "Request Spellcraft" on a masked-spell card: confirms/overrides
 *     the hidden DC (auto-derived 15 + spell level; active-GM localStorage only)
 *     and picks which eligible players to ask.
 *  2. socketlib prompts those players to roll Spellcraft.
 *  3. The player rolls; the total is captured from pf1ActorRollSkill
 *     (skillId === "spl") and relayed to the GM via executeAsGM.
 *  4. The active GM compares it to the hidden DC and, on success, marks the user
 *     identified and whispers them the spell name + school. The DC and identity
 *     never leave the GM; there is no automatic global reveal.
 */

import { MODULE_ID, SETTINGS, SOCKET_TYPES } from "./module-constants.mjs";
import {
  getSpellGate, getHiddenSpellcraftDC, setHiddenSpellcraftDC,
  markIdentified, isActiveGMClient
} from "./state.mjs";
import { revealSpellToUser } from "./spell-identification.mjs";

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
export function registerSpellcraftSocket() {
  if ( (typeof socketlib === "undefined") || !socketlib?.registerModule ) {
    console.error(`${MODULE_ID} | socketlib is required for Spellcraft requests but was not found.`);
    return;
  }
  dvSocket = socketlib.registerModule(MODULE_ID);
  dvSocket.register(SOCKET_TYPES.spellcraftRequest, onSpellcraftRequest);
  dvSocket.register(SOCKET_TYPES.spellcraftResult, onSpellcraftResult);
  dlog("spellcraft socketlib handlers registered");
}

/* ---------- eligibility (player-owned + spl.rank >= 1) ---------- */

/**
 * The PC a user will roll Spellcraft with: their assigned character if it is
 * player-owned and trained, else the first owned, player-owned, trained actor.
 * Spellcraft is trained-only, so rank >= 1 is required (0.4.0 probe).
 * @param {object} user
 * @returns {object|null}
 */
export function spellcraftActorForUser(user) {
  if ( !user || user.isGM ) return null;
  const trained = a => !!a && (Number(a.system?.skills?.spl?.rank) >= 1);
  if ( user.character?.hasPlayerOwner && trained(user.character) ) return user.character;
  return game.actors.find(a => a.hasPlayerOwner && trained(a) && a.testUserPermission(user, "OWNER")) ?? null;
}

/**
 * Non-GM users who own a player-owned PC trained in Spellcraft.
 * @returns {Array} eligible User documents
 */
export function eligibleSpellcraftUsers() {
  return game.users.filter(u => !u.isGM && !!spellcraftActorForUser(u));
}

/* ---------- GM: request dialog ---------- */

/**
 * Open the GM "Request Spellcraft" dialog for a masked cast: confirm/override
 * the hidden DC (active-GM only) and dispatch a roll request to chosen players.
 * @param {string} castId
 */
export async function openSpellcraftRequestDialog(castId) {
  if ( !game.user.isGM ) return;
  if ( !dvSocket ) {
    ui.notifications?.error(game.i18n.localize("PF15DV.Notify.NoSocketlib"));
    return;
  }
  const gate = getSpellGate(castId);
  if ( !gate || (gate.state !== "masked") ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Spell.NoActiveMask"));
    return;
  }
  if ( !isActiveGMClient() ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Spell.NotActiveGM"));
    return;
  }
  const users = eligibleSpellcraftUsers();
  if ( !users.length ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Spell.NoEligiblePlayers"));
    return;
  }
  const currentDC = getHiddenSpellcraftDC(castId);
  const dcVal = (currentDC === null) ? "" : currentDC;
  const rows = users.map(u =>
    `<div class="form-group"><label class="checkbox"><input type="checkbox" name="${u.id}" checked></label></div>`
  ).join("");
  const content =
    `<p class="hint">${game.i18n.localize("PF15DV.Spell.RequestHint")}</p>` +
    `<div class="form-group"><label>${game.i18n.localize("PF15DV.Spell.DCLabel")}</label>` +
    `<input type="number" name="dc" value="${dcVal}" min="0" step="1"></div><hr>${rows}`;

  const result = await DialogV2.wait({
    window: { title: "PF15DV.Spell.RequestTitle", icon: "fa-solid fa-wand-magic-sparkles" },
    classes: ["pf15dv-dialog"],
    position: { width: 440 },
    content,
    buttons: [
      {
        action: "request",
        label: "PF15DV.Spell.RequestSend",
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
        const pc = spellcraftActorForUser(u);
        if ( cb?.parentElement ) cb.parentElement.append(document.createTextNode(` ${u.name}${pc ? " — " + pc.name : ""}`));
      }
    }
  });

  if ( !result || (typeof result !== "object") ) return;
  if ( (result.dc !== null) && Number.isFinite(result.dc) ) {
    await setHiddenSpellcraftDC(castId, result.dc);
  }
  if ( !result.userIds.length ) return;
  dlog("executeForUsers spellcraftRequest", { userIds: result.userIds, castId });
  dvSocket.executeForUsers(SOCKET_TYPES.spellcraftRequest, result.userIds, { castId });
  ui.notifications?.info(game.i18n.format("PF15DV.Notify.RequestSent", { count: result.userIds.length }));
}

/* ---------- player: receive request, prompt, roll, relay ---------- */

async function onSpellcraftRequest({ castId } = {}) {
  dlog("onSpellcraftRequest (socketlib)", { castId, me: game.user?.name });
  const actor = spellcraftActorForUser(game.user);
  if ( !actor ) {
    ui.notifications?.warn(game.i18n.localize("PF15DV.Spell.NoCharacter"));
    return;
  }
  const proceed = await DialogV2.confirm({
    window: { title: "PF15DV.Spell.RollPromptTitle", icon: "fa-solid fa-wand-magic-sparkles" },
    classes: ["pf15dv-dialog"],
    position: { width: 360 },
    content: `<p>${game.i18n.localize("PF15DV.Spell.RollPromptBody")}</p>`,
    rejectClose: false
  });
  if ( !proceed ) return;
  await rollAndRelay(actor, castId);
}

/**
 * Roll Spellcraft for `actor`, capture the total from pf1ActorRollSkill
 * (skillId "spl") and relay ids + total to the GM via socketlib.
 * @param {object} actor
 * @param {string} castId
 */
async function rollAndRelay(actor, castId) {
  let done = false;
  const handler = (rolledActor, chatMessage, skillId) => {
    if ( done || (skillId !== "spl") || (rolledActor?.id !== actor.id) ) return;
    done = true;
    const total = chatMessage?.rolls?.[0]?.total;
    dlog("captured spellcraft roll", { actor: actor.name, total });
    if ( !Number.isFinite(total) ) return;
    dvSocket.executeAsGM(SOCKET_TYPES.spellcraftResult, {
      castId,
      userId: game.user.id,
      actorId: actor.id,
      actorName: actor.name,
      total
    });
  };
  Hooks.on("pf1ActorRollSkill", handler);
  try {
    await actor.rollSkill("spl");
    await new Promise(resolve => setTimeout(resolve, 800));
  } catch ( err ) {
    console.error(`${MODULE_ID} | spellcraft roll failed`, err);
  } finally {
    Hooks.off("pf1ActorRollSkill", handler);
  }
}

/* ---------- GM: adjudicate (executeAsGM) ---------- */

async function onSpellcraftResult({ castId, userId, actorId, actorName, total } = {}) {
  dlog("onSpellcraftResult (socketlib)", { castId, userId, total, activeGM: isActiveGMClient() });
  if ( !castId || !userId || !Number.isFinite(total) ) return;
  const gate = getSpellGate(castId);
  if ( !gate || (gate.state !== "masked") ) return;
  const name = actorName ?? "?";
  const dc = getHiddenSpellcraftDC(castId);                          // null unless active GM
  if ( dc === null ) {
    ui.notifications?.info(game.i18n.format("PF15DV.Spell.ResultNoDC", { actor: name, total }));
    return;
  }
  if ( total >= dc ) {
    const round = game.combat?.round ?? null;
    await markIdentified(castId, userId, { actorId, actorName, round, source: "spellcraft" });
    await revealSpellToUser(castId, userId);
    ui.notifications?.info(game.i18n.format("PF15DV.Spell.ResultSuccess", { actor: name, total }));
  } else {
    ui.notifications?.info(game.i18n.format("PF15DV.Spell.ResultFail", { actor: name, total }));
  }
}
