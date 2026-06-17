# PF1.5 Discovery Veil Roadmap

This module combines two related workflows:

- Perception-gated discovery of hidden enemies.
- Spellcraft-gated identification of non-player spellcasting.

Both workflows should use a shared discovery-gate architecture where possible, but each milestone must remain independently testable.

## Naming

Folder/module id: `pf15-discovery-veil`

Human-facing title: `PF1.5 Discovery Veil`

Reasoning: the module is not only "skills reveal things"; it creates a veil between what the GM knows, what a player has personally detected, and what the party has globally revealed.

## Design Principles

- GM secrets stay on the active GM client.
- Player-facing state may say that a gate exists, who has succeeded, and whether something is globally revealed.
- Player-facing state must not contain hidden DCs, hidden token identities, hidden spell names, spell descriptions, caster plans, or GM notes.
- Personal reveal is a soft presentation layer, not anti-cheat secrecy.
- Global reveal remains a manual GM action unless a later spec explicitly changes that.
- One successful player/PC does not automatically reveal globally. The GM decides when the party has communicated enough to reveal.
- Build Perception first; it is lower risk than spell-card interception.

## Milestone 0.1.0 - Scaffold

Status: scaffolded.

Goals:

- Foundry manifest.
- ESM entrypoint.
- Settings registration.
- Public registry placeholder.
- Client-scope private store placeholder.
- Roadmap, goals, security notes, and Claude handoff.

Non-goals:

- No token hiding.
- No spell masking.
- No roll prompts.
- No actor reads.
- No chat interception.

## Milestone 0.2.0 - Perception Gate MVP

Goal: allow the GM to mark a token as personally undetected, then reveal it only to players/PCs who have succeeded at Perception.

Expected features:

- GM-only token HUD control: mark/unmark "Undetected".
- Public registry entry keyed by `sceneId:tokenId`.
- Personal spotted map keyed by user id or actor id; exact keying must be decided before implementation.
- GM always sees true token.
- Unsuccessful players do not see the token through module-controlled presentation surfaces.
- Successful players see the token personally.
- GM control to reveal globally.

Required probes:

- Token canvas draw/refresh hooks in Foundry 13.350.
- Combat tracker row visibility and rendering.
- Whether hiding the canvas token presentation-only is sufficient for the intended table workflow.
- Whether Foundry hidden tokens should be used as the authoritative base state.

Acceptance sketch:

- GM marks an enemy undetected.
- Player A fails Perception and does not see it.
- Player B succeeds and sees it.
- GM sees both players' detection status.
- GM clicks "Reveal Globally"; all players see it.

## Milestone 0.3.0 - Perception Roll Requests

Goal: let the GM request or trigger Perception checks from eligible player characters and record outcomes.

Expected features:

- GM prompt to request Perception from selected/all relevant PCs.
- Capture PF1 skill roll totals.
- Compare against hidden GM-side DC.
- Update personal spotted state on success.

Required probes:

- PF1 Perception skill key and rank path.
- `actor.rollSkill(skillKey, options)` behavior for player-owned actors.
- `pf1ActorRollSkill(actor, chatMessage, skillKey)` payload and timing.
- Socket request flow for player-side rolls, if needed.

## Milestone 0.4.0 - Spellcasting Recon

Goal: characterize PF1 spellcasting chat and hook behavior before any masking is implemented.

Expected probes:

- Does `pf1PreActionUse(actionUse)` reliably identify spell casts before PF1 creates chat output?
- What fields reveal spell name, spell item id, caster actor, action id, and activation type?
- Can player-facing spell chat be suppressed/replaced without leaking the original spell card?
- Does PF1 generate multiple chat messages per spell?
- What is the Spellcraft skill key and actor rank path? The installed PF1 lang file indicates `PF1.SkillSpl = Spellcraft`, so `spl` is likely, but this still needs live confirmation.

Non-goal:

- Do not implement spell masking until this milestone has a written probe report.

## Milestone 0.5.0 - Spell Identification MVP

Goal: for non-player spellcasting, players initially see a generic casting notice until someone succeeds at Spellcraft.

Expected features:

- Detect non-player spell cast.
- Prevent full spell details from entering player-visible chat.
- Post generic player-facing message: "A spell is being cast."
- Store hidden spell identity/details only on the active GM client.
- Request Spellcraft from eligible PCs.
- On success, reveal spell identity/description according to GM-approved rules.

Open design questions:

- Which casters count as "non-player": NPC actors only, hostile disposition, non-owner actors, or GM-configurable?
- Is the reveal party-wide after one success, or personal until communicated?
- Does the module reveal only name/school, or the full spell card/description?
- Should already-public save/damage cards remain public while the spell identity stays masked?
  **Partially answered in 0.7.0** (see below): an opt-in setting surfaces a non-identifying
  save/attack/damage line on the generic card; full save/damage *cards* remain withheld until
  identification.

## Milestone 0.6.0 - Shared Discovery UI

Status: implemented (`scripts/discovery-panel.mjs`). GM-only ApplicationV2 panel,
opened from a token scene-control button or the configurable keybinding.

Goal: provide a GM panel for active discovery gates.

Delivered features:

- Current undetected tokens (per scene), with hidden Perception DC shown only on
  the active GM client.
- Current masked spell casts, with the true name/school/DC shown only on the
  active GM client (the generic label + "identity on active GM's client"
  otherwise).
- Per-player/per-PC success status (spottedBy / identifiedBy attribution).
- Buttons reusing the existing HUD/card actions: Manage spotted, Request check
  (Perception / Spellcraft), Reveal to all, Focus, Clear.
- Live refresh on public-registry change (a player's successful roll updates the
  panel without a manual refresh) via the updateSetting hook.

Privacy: the list is built from the SAFE public registry; secrets are read only
through the active-GM-gated getters (fail closed) and never written into any
data-* attribute. The panel is GM-only; players cannot open it.

## Milestone 0.7.0 - Stripped public spell mechanics (opt-in)

Status: implemented (`scripts/spell-identification.mjs` `strippedEffectLabel`). Runtime-verified
(`docs/0.7.0-RUNTIME-VERIFY.md`).

Goal: let players know what a masked non-player spell DOES (so they can react) without revealing
its identity — the conservative slice of the 0.4.0 probe's "stripped-mechanics re-post" option.

Delivered:

- New opt-in world setting `spellPublicEffect` ("Show Masked Spell Effect"), OFF by default.
- When on, the generic masked-spell card gains a non-identifying effect line surfacing ONLY the save
  type (Fortitude/Reflex/Will), whether it is a spell attack, and whether it deals damage.
- NEVER surfaces the spell name, school, save DC, or damage type/amount. The hidden identity still
  lives only in the active-GM private store (the 0.5.0 invariant is untouched).

Deferred: re-posting the full save/damage *cards* (with identity stripped) — higher leak surface and
more work; the 0.7.0 line is the minimal, clearly-safe disclosure.

## Deferred

- True anti-cheat secrecy for scene/token data already delivered to players.
- Automated tactical rulings beyond "success reveals".
- Vision/cone/range automation.
- Automatic global reveal when a player speaks.
- v14 compatibility claims before a v14 runtime probe.
