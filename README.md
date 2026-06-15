# PF1.5 Discovery Veil

Skill-gated discovery tools for Foundry VTT `13.350` + PF1.

Two related table workflows:

- **Hidden creature discovery (live, 0.2.0):** the GM marks a creature *undetected*; players who have personally spotted it (or after a manual global reveal) can see it, while others cannot. The GM always sees the true token.
- **Spell identification (planned):** non-player spellcasting is shown to players as generic casting until a player succeeds at Spellcraft.

## Design Posture

This module treats discovery as table-facing presentation control, not adversarial anti-cheat security. Anything that must stay truly secret from players lives only on the active GM client and is never written into world/user settings, actor/token/scene/combatant flags, chat messages, or socket payloads.

## Perception Gate (0.2.0)

- GM-only Token-HUD controls: **Mark Undetected**, **Manage who has spotted this**, **Reveal to all players**, **Clear discovery gate**.
- The base hide uses Foundry's native token `hidden` flag (the GM still sees it). The module records the token's prior hidden state and only restores it on clear/reveal — it never unhides a token you had already hidden for another reason.
- Spotted players see the creature via a per-client display override; the public registry stores only safe state (gate existence, who has spotted, prior-hidden/ownership flags) — never hidden DCs or identities.
- Enable in **Manage Modules**, then turn on the **"Enable Perception Reveals"** setting.

## Perception Roll Requests (0.3.0)

- On an undetected token the GM gets a **"Request a Perception check"** control: set a hidden DC (kept on the GM client only) and pick which players to ask.
- Each chosen player gets a prompt to roll Perception. Their roll total is relayed to the active GM, who compares it to the hidden DC and — on success — marks them spotted (`source: perception`). The DC never leaves the GM, and there is no automatic global reveal.
- Eligibility: any player with an assigned, player-owned character (Perception is usable untrained).

## Current Status

Version `0.3.0`: Perception Gate (0.2.0, runtime-verified two-client) **plus** Perception roll requests (0.3.0, **candidate — runtime verification pending**, see `docs/0.3.0-RUNTIME-VERIFY.md`). Spellcasting recon (0.4.0) is the next milestone. See `docs/PLAN.md`, `docs/0.3.0-PROBE.md`, and `docs/SECURITY_AND_PRIVACY.md`.

## Module Name

Folder/module id: `pf15-discovery-veil` · Human-facing title: **PF1.5 Discovery Veil**
