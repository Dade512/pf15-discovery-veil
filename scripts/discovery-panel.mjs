/**
 * pf15-discovery-veil — 0.6.0 Shared Discovery UI (GM panel).
 *
 * A single GM-only window listing every active discovery gate the module owns:
 *   - undetected creatures (perception gates, keyed sceneId:tokenId)
 *   - masked spell casts   (spell gates, keyed castId)
 * with per-player success status and the same reveal / request / clear actions
 * that live on the Token HUD and the masked-spell chat card — gathered in one
 * place so the GM can run several gates at once.
 *
 * Privacy: GM-only (guarded on game.user.isGM). The list is built from the SAFE
 * public registry; GM secrets (hidden Perception/Spellcraft DCs, true spell
 * identities) are read only through the active-GM-gated getters, which fail
 * closed to null off the active GM. No secret is ever written into a data-*
 * attribute or any replicated surface. The panel re-renders live when the public
 * registry changes (e.g. a player's successful roll updates spottedBy /
 * identifiedBy) via the updateSetting hook, so cross-client successes appear
 * without a manual refresh.
 *
 * Built on the confirmed-working 13.350 ApplicationV2 + getSceneControlButtons
 * pattern (baphomet-utils weather-ui.js): programmatic DOM from _renderHTML,
 * content.replaceChildren in _replaceHTML, a static actions map, and a token
 * scene-control whose `tools` is a Record keyed by tool name.
 */

import { MODULE_ID, SETTINGS, CSS } from "./module-constants.mjs";
import {
  readPublicRegistry, isActiveGMClient,
  getHiddenPerceptionDC, getHiddenSpellIdentity,
  clearPerceptionGate, setGlobalReveal, setHiddenPerceptionDC
} from "./state.mjs";
import { clearGateAction, revealGloballyAction, openSpottedDialog } from "./perception-gate.mjs";
import { openPerceptionRequestDialog } from "./perception-requests.mjs";
import { openSpellcraftRequestDialog } from "./spellcraft-requests.mjs";
import { revealSpellGlobally, clearSpellMask } from "./spell-identification.mjs";

const ApplicationV2 = foundry.applications.api.ApplicationV2;

/* ---------- helpers ---------- */

/** Resolve a perception gate key to its placed TokenDocument, or null. */
function tokenDocFor(sceneId, tokenId) {
  return game.scenes?.get(sceneId)?.tokens?.get(tokenId) ?? null;
}

/** Split a "sceneId:tokenId" key on the first colon (ids never contain one). */
function splitPerceptionKey(key) {
  const idx = key.indexOf(":");
  if ( idx < 0 ) return { sceneId: key, tokenId: "" };
  return { sceneId: key.slice(0, idx), tokenId: key.slice(idx + 1) };
}

/**
 * Friendly "ActorName (PlayerName)" labels for a spottedBy / identifiedBy map.
 * Returns an array of strings (caller renders via textContent — never HTML).
 */
function attributionLabels(map) {
  const parts = [];
  for ( const [userId, att] of Object.entries(map ?? {}) ) {
    const uname = game.users?.get(userId)?.name ?? userId;
    const aname = att?.actorName;
    parts.push(aname ? `${aname} (${uname})` : uname);
  }
  return parts;
}

/** Collect the safe + (active-GM-only) view of every perception gate. */
function collectPerception() {
  const reg = readPublicRegistry().perception;
  const out = [];
  for ( const [key, entry] of Object.entries(reg) ) {
    const { sceneId, tokenId } = splitPerceptionKey(key);
    const scene = game.scenes?.get(sceneId) ?? null;
    const tokenDoc = scene?.tokens?.get(tokenId) ?? null;
    out.push({
      sceneId, tokenId,
      sceneName: scene?.name ?? null,
      tokenName: tokenDoc?.name ?? null,
      orphaned: !tokenDoc,
      state: entry.state,
      spottedBy: entry.spottedBy ?? {},
      dc: getHiddenPerceptionDC(sceneId, tokenId)   // null off the active GM
    });
  }
  return out;
}

/** Collect the safe + (active-GM-only) view of every masked-spell gate. */
function collectSpells() {
  const reg = readPublicRegistry().spellcasting;
  const out = [];
  for ( const [castId, entry] of Object.entries(reg) ) {
    out.push({
      castId,
      state: entry.state,
      publicLabel: entry.publicLabel,
      identifiedBy: entry.identifiedBy ?? {},
      identity: getHiddenSpellIdentity(castId)       // null off the active GM
    });
  }
  return out;
}

/** Pan/select a token on the current scene; notify if it is elsewhere. */
function panToToken(sceneId, tokenId) {
  try {
    if ( canvas?.scene?.id !== sceneId ) {
      ui.notifications?.info(game.i18n.localize("PF15DV.Panel.FocusOtherScene"));
      return;
    }
    const t = canvas.tokens?.get(tokenId);
    if ( !t ) return;
    t.control({ releaseOthers: true });
    canvas.animatePan({ x: t.center.x, y: t.center.y });
  } catch ( err ) { console.error(`${MODULE_ID} | panToToken failed`, err); }
}

/* ---------- DOM builders ---------- */

/** A panel action button. ids are public (scene/token/cast) — never secrets. */
function actionButton(action, dataset, icon, label, { disabled = false } = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.classList.add("pf15dv-panel-btn");
  b.dataset.action = action;
  for ( const [k, v] of Object.entries(dataset) ) b.dataset[k] = v;
  if ( disabled ) b.disabled = true;
  const i = document.createElement("i");
  i.className = `fa-solid ${icon}`;
  i.setAttribute("inert", "");
  b.append(i, document.createTextNode(" " + label));
  return b;
}

/** A status line ("Spotted by: …") whose names are set via textContent. */
function statusLine(labelKey, emptyKey, names) {
  const div = document.createElement("div");
  div.classList.add("pf15dv-panel-status");
  if ( !names.length ) {
    div.textContent = game.i18n.localize(emptyKey);
  } else {
    const strong = document.createElement("span");
    strong.classList.add("pf15dv-panel-status-label");
    strong.textContent = game.i18n.localize(labelKey) + " ";
    div.append(strong, document.createTextNode(names.join(", ")));
  }
  return div;
}

/** A titled section shell with a "(count)" header. */
function buildSection(titleKey, icon, count) {
  const section = document.createElement("section");
  section.classList.add("pf15dv-panel-section");
  const header = document.createElement("header");
  header.classList.add("pf15dv-panel-section-header");
  const i = document.createElement("i");
  i.className = `fa-solid ${icon}`;
  i.setAttribute("inert", "");
  const h = document.createElement("span");
  h.textContent = `${game.i18n.localize(titleKey)} (${count})`;
  header.append(i, h);
  section.appendChild(header);
  return section;
}

/** Build one perception-gate entry card. */
function buildPerceptionEntry(e) {
  const card = document.createElement("div");
  card.classList.add("pf15dv-panel-entry");

  const head = document.createElement("div");
  head.classList.add("pf15dv-panel-entry-head");
  const name = document.createElement("span");
  name.classList.add("pf15dv-panel-entry-name");
  name.textContent = e.tokenName ?? game.i18n.localize("PF15DV.Panel.Orphaned");
  head.appendChild(name);

  const meta = document.createElement("span");
  meta.classList.add("pf15dv-panel-entry-meta");
  const stateKey = (e.state === "globallyRevealed")
    ? "PF15DV.Panel.StateRevealed" : "PF15DV.Panel.StateUndetected";
  const bits = [];
  if ( e.sceneName ) bits.push(e.sceneName);
  bits.push(game.i18n.localize(stateKey));
  if ( e.dc !== null ) bits.push(game.i18n.format("PF15DV.Panel.DCLabel", { dc: e.dc }));
  meta.textContent = bits.join(" · ");
  head.appendChild(meta);
  card.appendChild(head);

  card.appendChild(statusLine("PF15DV.Panel.SpottedBy", "PF15DV.Panel.SpottedNobody",
    attributionLabels(e.spottedBy)));

  const actions = document.createElement("div");
  actions.classList.add("pf15dv-panel-actions");
  const ds = { sceneId: e.sceneId, tokenId: e.tokenId };
  if ( e.orphaned ) {
    actions.appendChild(actionButton("perClear", ds, "fa-eraser", game.i18n.localize("PF15DV.Panel.BtnClear")));
  } else if ( e.state === "undetected" ) {
    actions.appendChild(actionButton("perManage", ds, "fa-user-check", game.i18n.localize("PF15DV.Panel.BtnManage")));
    actions.appendChild(actionButton("perRequest", ds, "fa-dice-d20", game.i18n.localize("PF15DV.Panel.BtnRequest")));
    actions.appendChild(actionButton("perReveal", ds, "fa-eye", game.i18n.localize("PF15DV.Panel.BtnReveal")));
    actions.appendChild(actionButton("perFocus", ds, "fa-crosshairs", game.i18n.localize("PF15DV.Panel.BtnFocus")));
    actions.appendChild(actionButton("perClear", ds, "fa-eraser", game.i18n.localize("PF15DV.Panel.BtnClear")));
  } else {
    actions.appendChild(actionButton("perFocus", ds, "fa-crosshairs", game.i18n.localize("PF15DV.Panel.BtnFocus")));
    actions.appendChild(actionButton("perClear", ds, "fa-eraser", game.i18n.localize("PF15DV.Panel.BtnClear")));
  }
  card.appendChild(actions);
  return card;
}

/** Build one masked-spell entry card. */
function buildSpellEntry(e) {
  const card = document.createElement("div");
  card.classList.add("pf15dv-panel-entry");

  const head = document.createElement("div");
  head.classList.add("pf15dv-panel-entry-head");
  const name = document.createElement("span");
  name.classList.add("pf15dv-panel-entry-name");
  // True name only on the active GM (identity != null); else the generic label.
  name.textContent = e.identity?.spellName
    ?? e.publicLabel ?? game.i18n.localize("PF15DV.Spell.GenericLabel");
  head.appendChild(name);

  const meta = document.createElement("span");
  meta.classList.add("pf15dv-panel-entry-meta");
  const stateKey = (e.state === "globallyRevealed")
    ? "PF15DV.Panel.StateRevealed" : "PF15DV.Panel.StateMasked";
  const bits = [game.i18n.localize(stateKey)];
  if ( e.identity ) {
    const school = globalThis.pf1?.config?.spellSchools?.[e.identity.school] ?? e.identity.school;
    if ( school ) bits.push(school);
    if ( Number.isFinite(e.identity.dc) ) bits.push(game.i18n.format("PF15DV.Panel.DCLabel", { dc: e.identity.dc }));
  } else {
    bits.push(game.i18n.localize("PF15DV.Panel.IdentityUnknown"));
  }
  meta.textContent = bits.join(" · ");
  head.appendChild(meta);
  card.appendChild(head);

  card.appendChild(statusLine("PF15DV.Panel.IdentifiedBy", "PF15DV.Panel.IdentifiedNobody",
    attributionLabels(e.identifiedBy)));

  const actions = document.createElement("div");
  actions.classList.add("pf15dv-panel-actions");
  const ds = { castId: e.castId };
  if ( e.state === "masked" ) {
    actions.appendChild(actionButton("spellRequest", ds, "fa-dice-d20", game.i18n.localize("PF15DV.Panel.BtnRequestSpellcraft")));
    actions.appendChild(actionButton("spellReveal", ds, "fa-eye", game.i18n.localize("PF15DV.Panel.BtnReveal")));
  }
  actions.appendChild(actionButton("spellClear", ds, "fa-eraser", game.i18n.localize("PF15DV.Panel.BtnClear")));
  card.appendChild(actions);
  return card;
}

/** An "empty" / "feature disabled" hint row for a section with no entries. */
function emptyHint(enabled, emptyKey, disabledKey) {
  const div = document.createElement("div");
  div.classList.add("pf15dv-panel-empty");
  div.textContent = game.i18n.localize(enabled ? emptyKey : disabledKey);
  return div;
}

/* ---------- application ---------- */

let _panelInstance = null;

export class DiscoveryPanel extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "pf15dv-discovery-panel",
    classes: ["pf15dv-panel-app"],
    position: { width: 440, height: "auto" },
    window: {
      title: "PF15DV.Panel.Title",
      icon: "fa-solid fa-clipboard-list",
      resizable: true
    },
    actions: {
      perManage: DiscoveryPanel.#onPerManage,
      perRequest: DiscoveryPanel.#onPerRequest,
      perReveal: DiscoveryPanel.#onPerReveal,
      perFocus: DiscoveryPanel.#onPerFocus,
      perClear: DiscoveryPanel.#onPerClear,
      spellRequest: DiscoveryPanel.#onSpellRequest,
      spellReveal: DiscoveryPanel.#onSpellReveal,
      spellClear: DiscoveryPanel.#onSpellClear,
      refresh: DiscoveryPanel.#onRefresh
    }
  };

  /** updateSetting hook id (registered while open, removed on close). */
  #settingHookId = null;

  /* ── render ── */

  async _renderHTML(_context, _options) {
    const root = document.createElement("div");
    root.classList.add(CSS.panel);
    try {
      if ( !game.user?.isGM ) {
        root.textContent = game.i18n.localize("PF15DV.Panel.GMOnly");
        return root;
      }

      if ( !isActiveGMClient() ) {
        const warn = document.createElement("div");
        warn.classList.add("pf15dv-panel-warn");
        warn.textContent = game.i18n.localize("PF15DV.Panel.NotActiveGM");
        root.appendChild(warn);
      }

      // Perception section.
      const perception = collectPerception();
      const perSection = buildSection("PF15DV.Panel.PerceptionTitle", "fa-eye-slash", perception.length);
      if ( perception.length ) {
        for ( const e of perception ) perSection.appendChild(buildPerceptionEntry(e));
      } else {
        perSection.appendChild(emptyHint(
          game.settings.get(MODULE_ID, SETTINGS.perceptionEnabled),
          "PF15DV.Panel.PerceptionEmpty", "PF15DV.Panel.PerceptionDisabled"));
      }
      root.appendChild(perSection);

      // Spell section.
      const spells = collectSpells();
      const spellSection = buildSection("PF15DV.Panel.SpellTitle", "fa-wand-magic-sparkles", spells.length);
      if ( spells.length ) {
        for ( const e of spells ) spellSection.appendChild(buildSpellEntry(e));
      } else {
        spellSection.appendChild(emptyHint(
          game.settings.get(MODULE_ID, SETTINGS.spellcraftEnabled),
          "PF15DV.Panel.SpellEmpty", "PF15DV.Panel.SpellDisabled"));
      }
      root.appendChild(spellSection);

      // Footer (refresh).
      const footer = document.createElement("footer");
      footer.classList.add("pf15dv-panel-footer");
      footer.appendChild(actionButton("refresh", {}, "fa-rotate", game.i18n.localize("PF15DV.Panel.BtnRefresh")));
      root.appendChild(footer);
    } catch ( err ) {
      console.error(`${MODULE_ID} | discovery panel render failed`, err);
      root.textContent = game.i18n.localize("PF15DV.Panel.RenderError");
    }
    return root;
  }

  _replaceHTML(result, content, _options) {
    content.replaceChildren(result);
  }

  /* ── live refresh on registry change ── */

  _onRender(context, options) {
    super._onRender(context, options);
    if ( this.#settingHookId == null ) {
      this.#settingHookId = Hooks.on("updateSetting", setting => {
        if ( setting?.key === `${MODULE_ID}.${SETTINGS.publicRegistry}` ) this.render();
      });
    }
  }

  _onClose(options) {
    if ( this.#settingHookId != null ) {
      Hooks.off("updateSetting", this.#settingHookId);
      this.#settingHookId = null;
    }
    super._onClose(options);
  }

  /* ── perception actions ── */

  static async #onPerManage(event, target) {
    await openSpottedDialog({ sceneId: target.dataset.sceneId, tokenId: target.dataset.tokenId });
    this.render();
  }

  static async #onPerRequest(event, target) {
    await openPerceptionRequestDialog({ sceneId: target.dataset.sceneId, tokenId: target.dataset.tokenId });
    this.render();
  }

  static async #onPerReveal(event, target) {
    const { sceneId, tokenId } = target.dataset;
    const tokenDoc = tokenDocFor(sceneId, tokenId);
    if ( tokenDoc ) await revealGloballyAction(tokenDoc);
    else await setGlobalReveal(sceneId, tokenId);
    this.render();
  }

  static #onPerFocus(event, target) {
    panToToken(target.dataset.sceneId, target.dataset.tokenId);
  }

  static async #onPerClear(event, target) {
    const { sceneId, tokenId } = target.dataset;
    const tokenDoc = tokenDocFor(sceneId, tokenId);
    if ( tokenDoc ) {
      await clearGateAction(tokenDoc);          // restores token + clears gate + private DC
    } else {
      // Orphaned gate (token deleted): no document to restore, but still clear
      // the public gate AND the active-GM private DC so nothing is left behind.
      await clearPerceptionGate(sceneId, tokenId);
      await setHiddenPerceptionDC(sceneId, tokenId, null);
    }
    this.render();
  }

  /* ── spell actions ── */

  static async #onSpellRequest(event, target) {
    await openSpellcraftRequestDialog(target.dataset.castId);
    this.render();
  }

  static async #onSpellReveal(event, target) {
    await revealSpellGlobally(target.dataset.castId);
    this.render();
  }

  static async #onSpellClear(event, target) {
    await clearSpellMask(target.dataset.castId);
    this.render();
  }

  static #onRefresh() {
    this.render();
  }
}

/* ---------- entry points ---------- */

/**
 * Open (or toggle) the GM discovery panel. GM-only; a no-op for players.
 * @param {{toggle?:boolean}} [opts]
 */
export function openDiscoveryPanel({ toggle = false } = {}) {
  if ( !game.user?.isGM ) return;
  if ( !_panelInstance ) _panelInstance = new DiscoveryPanel();
  if ( toggle && _panelInstance.rendered ) { _panelInstance.close(); return; }
  _panelInstance.render({ force: true });
}

/**
 * getSceneControlButtons handler: add a GM-only "Discovery Veil panel" button to
 * the token controls. 13.350 shape — controls is a Record, tools is a Record
 * keyed by tool name, button tools use onChange (confirmed: weather-ui.js).
 * @param {Record<string, object>} controls
 */
export function registerDiscoveryPanelControls(controls) {
  if ( !game.user?.isGM ) return;
  const tokenControls = controls?.tokens;
  if ( !tokenControls?.tools ) {
    console.warn(`${MODULE_ID} | could not find token controls for the discovery-panel button`);
    return;
  }
  tokenControls.tools.pf15dvPanel = {
    name: "pf15dvPanel",
    title: game.i18n.localize("PF15DV.Panel.SceneControlTitle"),
    icon: "fa-solid fa-clipboard-list",
    button: true,
    visible: game.user.isGM,
    order: Object.keys(tokenControls.tools).length,
    onChange: () => openDiscoveryPanel({ toggle: true })
  };
}

/** Register the GM keybinding to toggle the panel. Call during the init hook. */
export function registerDiscoveryPanelKeybinding() {
  game.keybindings.register(MODULE_ID, "openPanel", {
    name: "PF15DV.Keybind.OpenPanel.Name",
    hint: "PF15DV.Keybind.OpenPanel.Hint",
    editable: [],
    restricted: true,
    onDown: () => { openDiscoveryPanel({ toggle: true }); return true; }
  });
}
