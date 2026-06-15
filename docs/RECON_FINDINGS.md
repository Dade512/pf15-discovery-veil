# Recon Findings — pf15-discovery-veil

Date: 2026-06-14 · By: Claude (Opus 4.8), read-only source recon (no live session driven).
Sources: **PF1 system 11.11** at `V:\FoundryVTTData\Data\systems\pf1\pf1.js` (bundled);
**Foundry 13.350** client at `S:\FoundryVTT\resources\app\client`. This answers the
`CLAUDE_HANDOFF.md` "Probe Before Building" list at the SOURCE level. Items marked
**RUNTIME-PENDING** still need a live console/seat confirmation before being built on — no
runtime claims are made here.

## Confirmed from source

| Probe | Finding | Evidence |
|-------|---------|----------|
| Perception skill key | `per` -> `"PF1.SkillPer"` ("Perception") | `pf1.js` (`per:"PF1.SkillPer"`) |
| Spellcraft skill key | `spl` -> `"PF1.SkillSpl"` ("Spellcraft") | `pf1.js` (`spl:"PF1.SkillSpl"`) |
| Runtime config path | `pf1.config.skills` (key->label map) | identity-mask reads `globalThis.pf1?.config?.skills` in shipping code |
| Roll API | `actor.rollSkill(skillId, options = {})`; call sites pass `{token, ...}` | `pf1.js` (`rollSkill(e,t={})`; call sites `rollSkill(i,{token...})`) |
| Roll hook exists | `pf1ActorRollSkill` is emitted by the system | `pf1.js` (string present) |
| Spell-cast hook exists | `pf1PreActionUse` is emitted by the system | `pf1.js` (string present) |
| **Private store mechanism** | Foundry maps the **CLIENT** setting scope to `window.localStorage` — per-browser, never sent to the server or other clients | `client/helpers/client-settings.mjs:43` (`[CONST.SETTING_SCOPES.CLIENT, window.localStorage]`) |
| Token visibility model | `token.visible = token.isVisible` is reassigned each refresh; `isVisible` is computed by the vision engine via `canvas.visibility.testVisibility(...)` | `token.mjs:1241`, `:618`, `:634` |

**Key implication of the private-store finding:** the scaffold's `privateStore`
(`scope:"client"`, settings.mjs:42) is the *correct* non-replicating GM-secret store. A
player's own `privateStore` is just their localStorage and is never read by anyone else; the
active-GM broker reads ITS OWN client store. This confirms the handoff's warning that
`config:false` != private — privacy comes from `scope:"client"`, not from `config:false`.

## Open probes — RUNTIME or SPIKE required (do NOT build past these)
> **Update 2026-06-15:** probes 1 and 4 below are RESOLVED by the 0.1.1 spike — see `0.1.1-SPIKE-REPORT.md`. Probe 3 is confirmable while building 0.3.0; probes 2 and 5 are the 0.4.0 spell-recon milestone.

1. **`pf1ActorRollSkill` payload & timing** — exact arguments (does it carry the roll total / a
   ChatMessage?), and whether it fires before or after the skill chat card is created. Needed
   for roll capture (0.3.0). Confirm live (GM console + a player roll).
2. **`pf1PreActionUse` payload & timing** — does it fire BEFORE PF1 emits the player-visible
   spell card? What fields expose spell name / item uuid / caster / activation type? Does one
   cast emit multiple chat messages? Gates ALL of Spellcraft (0.4.0 is a dedicated probe
   milestone for exactly this — no masking before its written report).
3. **Skill rank path for ">=1 rank" eligibility** — PF1 standard is
   `actor.system.skills.<key>.rank` (compound skills use `subSkills`; Perception/Spellcraft are
   not compound). Confirm the exact path + the table's definition of "eligible" at runtime.
4. **Per-client token visibility override (THE 0.2.0 pivot)** — because `token.visible` is
   recomputed from the vision engine each refresh, a presentation-only "show this token to
   spotted player B but not un-spotted player A" requires re-applying an override on every
   `refreshToken`/`drawToken` (the hook pattern identity-mask uses for nameplates). The SPIKE
   must determine: (a) is setting `token.visible`/`renderable` per client robust and free of bad
   side effects (targeting, hover, vision recompute stomping it)? or (b) is it cleaner to use
   Foundry's **native `hidden` flag** as the base "invisible to players" state (a supported,
   robust hide the GM still sees) and only *override to SHOW* for spotted players? Option (b)
   trades one small standard-visibility-flag write for robustness. Design decision for Michael —
   see `PLAN.md`.
5. **Player-facing spell-chat suppression (Spellcraft)** — whether the original spell card can be
   prevented from reaching players (intercept at creation/render, substitute a generic notice)
   WITHOUT deleting other users' messages or leaking the original. Probe `preCreateChatMessage` /
   `renderChatMessageHTML` in 0.4.0.

## Notes
- Both Foundry (13.350) and PF1 (11.11) match the versions identity-mask runs against, so
  cross-module API knowledge (drawToken/refreshToken hooks, world-setting `onChange` sync,
  DialogV2, renderCombatTracker) transfers directly.
- No API here is invented: every built-on call is cited above or flagged RUNTIME-PENDING.
