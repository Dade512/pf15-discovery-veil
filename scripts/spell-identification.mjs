/**
 * pf15-discovery-veil — 0.5.0 Spell Identification (non-player casting mask).
 *
 * Flow (characterized live in docs/0.4.0-PROBE.md):
 *  1. A non-player (GM-controlled) actor casts a spell. `pf1PreActionUse` fires
 *     on the GM client BEFORE PF1 builds the player-visible card.
 *  2. We suppress that card using PF1's native `shared.scriptData.hideChat`
 *     (source-confirmed: `postMessage()` short-circuits before
 *     `ChatMessage.create`). The real card document is never created → nothing
 *     to leak, nothing to delete. We do NOT return false (that would cancel the
 *     whole action and its mechanics).
 *  3. The true identity (name/school/uuid/level + derived Spellcraft DC =
 *     15 + level) is stored ONLY on the active-GM client (private localStorage
 *     store). A generic "A spell is being cast." card is posted publicly.
 *  4. The GM requests Spellcraft from eligible PCs (see spellcraft-requests.mjs);
 *     on a success the earner is told the name + school via a Foundry-filtered
 *     whisper. The GM can reveal it to everyone.
 *
 * Privacy: the spell name/school/uuid never touch the public registry, the
 * generic card document, flags, or any all-clients socket payload. Only safe
 * state (gate exists, who identified, generic label, castId) is replicated.
 */

import { MODULE_ID, SETTINGS, CSS, SPELL_ID_DC_BASE } from "./module-constants.mjs";
import {
  setHiddenSpellIdentity, getHiddenSpellIdentity, getSpellGate,
  markMasked, setSpellGlobalReveal, isActiveGMClient
} from "./state.mjs";
import { openSpellcraftRequestDialog } from "./spellcraft-requests.mjs";

/** Debug log, gated on the module's debugLogging client setting. */
function dlog(...args) {
  try { if ( game.settings.get(MODULE_ID, SETTINGS.debugLogging) ) console.log(`${MODULE_ID} |`, ...args); }
  catch (_) {}
}

/** Minimal HTML-escape for system-sourced strings injected into card content. */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Human-readable spell-school label, or "" if none. */
function schoolLabel(schoolKey) {
  if ( !schoolKey ) return "";
  return globalThis.pf1?.config?.spellSchools?.[schoolKey] ?? schoolKey;
}

function genericLabel() {
  return game.i18n.localize("PF15DV.Spell.GenericLabel");
}

/**
 * ActionUse instances we are masking → their castId. Keyed by the live
 * ActionUse object (the SAME instance is passed to both pf1PreActionUse and
 * pf1PreDisplayActionUse), so PF1 cannot clobber it the way it rebuilds
 * `shared.scriptData`. This is why suppression must happen at
 * pf1PreDisplayActionUse, not via scriptData.hideChat set at pf1PreActionUse
 * (executeScriptCalls() runs after pf1PreActionUse and resets scriptData).
 */
const maskedCasts = new WeakMap();

/* ---------- detection + suppression (active-GM) ---------- */

/**
 * pf1PreActionUse handler. If a non-player actor is casting a spell and the
 * feature is enabled, suppress the real card and mask the cast. MUST NOT return
 * false (that cancels the action).
 * @param {object} actionUse  the PF1 ActionUse instance
 */
export function onPreActionUse(actionUse) {
  try {
    if ( !game.user?.isGM ) return;                                   // only GM clients mask
    if ( !game.settings.get(MODULE_ID, SETTINGS.spellcraftEnabled) ) return;
    const item = actionUse?.item;
    const actor = actionUse?.actor;
    if ( !item || (item.type !== "spell") ) return;                  // spells only
    if ( !actor || actor.hasPlayerOwner ) return;                    // non-player casters only
    if ( maskedCasts.has(actionUse) ) return;                        // already handled

    const castId = foundry.utils.randomID();

    // Mark this cast for suppression at pf1PreDisplayActionUse (the reliable
    // pre-ChatMessage.create point). Do NOT set scriptData.hideChat here — it is
    // clobbered by executeScriptCalls() which runs after this hook.
    maskedCasts.set(actionUse, castId);

    const lvl = Number(item.system?.level);
    const spellLevel = Number.isFinite(lvl) ? lvl : 0;
    const identity = {
      spellName: item.name,
      school: item.system?.school ?? null,
      spellItemUuid: item.uuid,
      casterActorUuid: actor.uuid,
      spellLevel,
      dc: SPELL_ID_DC_BASE + spellLevel
    };
    const casterName = actor.name;
    dlog("masking spell cast", { castId, spellLevel, dc: identity.dc });

    // Stash secret + write safe public state + post the generic card (async).
    (async () => {
      const stored = await setHiddenSpellIdentity(castId, identity);
      await markMasked(castId, { publicLabel: genericLabel() });
      await postGenericCard(castId, actionUse, actor);
      if ( stored ) {
        ui.notifications?.info(game.i18n.format("PF15DV.Spell.MaskedToast",
          { name: identity.spellName, dc: identity.dc, caster: casterName }));
      } else {
        // Card suppressed + generic notice posted, but identity not stored
        // (this client is not the active GM): warn; reveal won't be possible.
        ui.notifications?.warn(game.i18n.localize("PF15DV.Spell.MaskNoStore"));
      }
    })().catch(err => console.error(`${MODULE_ID} | spell mask failed`, err));
  } catch ( err ) {
    console.error(`${MODULE_ID} | onPreActionUse error`, err);
  }
  // return undefined — never false
}

/**
 * pf1PreDisplayActionUse handler. Fires inside postMessage(), after the
 * mechanics/script-calls have run, immediately before ChatMessage.create.
 * Returning false here suppresses ONLY the player-facing card (the document is
 * never created → nothing to leak, nothing to delete; mechanics are intact).
 * @param {object} actionUse
 * @returns {boolean|undefined}  false to suppress a masked cast's card
 */
export function onPreDisplayActionUse(actionUse) {
  if ( maskedCasts.has(actionUse) ) {
    dlog("suppressing player card for masked cast", maskedCasts.get(actionUse));
    return false;
  }
}

/**
 * Post the generic, player-safe "a spell is being cast" card. Carries only the
 * castId (a random id) in flags; no spell identity anywhere.
 * @param {string} castId
 * @param {object} actionUse
 * @param {object} actor
 */
async function postGenericCard(castId, actionUse, actor) {
  const token = actionUse?.token ?? actor?.token ?? undefined;
  const speaker = ChatMessage.implementation.getSpeaker({ actor, token });
  const content = `<div class="${CSS.spellCast}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(genericLabel())}</div>`;
  await ChatMessage.implementation.create({
    speaker,
    content,
    flags: { [MODULE_ID]: { castId, kind: "maskedSpell" } }
  });
}

/* ---------- GM-only card enhancements (presentation only) ---------- */

/**
 * renderChatMessageHTML handler. For a masked-spell card, on the GM's client
 * only, append the true identity (read from the private store — never in the
 * document) and a "Request Spellcraft" button while still masked. Players' DOM
 * is never touched, and the stored message content stays generic.
 * @param {object} message  ChatMessage document
 * @param {HTMLElement} html
 */
export function onRenderChatMessageHTML(message, html) {
  try {
    const flag = message?.flags?.[MODULE_ID];
    if ( !flag || (flag.kind !== "maskedSpell") || !flag.castId ) return;
    if ( !game.user?.isGM ) return;                                  // GM-only enhancements
    const root = (html instanceof HTMLElement) ? html : (html?.[0] ?? null);
    if ( !root ) return;
    const container = root.querySelector(`.${CSS.spellCast}`) ?? root;

    const identity = getHiddenSpellIdentity(flag.castId);            // active-GM only
    if ( identity && !container.querySelector(`.${CSS.gmNote}`) ) {
      const note = document.createElement("div");
      note.classList.add(CSS.gmNote);
      const sl = schoolLabel(identity.school);
      note.textContent = game.i18n.format("PF15DV.Spell.GmNote",
        { name: identity.spellName ?? "?", school: sl || "—", dc: identity.dc ?? "?" });
      container.appendChild(note);
    }

    const gate = getSpellGate(flag.castId);
    if ( gate && (gate.state === "masked") && !container.querySelector(`.${CSS.cardButton}`) ) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add(CSS.cardButton);
      btn.textContent = game.i18n.localize("PF15DV.Spell.RequestSpellcraft");
      btn.addEventListener("click", ev => {
        ev.preventDefault(); ev.stopPropagation();
        openSpellcraftRequestDialog(flag.castId);
      });
      container.appendChild(btn);
    }
  } catch ( err ) {
    console.error(`${MODULE_ID} | onRenderChatMessageHTML error`, err);
  }
}

/* ---------- reveal (active-GM authority) ---------- */

/**
 * Reveal the spell identity to a single user via a Foundry-filtered whisper
 * (delivered only to that user + GMs). Active-GM only (needs the private store).
 * @param {string} castId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function revealSpellToUser(castId, userId) {
  if ( !isActiveGMClient() ) return false;
  const identity = getHiddenSpellIdentity(castId);
  if ( !identity || !userId ) return false;
  const body = game.i18n.format("PF15DV.Spell.RevealWhisper", {
    name: esc(identity.spellName ?? "?"),
    school: esc(schoolLabel(identity.school) || "—")
  });
  await ChatMessage.implementation.create({
    content: `<div class="${CSS.spellCast}">${body}</div>`,
    whisper: [userId],
    flags: { [MODULE_ID]: { castId, kind: "spellReveal" } }
  });
  return true;
}

/**
 * Globally reveal a masked spell's identity to the whole table (GM choice).
 * Posts a public card with the name + school and marks the gate revealed.
 * @param {string} castId
 * @returns {Promise<boolean>}
 */
export async function revealSpellGlobally(castId) {
  if ( !isActiveGMClient() ) return false;
  const identity = getHiddenSpellIdentity(castId);
  if ( !identity ) return false;
  const body = game.i18n.format("PF15DV.Spell.RevealPublic", {
    name: esc(identity.spellName ?? "?"),
    school: esc(schoolLabel(identity.school) || "—")
  });
  await setSpellGlobalReveal(castId);
  await ChatMessage.implementation.create({
    content: `<div class="${CSS.spellCast}">${body}</div>`,
    flags: { [MODULE_ID]: { castId, kind: "spellReveal" } }
  });
  return true;
}
