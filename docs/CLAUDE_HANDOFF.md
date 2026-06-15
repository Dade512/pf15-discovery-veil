# Claude Handoff - PF1.5 Discovery Veil

## Mission

Build the module incrementally from this scaffold. Do not jump straight to full automation.

Recommended first implementation target:

> Perception Gate MVP: GM marks a token undetected; successful players see it personally; GM can reveal globally.

## Rules

- Do not implement spell masking before a PF1 spellcasting recon pass.
- Do not store hidden DCs or spell names in replicated settings/flags/chat.
- Do not assume `config:false` is private.
- Do not mutate Actor, TokenDocument, or spell item data for presentation.
- Do not claim v14 compatibility without runtime evidence.
- Do not add code to `baphomet-utils` for this feature.
- Keep global reveal manual unless Michael explicitly approves automatic reveal.

## Probe Before Building

For Perception:

- Confirm PF1 Perception skill key.
- Confirm actor rank path for "at least 1 rank" eligibility.
- Confirm `actor.rollSkill(skillKey, options)`.
- Confirm `pf1ActorRollSkill(actor, chatMessage, skillKey)` timing and total extraction.
- Confirm token canvas and combat tracker presentation hooks.

For Spellcraft:

- Confirm Spellcraft skill key. Installed PF1 language text suggests `spl`, but live confirmation is required.
- Confirm actor rank path for "at least 1 rank" eligibility.
- Confirm whether `pf1PreActionUse(actionUse)` sees spell casts early enough.
- Confirm how PF1 creates spell chat cards and whether full spell details can be prevented from reaching player-visible chat.

## Suggested Implementation Sequence

1. State helpers with read/write/migration tests.
2. GM-only token HUD button for undetected/global reveal.
3. Rendering layer for personal token visibility.
4. Manual GM "mark player/PC spotted" control.
5. Perception roll request/capture.
6. Spellcasting recon report.
7. Spellcraft masking MVP.

## Verification Expectations

Each milestone should include:

- GM seat test.
- Player seat test after full reload.
- No hidden data in player-readable storage.
- No console errors.
- Clear failure behavior if no active GM or missing private store.
