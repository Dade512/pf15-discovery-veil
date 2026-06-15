# Lyra Audit - pf15-discovery-veil

Date: 2026-06-15  
Auditor: Codex/Lyra  
Scope: Review Claude's scaffold, docs, source-recon claims, and 0.1.1 spike notes. No feature code was changed.

## Executive Summary

Claude's setup is directionally sound and appropriately cautious. The module is still a scaffold in code: it registers settings, exposes a small `globalThis.pf15DiscoveryVeil` status object, and does not mutate tokens, actors, chat, or PF1 data. The docs correctly separate public replicated state from GM-private client-scope state, and the planned active-GM broker pattern matches the confidentiality lessons from `baphomet-utils` A-017.

I verified the main source-level claims against local files where possible:

- `scope: "client"` settings map to `window.localStorage` in Foundry 13.350 client settings.
- PF1 source contains the Perception key `per` and Spellcraft key `spl`.
- PF1 source contains `pf1ActorRollSkill` and `pf1PreActionUse`.
- Foundry token visibility refresh recomputes `token.visible = token.isVisible`, so any per-client show override must be reapplied after refresh.
- The current scaffold scripts pass `node --check`.

The one important caveat: some 0.1.1 claims are runtime-spike claims from Claude/Michael's live session. I can assess that the written conclusions are plausible and consistent with source, but I did not independently replay the live GM/player-seat test in Foundry during this audit.

## Files Reviewed

- `module.json`
- `README.md`
- `scripts/main.mjs`
- `scripts/settings.mjs`
- `scripts/state.mjs`
- `scripts/module-constants.mjs`
- `lang/en.json`
- `styles/discovery-veil.css`
- `docs/CLAUDE_HANDOFF.md`
- `docs/RECON_FINDINGS.md`
- `docs/0.1.1-SPIKE-REPORT.md`
- `docs/PLAN.md`
- `docs/GOALS.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/RUNTIME_CHECKLIST.md`

## Verification Notes

### Confirmed

1. The code is scaffold-only.

   `main.mjs` only registers settings on `init`, initializes the state API on `ready`, and logs readiness. `state.mjs` only writes:

   ```js
   globalThis.pf15DiscoveryVeil = {
     moduleId: MODULE_ID,
     version: "0.1.0",
     status: "scaffold-only"
   };
   ```

   There are no hooks yet for token HUD, canvas, chat, PF1 rolls, sockets, actor data, or token data.

2. Public/private storage shape is conceptually correct.

   `settings.mjs` registers:

   - `publicRegistry`: `scope: "world"`, player-readable, safe only if it never contains secrets.
   - `privateStore`: `scope: "client"`, `config: false`, per-browser local storage.

   This matches Claude's architecture. The docs are also correct that `config:false` is not privacy; `scope:"client"` is the privacy-relevant part.

3. Foundry client-scope setting claim is source-supported.

   Local Foundry 13.350 source at `S:\FoundryVTT\resources\app\client\helpers\client-settings.mjs` maps `CONST.SETTING_SCOPES.CLIENT` to `window.localStorage`.

4. PF1 skill/hook names are source-supported.

   Local PF1 source at `V:\FoundryVTTData\Data\systems\pf1\pf1.js` contains:

   - `per:"PF1.SkillPer"`
   - `spl:"PF1.SkillSpl"`
   - `pf1ActorRollSkill`
   - `pf1PreActionUse`

   The file is bundled/minified, so line references are not meaningful, but fixed-string searches found the exact strings.

5. Token visibility refresh concern is source-supported.

   Local Foundry client token source at `S:\FoundryVTT\resources\app\client\canvas\placeables\token.mjs` includes `get isVisible()`, `canvas.visibility.testVisibility(...)`, and `_refreshVisibility()` assigning `this.visible = this.isVisible`. That supports Claude's conclusion that manual per-client `visible` overrides are temporary and must be reapplied after refresh.

6. Static syntax is clean.

   `node --check` passed for:

   - `scripts/main.mjs`
   - `scripts/settings.mjs`
   - `scripts/state.mjs`
   - `scripts/module-constants.mjs`

### Not Independently Replayed

The runtime claims in `docs/0.1.1-SPIKE-REPORT.md` are plausible and consistent with the source, but I did not independently drive a live Foundry GM/player session. Treat these as accepted handoff evidence unless Michael wants a second live runtime verification.

Specific runtime-only claims not replayed by me:

- `actor.rollSkill("per", { skipDialog: true })` posted one Perception chat message and suppressed the dialog.
- `pf1ActorRollSkill(actor, chatMessage, skillId)` delivered `ChatMessagePF` with readable `chatMessage.rolls[0].total`.
- Native hidden-token behavior plus player-side visible/mesh override behaved exactly as described in the spike.

## Findings

### F-1: Version/status docs are slightly out of sync

Severity: Low

`module.json`, `README.md`, `lang/en.json`, and `state.mjs` still describe the module as `0.1.0` scaffold-only. That is true of the executable code, but the docs now include a completed `0.1.1` runtime spike and say 0.2.0 is unblocked.

This is not a functional bug. It is a release/status clarity issue. If 0.1.1 is meant to be a docs/spike milestone, either:

- leave `module.json` at `0.1.0` and add a README note that the code remains 0.1.0 while docs include 0.1.1 spike results, or
- bump the module/docs status together when Michael decides the spike report should be a real module milestone.

### F-2: README understates the current planning state

Severity: Low

`README.md` says version `0.1.0` is scaffold-only and lists only the original scaffold pieces. It does not mention that Perception MVP is now unblocked by `0.1.1-SPIKE-REPORT.md`.

Recommended later cleanup: add a short "Current planning status" note pointing readers to `docs/0.1.1-SPIKE-REPORT.md` and `docs/PLAN.md`, while keeping clear that no runtime feature code exists yet.

### F-3: `privateStore` is registered, but no helper enforces world partitioning yet

Severity: Medium once feature work begins; harmless while scaffold-only

The docs correctly require `privateStore` to be partitioned by `game.world.id`, fail closed when unavailable, clone before write, preserve other worlds' data, and be active-GM-only. The current code only registers the setting; it does not yet provide helper functions that enforce those rules.

This is fine for 0.1.0, but the first implementation pass should not let feature code write directly to `game.settings.set(MODULE_ID, SETTINGS.privateStore, ...)`. Build a small state API first, modeled after the A-017 hidden task store pattern:

- `getCurrentWorldIdOrNull()`
- `readPrivateStoreRoot()`
- `readPrivateWorldBucket()`
- `writePrivateWorldBucket()`
- `ensureActiveGMClient(context)`
- `assertNoSecrets(payload, context)` for sockets/chat/public registry writes

### F-4: Public registry still needs a writer gate before any feature code

Severity: Medium once feature work begins; harmless while scaffold-only

`publicRegistry` is world-scope and therefore replicated. That is expected, but the project should avoid ad hoc writers. The docs say public state may contain only safe labels, gate ids, spotted/identified maps, and global reveal status.

Before 0.2.0 feature work, add a public registry writer that:

- rejects unknown schema versions rather than rebuilding newer data;
- strips or rejects forbidden keys such as `dc`, `spellName`, `spellItemUuid`, `originalChatData`, `gmNotes`, `trapName`, or any future private field;
- deep-clones before mutation;
- uses one clear entry key format, probably `sceneId:tokenId`;
- logs/warns rather than guessing on malformed entries.

### F-5: Active-GM selection should use Foundry's active GM where possible

Severity: Design caution

`PLAN.md` says the broker may use "a deterministic pick, e.g. lowest user id among connected GMs." The rest of the local module ecosystem, especially the A-017 pattern in `baphomet-utils`, uses `game.users.activeGM` as the single authority and fails closed when it is missing.

Recommendation: prefer `game.users.activeGM` for Discovery Veil too unless a live probe shows it is unsuitable. This keeps the active-GM private-store ownership story simple: the same machine that owns the private client store is the one allowed to adjudicate. A separate "lowest user id" rule risks selecting a GM who is online but does not have the relevant local private store.

### F-6: Native `hidden` base is sensible, but document-write consequences need explicit UX treatment

Severity: Design caution

The 0.1.1 spike's chosen path is: use Foundry's native token `hidden` flag as the base, then re-show only for spotted players with per-client runtime overrides. That is likely the robust path, but it is not purely presentation-only: marking a token undetected will write to the TokenDocument `hidden` field.

This can still be the right design. It just needs explicit 0.2.0 UX and safety rules:

- GM action "Mark Undetected" writes `hidden = true`.
- GM action "Clear/Reveal Globally" restores or intentionally updates `hidden`.
- The module should record whether it was responsible for hiding the token, so it does not accidentally unhide tokens the GM had already hidden for another reason.
- If a token was already hidden before being marked, clearing the Discovery Veil gate should not blindly reveal it.

This is the biggest design detail I would want locked before 0.2.0 implementation.

### F-7: Personal keying by user id is acceptable for presentation, but actor attribution should remain available

Severity: Design note

Michael approved user-id keying for the presentation layer. That is sensible for "what does this browser/user see?" But later Perception-roll workflows will still care which actor rolled.

Recommendation: key the actual render allowlist by `userId`, but store public-safe attribution alongside it when available:

```js
spottedBy: {
  "<userId>": {
    actorId: "<actorId>",
    actorName: "<safe display name>",
    round: 3,
    source: "manual" | "perception"
  }
}
```

This avoids later pain in the GM panel without making rendering depend on actor selection.

### F-8: Spellcraft remains properly gated

Severity: Good boundary

The docs correctly keep Spellcraft masking behind a dedicated 0.4.0 probe. Do not let 0.2.0/0.3.0 Perception work quietly add spell-card interception. PF1 spell cards are the higher-risk confidentiality surface because the original chat payload may already contain the name, description, save DCs, or item references.

## Suggested Next Build Shape

If Michael greenlights 0.2.0, I would build in this order:

1. Add state helpers only, with no UI: safe public/private read-write functions and forbidden-field assertions.
2. Add GM Token HUD controls: mark undetected, clear module gate, reveal globally.
3. Implement native hidden base carefully, preserving pre-existing hidden state.
4. Implement render-layer show override for spotted users on `drawToken` / `refreshToken` / visibility refresh.
5. Add manual "mark user spotted" control before any roll capture.
6. Run GM/player-seat reload privacy check before touching roll automation.

## Bottom Line

Claude's setup is a good foundation. The strongest parts are the privacy model, the recon-before-automation discipline, and the explicit separation between Perception and Spellcraft milestones.

The main thing I would tighten before real feature code is state ownership: do not let future code write directly to settings. Put the public registry and private store behind small guarded APIs first, and decide exactly how to preserve/restore a token's pre-existing native `hidden` state.
