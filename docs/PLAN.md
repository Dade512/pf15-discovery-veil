# Implementation Plan — pf15-discovery-veil

Date: 2026-06-14 · By: Claude (Opus 4.8). Companion to `ROADMAP.md` / `GOALS.md` /
`ARCHITECTURE.md` (those stand). This turns the roadmap into a sequenced, de-risked build plan
with testable goals, grounded in `RECON_FINDINGS.md`. Reading order: Decisions I Need ->
Strategy -> Architecture -> Milestones -> Risks.

## A. Decisions — DECIDED 2026-06-15 (Michael approved all recommendations below)

**Locked choices:** (1) personal keying = **user id**; (2) Perception hide = **native `hidden` flag as the base + show-to-spotted override** (confirm via the 0.1.1 spike before finalizing); (3) first surface = **canvas, fail-safe to tracker-only**; (4) "non-player caster" = **actors not owned by any player**; (5) spell reveal depth = **name + school first**; (6) one success = **personal reveal**, with **global reveal staying a manual GM action**. The per-item detail below is retained for rationale.

1. **Personal keying — by USER id or by PC/ACTOR id?** Recommend **USER id** for the
   presentation layer v1 (the person at the screen sees / doesn't see). "Which character
   perceived it" is per-actor in fiction, but the display is per-user; actor-id keying can be
   layered on later.
2. **Perception base-hide mechanism (final pick after the 0.1.1 spike):** (A) pure presentation
   per-client `visible` override, or (B) Foundry's native `hidden` flag as the base
   "invisible to players" state + a presentation override to SHOW it to spotted players.
   Recommend **B** if you accept one standard-visibility-flag write (robust); else **A** (no
   document writes, but more fragile against the vision engine).
3. **First discovery surface — canvas + combat tracker, or tracker-first?** Recommend pursuing
   the **canvas** (higher value for hidden enemies) but **failing safe to tracker-only** if the
   spike shows canvas per-client hiding is fragile.
4. **Spellcraft "non-player caster" definition:** NPC actors only / hostile disposition /
   actors not owned by any player / GM-configurable. Recommend **actors not owned by any
   player** (GM-controlled) as the default, made configurable later.
5. **Spell reveal depth on success:** name + school only, or full spell card/description?
   Recommend **name + school first**; full card later.
6. **Confirm (already in the roadmap, just verifying):** one PC success = **personal** reveal to
   that roller; **global** reveal stays a **manual GM action**. Confirming, not changing.

## B. Build strategy

- **Recon/spike first**, per the handoff. Source recon is done (`RECON_FINDINGS.md`); two
  runtime spikes remain before any feature code: per-client token visibility, and the
  spell-cast hook (`pf1PreActionUse`) timing/fields.
- **Perception before Spellcraft** (lower risk; no chat interception).
- **Shared discovery-gate architecture:** public registry (replicated, safe state only) +
  client private store (GM secrets, localStorage) + active-GM broker (socket) that compares
  rolls to hidden DCs and broadcasts only public results.
- **Every milestone:** GM-seat + player-seat (post-reload) test + a privacy audit (no hidden
  DC/name on any replicated surface) + fail-closed when no active GM / no private store.
- **Reuse identity-mask's proven patterns:** world-setting `onChange` cross-client sync,
  `renderCombatTracker` DOM mutation on fresh per-render nodes, `drawToken`/`refreshToken`
  hooks, DialogV2 UI, single-resolver routing.

## C. Architecture made concrete (extends ARCHITECTURE.md)

- **Public registry** = the existing `publicRegistry` world setting
  `{schemaVersion, perception:{}, spellcasting:{}}`. Write rules: GM-only; only safe fields
  (state label, `spottedBy`/`identifiedBy` id map, generic `publicLabel`, global-reveal flag).
  `onChange` re-renders affected surfaces on all clients (no socket needed for public state).
- **Private store** = the existing `privateStore` client setting (localStorage, per-browser),
  namespaced by `game.world.id`. Holds hidden DCs, true spell identity, original chat payload,
  GM notes. Read/written ONLY by the active-GM client. Fails closed if `game.world.id` is
  missing or the active GM lacks the secret.
- **Active-GM broker:** a player submits a roll result via socket -> the single active "primary
  GM" (**`game.users.activeGM`** (Foundry's single designated active GM — the canonical authority and, in this single-GM table, the machine that owns the private store; confirm the getter at build) per Lyra F-5) reads its private store, compares to the hidden DC, and on success writes the
  public `spottedBy`/`identifiedBy`. Only public results leave the GM. If no GM is online ->
  fail closed (warn the requesting player; reveal nothing).
- **Socket channel:** `module.pf15-discovery-veil`. Payloads carry only ids + roll totals +
  public results — never DCs or names.

## D. Milestones (refined, testable)

### 0.1.1 — Recon spikes (gate; NO feature code)
Goal: resolve the two runtime unknowns so 0.2.0 / 0.4.0 build on facts.
- Token-visibility spike: in a scratch scene, test whether reapplying `token.visible=false`
  (and/or `renderable`) on `refreshToken` for a non-controlling user reliably hides a token
  without breaking targeting/hover/vision; compare against the native-`hidden`-as-base approach.
  Written verdict -> picks Decision #2.
- `pf1ActorRollSkill` payload/timing spike (console): capture args + relationship to the chat
  card.
Acceptance: a short probe report committed; no token/chat/actor mutation in normal play.

### 0.2.0 — Perception Gate MVP
Goal: GM marks a token undetected; it is hidden from un-spotted players, shown to spotted
players + GM; GM can reveal globally.
- GM-only Token HUD control: mark/unmark "Undetected"; "Reveal Globally".
- Public registry `perception["sceneId:tokenId"] = {state:"undetected"|"globallyRevealed",
  spottedBy:{<key>:true}}`.
- Hidden DC (if used at this stage) -> private store only.
- Rendering layer applies the spike-chosen hide/show per client (re-applied on draw/refresh).
- Manual GM "mark <player/PC> spotted" control (no rolls yet).
Acceptance: GM marks enemy undetected -> player A (not spotted) does not see it on the chosen
surface(s); GM marks player B spotted -> B sees it; GM sees both + status; "Reveal Globally"
shows it to all; player reload preserves state; NO hidden data on any replicated surface; no
console errors; fails closed with no active GM.

### 0.3.0 — Perception roll request/capture
Goal: GM requests Perception from eligible PCs; success auto-marks spotted via the broker.
- Eligibility = `actor.system.skills.per.rank >= 1` (confirm path at runtime) + ownership.
- GM prompt -> request roll from selected/all eligible PCs.
- Capture total via `pf1ActorRollSkill` (or `actor.rollSkill` return); broker compares to hidden
  DC; on success write `spottedBy`.
Acceptance: eligible PC rolls; >=DC -> personally sees the token; <DC -> still hidden; DC never
leaves the GM; works for player-owned actors; fails closed without active GM.

### 0.4.0 — Spellcasting recon (probe report ONLY; no masking)
Goal: characterize `pf1PreActionUse` + spell chat before any interception.
- Confirm the hook fires before the player-visible card; capture fields (spell name/uuid/caster/
  activation); count messages per cast; test whether the player card can be suppressed/replaced
  without leaking or deleting others' messages.
Acceptance: a written probe report; explicitly NO masking code.

### 0.5.0 — Spell Identification MVP
Goal: non-player casts show players a generic notice until someone succeeds at Spellcraft.
- Detect a non-player cast (Decision #4); suppress/replace the player card with "A spell is
  being cast."; store the true identity in the private store; request Spellcraft from eligible
  PCs; on success reveal per Decision #5 (personal -> GM globalizes).
Acceptance: pre-success player chat has NO spell name/description anywhere in the message data;
success reveals approved info; failure keeps it masked; fails closed without active GM; no
hidden identity on replicated surfaces; PF1 save/damage mechanics unbroken.

### 0.6.0 — Shared Discovery UI
Goal: a GM panel for active gates (undetected tokens + masked casts, per-PC status,
personal/clear/global-reveal buttons, safe debug view).
Acceptance: the panel reflects live state; all reveal actions work; the debug view leaks nothing
to players.

## E. Risks & gates

- **Per-client token visibility is the biggest unknown** (the vision engine recomputes
  `visible` each refresh). Mitigation: the 0.1.1 spike + fail-safe to tracker-only.
- **Spell-chat interception:** never delete other users' messages; intercept at creation /
  substitute. Probe-gated (0.4.0).
- **Active-GM broker:** define the deterministic primary-GM pick; fail closed if none online.
- **Privacy gate every release** (`SECURITY_AND_PRIVACY.md`): player-seat reload + inspect
  settings/flags/chat/sockets for hidden DCs/names.
- **Versioning/release:** mirror identity-mask (local-first; version = git tag; runtime closeout
  before tag; deployment on hold). Not a git repo yet — init when you are ready.

## F. Done this session (2026-06-14)

- Read the full scaffold (manifest, settings, state, all docs).
- Source recon -> `RECON_FINDINGS.md` (skill keys `per`/`spl`, `rollSkill` signature, both hooks
  exist, client-scope = localStorage private store confirmed, token-visibility model).
- This plan. No code changed; no live session driven.

Next: Michael answers section A; then run the 0.1.1 spikes -> 0.2.0.

## G. Audit-driven refinements (Lyra / Codex, 2026-06-15 — adopted)

Lyra independently re-verified the source claims (client `localStorage`, `per`/`spl`, both hooks, the visibility-refresh recompute, `node --check`) and accepted the 0.1.1 runtime findings as consistent without replaying them. Adopted refinements, binding for 0.2.0:

- **F-3/F-4 — Guarded state API FIRST (no direct `game.settings.set` from feature code).** Before any HUD/render work, build the A-017-style state layer: `getCurrentWorldIdOrNull()`, `readPrivateStoreRoot()`, `readPrivateWorldBucket()`, `writePrivateWorldBucket()` (world-partitioned by `game.world.id`, deep-clone before write, preserve other worlds' data, fail closed if no world id), `ensureActiveGMClient(context)`, and `assertNoSecrets(payload, context)`. The public-registry writer must: reject unknown schema versions (never rebuild newer data), deep-clone before mutation, use the `sceneId:tokenId` key format, log/warn on malformed entries, and run `assertNoSecrets` to strip/reject forbidden keys (`dc`, `spellName`, `spellItemUuid`, `originalChatData`, `gmNotes`, `trapName`, any future private field).
- **F-5 — Broker uses `game.users.activeGM`** (not a custom lowest-user-id pick); fail closed if it is absent or if the active GM's private store lacks the secret. (Updated in section C.)
- **F-6 — Native-`hidden` ownership tracking (the key 0.2.0 design lock).** "Mark Undetected" writes `hidden=true`, but the module must record the token's PRIOR `hidden` value and that the module owns the hide — e.g. in the public registry entry: `priorHidden: <bool>`, `hiddenByModule: true`. "Clear gate" / "Reveal Globally" restores `hidden` to its prior value and must NOT blindly unhide a token the GM had already hidden for another reason. This is a tracked, reversible write to the standard visibility field (consistent with approved Decision #2), not pure presentation.
- **F-7 — `spottedBy` keeps safe actor attribution.** The render allowlist stays keyed by `userId`, but each entry also stores public-safe attribution for the later GM panel: `spottedBy["<userId>"] = { actorId, actorName, round, source: "manual" | "perception" }` (actorName = the player-known PC name; nothing secret).
- **F-1/F-2 — Status clarity:** the executable code stays `0.1.0` (the 0.1.1 spike added no feature code); the README gets a planning-status note. The module/manifest version bumps only when real feature code lands (0.2.0).
- **F-8 — Spellcraft stays gated to 0.4.0** (no spell-card interception sneaking into Perception work). Reaffirmed.

Build order (Lyra-aligned): guarded state API -> GM HUD controls (mark undetected / clear gate / reveal globally) -> native-`hidden` base with prior-state preservation -> render show-override on draw/refresh for spotted users -> manual "mark user spotted" -> GM/player-seat privacy reload check -> only then roll automation (0.3.0).
