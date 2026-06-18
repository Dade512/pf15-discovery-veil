/**
 * pf15-discovery-veil — shared skill-request broker factory (0.7.4).
 *
 * The Perception (0.3.0) and Spellcraft (0.5.0) request flows were ~95%
 * identical: a GM "request" dialog that sets a hidden DC and dispatches a roll
 * prompt to chosen eligible players over socketlib, each player rolls and relays
 * {ids + total} back, and the active GM compares the total to the hidden DC and,
 * on success, marks the user + runs a per-skill success action. The DC never
 * leaves the GM; there is no automatic global reveal. The only real differences
 * are the skill key, eligibility (untrained vs trained rank ≥ 1), the gate/DC
 * accessors, the target shape ({sceneId,tokenId} vs castId), the i18n key set,
 * and the success action.
 *
 * `createSkillBroker(config)` collapses that shared flow into one place and
 * returns the four public functions each broker file re-exports. The two thin
 * config wrappers (`perception-requests.mjs`, `spellcraft-requests.mjs`)
 * describe only the differences.
 *
 * Behavior is preserved exactly versus the two original brokers, including the
 * asymmetric DC handling (Perception validates + warns on a bad/failed store and
 * always re-stores — even null, to clear; Spellcraft stores only a finite DC and
 * never warns), via each config's own `commitDC`.
 *
 * socketlib transport: handlers are registered with a single shared
 * `socketlib.registerModule(MODULE_ID)` socket (memoized here — this also
 * centralizes the two previously-separate registrations). Handlers MUST stay
 * regular functions, not arrows: socketlib invokes them as
 * `fn.call({socketdata:{userId}}, payload)`, and the verified sender is read from
 * `this.socketdata.userId` — an arrow would lose that binding.
 */

import { MODULE_ID, SETTINGS } from "./module-constants.mjs";
import { isActiveGMClient } from "./state.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

/**
 * Shared socketlib module socket, registered once and memoized. Both brokers
 * import this same module instance, so a single `registerModule(MODULE_ID)`
 * backs all four handler registrations.
 */
let dvSocket = null;

/**
 * Resolve (and memoize) the shared socketlib socket, or null if socketlib is
 * unavailable (logging the broker-specific missing-dependency message).
 * @param {string} missingMsg
 * @returns {object|null}
 */
function ensureSocket(missingMsg) {
  if ( dvSocket ) return dvSocket;
  if ( (typeof socketlib === "undefined") || !socketlib?.registerModule ) {
    console.error(`${MODULE_ID} | ${missingMsg}`);
    return null;
  }
  dvSocket = socketlib.registerModule(MODULE_ID);
  return dvSocket;
}

/** Debug log, gated on the module's debugLogging client setting. */
function dlog(...args) {
  try { if ( game.settings.get(MODULE_ID, SETTINGS.debugLogging) ) console.log(`${MODULE_ID} |`, ...args); }
  catch (_) {}
}

/**
 * Build one skill-request broker from a config describing the differences.
 *
 * @param {object} config
 * @param {string}   config.skillKey        pf1 skill id rolled + matched (e.g. "per", "spl").
 * @param {string}   config.label           Lowercase skill name for debug/console text ("perception").
 * @param {string}   config.icon            FA icon for the dialogs.
 * @param {boolean}  config.trained         Require rank ≥ 1 in `skillKey` for eligibility.
 * @param {string}   config.source          `source` tag written into the success meta.
 * @param {string}   config.socketMissingMsg Console error when socketlib is absent.
 * @param {{request:string, result:string}} config.socketTypes  SOCKET_TYPES for this broker.
 * @param {object}   config.gate            { get(target) => gate|null, activeState: string }.
 * @param {object}   config.dc              { get(target) => number|null }.
 * @param {(target:any, dc:number|null) => Promise<boolean>} config.commitDC
 *        Store/validate the DC; resolve false to ABORT the dispatch (e.g. bad DC).
 * @param {(target:any) => object} config.requestPayload  target -> socket payload fields.
 * @param {(payload:object) => any} config.readTarget     socket payload -> target.
 * @param {(target:any) => boolean} config.targetValid    guard a relayed target.
 * @param {(target:any, senderId:string, meta:object) => Promise<void>} config.onSuccess
 * @param {object}   config.i18n            Localization keys (see usage below).
 * @returns {{registerSocket:Function, openRequestDialog:Function, actorForUser:Function, eligibleUsers:Function}}
 */
export function createSkillBroker(config) {
  const { skillKey, icon, socketTypes, i18n } = config;

  /* ---------- eligibility ---------- */

  /**
   * The PC a given user will roll for: their assigned character if it qualifies,
   * else the first qualifying owned actor. "Qualifies" = player-owned, and (when
   * `config.trained`) trained with rank ≥ 1 in `skillKey`.
   * @param {object} user
   * @returns {object|null}
   */
  function actorForUser(user) {
    if ( !user || user.isGM ) return null;
    if ( config.trained ) {
      const trained = a => !!a && (Number(a.system?.skills?.[skillKey]?.rank) >= 1);
      if ( user.character?.hasPlayerOwner && trained(user.character) ) return user.character;
      return game.actors.find(a => a.hasPlayerOwner && trained(a) && a.testUserPermission(user, "OWNER")) ?? null;
    }
    if ( user.character?.hasPlayerOwner ) return user.character;
    return game.actors.find(a => a.hasPlayerOwner && a.testUserPermission(user, "OWNER")) ?? null;
  }

  /**
   * Non-GM users who own a qualifying PC to roll.
   * @returns {Array} eligible User documents
   */
  function eligibleUsers() {
    return game.users.filter(u => !u.isGM && !!actorForUser(u));
  }

  /* ---------- GM: request dialog ---------- */

  /**
   * Open the GM request dialog for `target`: set the hidden DC (active-GM only)
   * and dispatch a roll request to chosen players.
   * @param {any} target  {sceneId,tokenId} or castId, per broker.
   */
  async function openRequestDialog(target) {
    if ( !game.user.isGM ) return;
    if ( !dvSocket ) {
      ui.notifications?.error(game.i18n.localize("PF15DV.Notify.NoSocketlib"));
      return;
    }
    const gate = config.gate.get(target);
    if ( !gate || (gate.state !== config.gate.activeState) ) {
      ui.notifications?.warn(game.i18n.localize(i18n.noActiveGate));
      return;
    }
    if ( !isActiveGMClient() ) {
      ui.notifications?.warn(game.i18n.localize(i18n.notActiveGM));
      return;
    }
    const users = eligibleUsers();
    if ( !users.length ) {
      ui.notifications?.warn(game.i18n.localize(i18n.noEligible));
      return;
    }
    const currentDC = config.dc.get(target);
    const dcVal = (currentDC === null) ? "" : currentDC;
    const rows = users.map(u =>
      `<div class="form-group"><label class="checkbox"><input type="checkbox" name="${u.id}" checked></label></div>`
    ).join("");
    const content =
      `<p class="hint">${game.i18n.localize(i18n.requestHint)}</p>` +
      `<div class="form-group"><label>${game.i18n.localize(i18n.dcLabel)}</label>` +
      `<input type="number" name="dc" value="${dcVal}" min="0" step="1"></div><hr>${rows}`;

    const result = await DialogV2.wait({
      window: { title: i18n.requestTitle, icon },
      classes: ["pf15dv-dialog"],
      position: { width: 440 },
      content,
      buttons: [
        {
          action: "request",
          label: i18n.requestSend,
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
        { action: "cancel", label: i18n.cancel, icon: "fa-solid fa-xmark", callback: () => null }
      ],
      rejectClose: false,
      render: (event, dialog) => {
        const el = dialog.element;
        for ( const u of users ) {
          const cb = el.querySelector(`input[name="${globalThis.CSS.escape(u.id)}"]`);
          const pc = actorForUser(u);
          if ( cb?.parentElement ) cb.parentElement.append(document.createTextNode(` ${u.name}${pc ? " — " + pc.name : ""}`));
        }
      }
    });

    if ( !result || (typeof result !== "object") ) return;
    const proceed = await config.commitDC(target, result.dc);
    if ( !proceed ) return;
    if ( !result.userIds.length ) return;
    dlog(`executeForUsers ${socketTypes.request}`, { userIds: result.userIds, target });
    dvSocket.executeForUsers(socketTypes.request, result.userIds, config.requestPayload(target));
    ui.notifications?.info(game.i18n.format(i18n.requestSent, { count: result.userIds.length }));
  }

  /* ---------- player: receive request, prompt, roll, relay ---------- */

  // Regular function (not arrow): socketlib binds the verified sender on `this`.
  async function onRequest(payload = {}) {
    // Only honor a request that genuinely came from a GM (socketlib's verified
    // sender, this.socketdata.userId), so a player cannot pop roll prompts on
    // other players' screens.
    if ( !game.users.get(this?.socketdata?.userId)?.isGM ) return;
    const target = config.readTarget(payload);
    dlog(`on${config.label}Request (socketlib)`, { ...payload, me: game.user?.name });
    const actor = actorForUser(game.user);
    dlog("resolved actor", actor?.name ?? null);
    if ( !actor ) {
      ui.notifications?.warn(game.i18n.localize(i18n.noCharacter));
      return;
    }
    const proceed = await DialogV2.confirm({
      window: { title: i18n.rollPromptTitle, icon },
      classes: ["pf15dv-dialog"],
      position: { width: 360 },
      content: `<p>${game.i18n.localize(i18n.rollPromptBody)}</p>`,
      rejectClose: false
    });
    if ( !proceed ) return;
    await rollAndRelay(actor, target);
  }

  /**
   * Roll `skillKey` for `actor` on this client, capture the total from the
   * pf1ActorRollSkill payload, and relay ids + total to the GM via socketlib.
   * @param {object} actor
   * @param {any} target
   */
  async function rollAndRelay(actor, target) {
    let done = false;
    const handler = (rolledActor, chatMessage, skillId) => {
      if ( done || (skillId !== skillKey) || (rolledActor?.id !== actor.id) ) return;
      done = true;
      const total = chatMessage?.rolls?.[0]?.total;
      dlog(`captured ${config.label} roll`, { actor: actor.name, total });
      if ( !Number.isFinite(total) ) return;
      dvSocket.executeAsGM(socketTypes.result, {
        ...config.requestPayload(target),
        userId: game.user.id,
        actorId: actor.id,
        actorName: actor.name,
        total
      });
    };
    Hooks.on("pf1ActorRollSkill", handler);
    try {
      await actor.rollSkill(skillKey);
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch ( err ) {
      console.error(`${MODULE_ID} | ${config.label} roll failed`, err);
    } finally {
      Hooks.off("pf1ActorRollSkill", handler);
    }
  }

  /* ---------- GM: adjudicate (via socketlib executeAsGM) ---------- */

  // Regular function (not arrow): socketlib binds the verified sender on `this`.
  async function onResult(payload = {}) {
    // Trust socketlib's verified sender (this.socketdata.userId), NEVER the
    // payload's claimed userId/actor: the result is honored only for the actual
    // sender, and only if that sender is an eligible roller — so a player cannot
    // forge a result for, or act on behalf of, another user, and attribution is
    // derived from the verified actor. The roll `total` is still client-reported
    // (Foundry has no server-side dice), so an invited roller could fudge their
    // own number, the same as any roll; they cannot forge for anyone else.
    const sender = game.users.get(this?.socketdata?.userId);
    const actor = sender ? actorForUser(sender) : null;
    const target = config.readTarget(payload);
    const total = payload.total;
    if ( !actor || !config.targetValid(target) || !Number.isFinite(total) ) return;
    dlog(`on${config.label}Result (socketlib)`, { ...payload, userId: sender.id, total, activeGM: isActiveGMClient() });
    const gate = config.gate.get(target);
    if ( !gate || (gate.state !== config.gate.activeState) ) return;
    const dc = config.dc.get(target);                          // null unless active GM
    if ( dc === null ) {
      ui.notifications?.info(game.i18n.format(i18n.resultNoDC, { actor: actor.name, total }));
      return;
    }
    if ( total >= dc ) {
      const round = game.combat?.round ?? null;
      await config.onSuccess(target, sender.id, { actorId: actor.id, actorName: actor.name, round, source: config.source });
      ui.notifications?.info(game.i18n.format(i18n.resultSuccess, { actor: actor.name, total }));
    } else {
      ui.notifications?.info(game.i18n.format(i18n.resultFail, { actor: actor.name, total }));
    }
  }

  /* ---------- socketlib registration ---------- */

  /** Register this broker's two handlers on the shared socket. Call on socketlib.ready. */
  function registerSocket() {
    const socket = ensureSocket(config.socketMissingMsg);
    if ( !socket ) return;
    socket.register(socketTypes.request, onRequest);
    socket.register(socketTypes.result, onResult);
    dlog(`${config.label} socketlib handlers registered`);
  }

  return { registerSocket, openRequestDialog, actorForUser, eligibleUsers };
}
