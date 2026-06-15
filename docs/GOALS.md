# Goals and Non-Goals

## Primary Goal

Create a reusable PF1/PF1.5 discovery module that helps the GM control when players learn about hidden creatures and non-player spellcasting.

## User Experience Goals

- Preserve uncertainty at the table without slowing play to a crawl.
- Let successful characters receive personal information before the whole party does.
- Keep the GM in control of global reveal.
- Make hidden/unknown states visible and manageable to the GM.
- Avoid asking Michael to remember every pending hidden DC manually.

## Technical Goals

- Use a shared discovery-gate model for Perception and Spellcraft.
- Keep GM-only secrets out of replicated data.
- Use active-GM broker patterns for hidden DCs and hidden spell identities.
- Keep public state safe enough to replicate.
- Prefer presentation-layer masking over actor/token document mutation.
- Probe PF1 hook payloads before building automation.

## Non-Goals

- This module does not enforce perfect anti-cheat secrecy against devtools.
- This module does not replace Foundry's vision engine.
- This module does not automate stealth, invisibility, blindsense, scent, tremorsense, or special senses in the first pass.
- This module does not decide PF1/PF1.5 table rulings that Michael has not approved.
- This module does not belong inside `baphomet-utils`; it is adjacent because it is table-presentation and discovery focused.

## Initial Build Order

1. Perception manual gate.
2. Perception roll request/capture.
3. Spellcasting hook reconnaissance.
4. Spellcraft identification gate.
5. Shared GM panel.
