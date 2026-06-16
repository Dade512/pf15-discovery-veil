/**
 * GM Token-HUD controls for pf15-discovery-veil (0.2.0 Perception Gate).
 *
 * GM-only. "Mark Undetected" writes the native TokenDocument.hidden flag as the
 * base hide, recording its PRIOR value + module ownership in the public
 * registry (Lyra F-6) so "Clear" / "Reveal Globally" restore it correctly and
 * never unhide a token the GM had hidden for another reason. "Manage Spotted"
 * sets which players personally see the token. All secrets stay out of the
 * replicated registry (no DCs/names here — 0.2.0 is manual).
 *
 * renderTokenHUD is ApplicationV2 in 13.350: (app, element:HTMLElement),
 * app.document is the TokenDocument; buttons go in .col.left as control-icon
 * (pattern confirmed against identity-mask hud.mjs).
 */

import { MODULE_ID, SETTINGS, CSS } from "./module-constants.mjs";
import { getPerceptionGate, markUndetected, clearPerceptionGate, setGlobalReveal, markSpotted, unmarkSpotted, setHiddenPerceptionDC } from "./state.mjs";
import { syncPerceptionTokens } from "./rendering.mjs";
import { openPerceptionRequestDialog } from "./perception-requests.mjs";

/**
 * Resolve a TokenDocument to {sceneId, tokenId} or null.
 * @param {object} tokenDoc
 * @returns {{sceneId:string, tokenId:string}|null}
 */
function refForDoc(tokenDoc) {
  const sceneId = tokenDoc?.parent?.id;
  const tokenId = tokenDoc?.id;
  if ( !sceneId || !tokenId ) return null;
  return { sceneId, tokenId };
}

/**
 * Handle renderTokenHUD: add GM discovery controls.
 * @param {object} app
 * @param {HTMLElement} element
 */
export function onRenderTokenHUD(app, element) {
  if ( !game.user.isGM || !(element instanceof HTMLElement) ) return;
  if ( !game.settings.get(MODULE_ID, SETTINGS.perceptionEnabled) ) return;
  const tokenDoc = app?.document;
  const ref = refForDoc(tokenDoc);
  if ( !ref ) return;
  const column = element.querySelector(".col.left");
  if ( !column || column.querySelector(`.${CSS.hudControl}`) ) return;

  let gate = null;
  try { gate = getPerceptionGate(ref.sceneId, ref.tokenId); }
  catch(err) { console.error(`${MODULE_ID} | failed to read gate for HUD`, err); return; }

  if ( !gate ) {
    const mark = makeHudButton("fa-eye-slash", game.i18n.localize("PF15DV.Hud.MarkUndetected"));
    mark.addEventListener("click", async event => {
      event.preventDefault(); event.stopPropagation();
      await markUndetectedAction(tokenDoc); app.render();
    });
    column.appendChild(mark);
    return;
  }

  const spot = makeHudButton("fa-user-check", game.i18n.localize("PF15DV.Hud.ManageSpotted"));
  spot.addEventListener("click", async event => {
    event.preventDefault(); event.stopPropagation();
    await openSpottedDialog(ref); app.render();
  });
  column.appendChild(spot);

  if ( gate.state === "undetected" ) {
    const request = makeHudButton("fa-dice-d20", game.i18n.localize("PF15DV.Hud.RequestPerception"));
    request.addEventListener("click", async event => {
      event.preventDefault(); event.stopPropagation();
      await openPerceptionRequestDialog(ref); app.render();
    });
    column.appendChild(request);

    const reveal = makeHudButton("fa-eye", game.i18n.localize("PF15DV.Hud.RevealGlobally"));
    reveal.addEventListener("click", async event => {
      event.preventDefault(); event.stopPropagation();
      await revealGloballyAction(tokenDoc); app.render();
    });
    column.appendChild(reveal);
  }

  const clear = makeHudButton("fa-eraser", game.i18n.localize("PF15DV.Hud.ClearGate"));
  clear.addEventListener("click", async event => {
    event.preventDefault(); event.stopPropagation();
    await clearGateAction(tokenDoc); app.render();
  });
  column.appendChild(clear);
}

/**
 * Mark a token undetected: record prior hidden state + ownership, then set the
 * native hidden flag only if it was not already hidden.
 * @param {object} tokenDoc
 */
async function markUndetectedAction(tokenDoc) {
  const ref = refForDoc(tokenDoc);
  if ( !ref ) return;
  const priorHidden = (tokenDoc.hidden === true);
  const ok = await markUndetected(ref.sceneId, ref.tokenId, { priorHidden, hiddenByModule: !priorHidden });
  if ( !ok ) return;
  if ( !priorHidden ) await tokenDoc.update({ hidden: true });
  syncPerceptionTokens();
}

/**
 * Clear the gate: restore the native hidden flag to its prior value ONLY if the
 * module owned the hide; never unhide a token the GM hid for another reason.
 * Also clears the token's hidden Perception DC from the active-GM private store
 * (0.6.0) so a cleared gate leaves no orphaned secret behind; on a non-active GM
 * that write is a harmless no-op (the DC only ever lived on the active GM).
 * Exported so the 0.6.0 discovery panel reuses the exact HUD behaviour.
 * @param {object} tokenDoc
 */
export async function clearGateAction(tokenDoc) {
  const ref = refForDoc(tokenDoc);
  if ( !ref ) return;
  const gate = getPerceptionGate(ref.sceneId, ref.tokenId);
  if ( gate && gate.hiddenByModule && (tokenDoc.hidden === true) ) {
    await tokenDoc.update({ hidden: !!gate.priorHidden });
  }
  await clearPerceptionGate(ref.sceneId, ref.tokenId);
  await setHiddenPerceptionDC(ref.sceneId, ref.tokenId, null);
  syncPerceptionTokens();
}

/**
 * Reveal globally: mark public state revealed and restore the native hidden
 * flag (module-owned only) so every player sees the token normally.
 * Exported so the 0.6.0 discovery panel reuses the exact HUD behaviour.
 * @param {object} tokenDoc
 */
export async function revealGloballyAction(tokenDoc) {
  const ref = refForDoc(tokenDoc);
  if ( !ref ) return;
  const gate = getPerceptionGate(ref.sceneId, ref.tokenId);
  await setGlobalReveal(ref.sceneId, ref.tokenId);
  if ( gate && gate.hiddenByModule && (tokenDoc.hidden === true) ) {
    await tokenDoc.update({ hidden: !!gate.priorHidden });
  }
  // Lyra 0.2.0 audit #2: a token the GM had hidden BEFORE the gate stays hidden
  // (priorHidden retained, not module-owned), so "Reveal Globally" can't expose
  // it. Tell the GM so the button label doesn't promise more than it can do.
  if ( gate && gate.priorHidden && (tokenDoc.hidden === true) ) {
    ui.notifications?.info(game.i18n.localize("PF15DV.Notify.PriorHiddenRetained"));
  }
  syncPerceptionTokens();
}

/**
 * GM dialog to toggle which non-GM players have spotted the token. Player names
 * are assigned via textContent (untrusted), never interpolated into HTML.
 * Exported so the 0.6.0 discovery panel reuses the exact HUD behaviour.
 * @param {{sceneId:string, tokenId:string}} ref
 */
export async function openSpottedDialog(ref) {
  const gate = getPerceptionGate(ref.sceneId, ref.tokenId);
  const spotted = (gate && gate.spottedBy) ? gate.spottedBy : {};
  const players = game.users.filter(u => !u.isGM);
  const rows = players.map(u =>
    `<div class="form-group"><label class="checkbox"><input type="checkbox" name="${u.id}"${spotted[u.id] ? " checked" : ""}></label></div>`
  ).join("");
  const content = `<p class="hint">${game.i18n.localize("PF15DV.Dialog.SpottedHint")}</p>${rows}`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "PF15DV.Dialog.SpottedTitle", icon: "fa-solid fa-user-check" },
    content,
    buttons: [
      {
        action: "save",
        label: "PF15DV.Dialog.Save",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const out = {};
          for ( const u of players ) out[u.id] = button.form?.elements?.[u.id]?.checked === true;
          return out;
        }
      },
      { action: "cancel", label: "PF15DV.Dialog.Cancel", icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    render: (event, dialog) => {
      const el = dialog.element;
      for ( const u of players ) {
        const cb = el.querySelector(`input[name="${globalThis.CSS.escape(u.id)}"]`);
        if ( cb?.parentElement ) cb.parentElement.append(document.createTextNode(" " + u.name));
      }
    }
  });

  if ( !result || (typeof result !== "object") ) return;
  const round = game.combat?.round ?? null;
  for ( const u of players ) {
    const want = (result[u.id] === true);
    const has = !!spotted[u.id];
    if ( want && !has ) await markSpotted(ref.sceneId, ref.tokenId, u.id, { round, source: "manual" });
    else if ( !want && has ) await unmarkSpotted(ref.sceneId, ref.tokenId, u.id);
  }
  syncPerceptionTokens();
}

/**
 * Build a HUD control button matching core markup (button.control-icon).
 * @param {string} faIcon
 * @param {string} label
 * @returns {HTMLButtonElement}
 */
function makeHudButton(faIcon, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("control-icon", CSS.hudControl);
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = "";
  const icon = document.createElement("i");
  icon.classList.add("fa-solid", faIcon);
  icon.setAttribute("inert", "");
  button.appendChild(icon);
  return button;
}
