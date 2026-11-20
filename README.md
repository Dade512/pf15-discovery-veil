# PF1.5 Discovery Veil

Skill-gated discovery tools for Foundry VTT `13.350` or later (verified on `13.351`) + PF1.

Two related table workflows:

- **Hidden creature discovery (live, 0.2.0):** the GM marks a creature *undetected*; players who have personally spotted it (or after a manual global reveal) can see it, while others cannot. The GM always sees the true token.
- **Perception roll requests (live, 0.3.0):** the GM can ask chosen players to roll Perception against a hidden DC; a success marks that player as having spotted the creature, and the DC never leaves the GM.
- **Spell identification (live, 0.5.0):** hostile non-player spellcasting (configurable since 0.7.8) is shown to players as a generic "a spell is being cast" notice; the true identity stays on the active GM's client until a player succeeds at a Spellcraft check, after which the GM can reveal it.
- **Stripped public effect (0.7.0; on by default since 0.7.8):** the masked spell card can show a non-identifying save / spell-attack / deals-damage cue — never the name, school, DC, or amounts.
- **Shared discovery panel (0.6.0):** a GM-only window listing every active gate — undetected creatures and masked spell casts — in one place, with per-player status and the reveal/request/clear actions consolidated.

## Installation

In Foundry, open **Configuration → Add-on Modules → Install Module**, paste this Manifest URL into the bottom field, and click **Install**:

```
https://github.com/Dade512/pf15-discovery-veil/releases/latest/download/module.json
```

This always installs the latest release, and the same URL drives Foundry's built-in update check, so future versions update in place.

**Requirements:** Foundry VTT `13.350` or later (verified on `13.351`), the Pathfinder 1 (`pf1`) system, and the [**socketlib**](https://foundryvtt.com/packages/socketlib) module (used for the Perception/Spellcraft roll relays — install and enable it too).

After installing, enable **PF1.5 Discovery Veil** in **Manage Modules**, then turn on the **"Enable Perception Reveals"** and/or **"Enable Spellcraft Reveals"** settings (both off by default).

## Design Posture

This module treats discovery as table-facing presentation control, not adversarial anti-cheat security. Anything that must stay truly secret from players lives only on the active GM client and is never written into world/user settings, actor/token/scene/combatant flags, chat messages, or socket payloads.

Whispers are private at the table, not from a browser console: Foundry 13 delivers every whisper to every connected client and only declines to draw it. Treat anything the module whispers (the Spellcraft reveal) as table-private.

## Perception Gate (0.2.0)

- GM-only Token-HUD controls: **Mark Undetected**, **Manage who has spotted this**, **Reveal to all players**, **Clear discovery gate**.
- The base hide uses Foundry's native token `hidden` flag (the GM still sees it). The module records the token's prior hidden state and only restores it on clear/reveal — it never unhides a token you had already hidden for another reason.
- Spotted players see the creature via a per-client display override; the public registry stores only safe state (gate existence, who has spotted, prior-hidden/ownership flags) — never hidden DCs or identities.
- **Combat (0.7.8):** an undetected creature's **initiative roll is posted GM-only** automatically, however it is rolled (pf1's dialog, skip-dialog, or "roll NPCs"); players see "*GM* privately rolled some dice". A combatant added **after** you mark the token is recorded too, so **Reveal to all** and **Clear** bring its tracker row back.
- **Limit:** a player who has spotted the creature sees the token, but **not its combat-tracker row**, until you Reveal to all. Foundry never sends a hidden combatant to a player's tracker.
- Enable in **Manage Modules**, then turn on the **"Enable Perception Reveals"** setting.

## Perception Roll Requests (0.3.0)

- On an undetected token the GM gets a **"Request a Perception check"** control: set a hidden DC (kept on the GM client only) and pick which players to ask.
- Each chosen player gets a prompt to roll Perception. Their roll total is relayed to the active GM, who compares it to the hidden DC and — on success — marks them spotted (`source: perception`). The DC never leaves the GM, and there is no automatic global reveal.
- Eligibility: any player who owns a player-owned character (assigned or merely owned — Perception is usable untrained).
- **One roll per request (0.7.9):** each request carries a one-use id for that player and that target. A roll answers only the request it came from; a result nobody asked for is ignored. The player sees "The GM received your roll." (never pass or fail). Open requests live in the GM's browser memory, so if the GM reloads, request again.

## Spell Identification (0.5.0)

- When a **hostile** creature **not owned by any player** casts a spell, the player-facing spell card is
  suppressed at creation (PF1 `pf1PreDisplayActionUse`) and replaced with a generic **"A spell is
  being cast."** notice. The real card is never created, so nothing is deleted and nothing leaks.
- The true identity (name, school, item uuid, level) and a hidden Spellcraft DC (**15 + spell
  level**, GM-overridable) live ONLY on the active GM's client. The GM sees the real spell + DC as a
  GM-only annotation on the card.
- The GM clicks **"Request Spellcraft"** to ask eligible players (a player-owned PC **trained in
  Spellcraft**, `spl.rank ≥ 1`). On a success the roller is privately told the spell's **name and
  school** (a whisper: only they and the GM see it in chat, but every connected client receives the
  message, so it is private at the table, not from a browser console); the GM can then reveal it to
  everyone.
- **Who gets masked (0.7.8):** the **"Mask Spells From"** setting picks the casters — **hostile
  creatures only** (default), hostile and neutral, or every non-player caster (the pre-0.7.8
  behaviour). Secret-disposition tokens count as hostile. Player-owned casters are never masked.
- **Limits:** masking happens only when a **GM's client** performs the cast. The generic card's
  speaker is the **true caster**, so pair this module with PF1.5 Identity Mask and **mask an unseen
  caster's identity before it casts**. A cast that is cancelled (for example by an item script)
  posts nothing; **Clear** in the Discovery panel also deletes that cast's generic card. A cast that
  posts no chat card (a macro's `chatMessage: false`, or a script call that hides chat) is not
  masked; pf1 shows nothing for it.
- **GM mechanics (0.7.9):** on the GM's screen the masked card also shows each attack's total and
  d20, a crit threat with its confirm roll, damage with its type, and the save DC when the spell has
  a save type. **Apply**, **Apply ½** and **Apply crit** apply the damage to your controlled
  tokens the way pf1's own Apply button does (Shift-click opens pf1's Apply Damage dialog). These numbers stay in the GM's private store; the card itself carries none,
  and there is no save button (players roll saves from their sheets).
- **Dice (0.7.9):** a masked cast's Dice So Nice dice roll for GMs only. The dice data still reaches
  every connected client, like a whisper, so it is hidden at the table, not from a browser console.
- **Spellcraft requests (0.7.9)** use the same one-use request ids and "The GM received your roll."
  notice as Perception requests.
- Enable the **"Enable Spellcraft Reveals"** setting (off by default).
- **Stripped public effect (0.7.0; on by default since 0.7.8):** **"Show Masked Spell Effect"** also shows
  players a non-identifying effect line on the generic card — the **save type**
  (Fortitude/Reflex/Will), whether it's a **spell attack**, and whether it **deals damage** — so they
  know what to brace for. The spell's **name, school, save DC, and damage amount are never shown.**
  On by default since 0.7.8; the save type narrows which spell it could be, so turn it off if your
  table would rather not have that hint.

## Shared Discovery Panel (0.6.0)

- A **GM-only** window listing every active discovery gate at once — undetected creatures (per scene)
  and masked spell casts — so the GM can run several gates without hunting through the canvas and chat.
- Open it from the **token scene-control button** (the clipboard icon) or the configurable
  **"Open Discovery Veil panel"** keybinding.
- Each row shows per-player status (who has spotted / identified) and reuses the existing actions:
  **Manage spotted**, **Request check** (Perception / Spellcraft), **Reveal to all**, **Focus**
  (pan to the token), **Clear**.
- Hidden DCs and true spell identities appear **only on the active GM's client** (read through the
  same active-GM-gated getters that fail closed elsewhere); the panel is built from the safe public
  registry and never writes a secret into the DOM. It refreshes live when a player's roll succeeds.

## Current Status

Version `0.7.9` (Foundry `13.351` / PF1 `11.11`):

- **Whose Roll It Was (0.7.9)** — the masked cast's numbers for the GM, and roll requests that
  answer only themselves:
  - **GM mechanics (TD-47):** the masked card shows the GM each attack, its damage and type, a
    crit threat, and the save DC (only when the spell has a save type), with **Apply**, **Apply ½**
    and **Apply crit** buttons that work like pf1's own Apply button (Shift-click for its dialog).
    Nothing new reaches players.
  - **Dice (TD-47):** a masked cast's Dice So Nice dice now roll for GMs only; before, every player
    watched them, coloured by damage type. A roll mode the GM already made blind or self is kept.
  - **No-card casts:** a cast that posts no chat card is no longer masked (it used to post a
    generic card anyway).
  - **Roll requests (TD-10):** each request carries a one-use id for its player and target, so a
    result nobody asked for is ignored and one roll can no longer answer two requests. The roll's
    total is read from the roll itself (the 800 ms capture window is gone). The player sees "The GM
    received your roll.", or "That roll request is no longer open" after a GM reload or a
    re-request.
  - **Docs/manifest:** the manifest's `verified` is now `13.351`; two stale code comments fixed;
    `.sh` files are checked out with LF endings.
- **What the Dark Rolls (0.7.8)** — ambush and cast-lifecycle fixes from the 2026-11-16 facts check:
  - **Initiative card (TD-45):** pf1's initiative dialog posted an undetected creature's roll
    **publicly under its true name**. It is now made GM-only automatically.
  - **Tracker rows (TD-45):** a combatant created after the mark was hidden by Foundry but never
    recorded, so **Reveal to all** left its tracker row hidden. Late combatants are now recorded and
    restored. A spotted player still doesn't get the row back before a global reveal (documented
    limit above).
  - **Caster scope (TD-46):** new **"Mask Spells From"** setting, **hostile only by default**.
    **Behaviour change on upgrade, in every world:** the new setting starts at hostile, so friendly
    and neutral NPC casts are **no longer masked** unless you choose "Every non-player caster".
    **"Show Masked Spell Effect"** now defaults to on, which also turns it on in any existing world
    that never changed it. Check both settings after updating.
  - **Cast lifecycle (TD-08):** the generic card, gate and identity are now written only once the
    cast actually displays, so a cancelled cast leaves no false card behind; **Clear** also deletes
    the cast's generic card.
  - **Docs:** whispers are private at the table, not from a browser console (the reveal whisper was
    described as visible to only the earner and GM).
  - **Release gates:** the release workflow now checks the tag/version match, script syntax,
    `lang/en.json`, a node test suite (`node --test "tests/*.test.mjs"`), the download URL and the
    zip contents before publishing.
- **0.7.7** — manifest download URL fixed to match the release asset (`pf15-discovery-veil.zip`).
- **Relay-failure feedback (0.7.6)** — if a player's Perception/Spellcraft roll result can't reach
  the GM (e.g. the GM disconnected or reloaded in the window between the roll firing and the relay
  landing), the roller is now warned that it may not have gone through and to try again — instead of
  the result vanishing silently. Previously the relay was an unawaited `executeAsGM` whose rejection
  surfaced to no one. Fix lives in the shared `createSkillBroker` factory, so both request flows get
  it. Two-seat live-probe verified on the Perception path (`docs/0.7.6-RUNTIME-VERIFY.md`).
- **socketlib version floor (0.7.5)** — the manifest now declares a minimum socketlib version
  (`≥ 1.0.0`) under `relationships.requires`, so Foundry flags an outdated socketlib up front rather
  than failing obscurely at runtime. Manifest-only; no behavior change.
- **Broker refactor (0.7.4)** — the Perception (0.3.0) and Spellcraft (0.5.0) request flows, which
  were ~95% duplicated, now share one `createSkillBroker` factory (`scripts/skill-request.mjs`); the
  two broker files are thin config wrappers describing only their differences (skill key, trained
  eligibility, gate/DC, target shape, i18n, success action). socketlib is now registered once on a
  single shared socket. Internal cleanup only — behavior is preserved exactly (including the
  per-skill DC handling and the verified-sender hardening). No new features.
- **Render leak fix (0.7.3)** — a per-user *spot* no longer force-shows a token the GM had hidden
  before the gate (a non-module-owned / prior-hidden token); only the module's own hide is
  overridden for spotted players, matching the guarantee the global reveal/clear paths already honor.
- **Socket hardening (0.7.2)** — the Perception/Spellcraft result handlers now trust socketlib's
  verified sender instead of the request payload, so a player can no longer forge a roll result for
  another user or trigger a spell-identity reveal without being the actual, eligible roller; the
  request handlers only honor GM-initiated prompts. (Roll totals are still client-reported — Foundry
  has no server-side dice — so an invited roller can fudge their own check, same as any roll.)
- **Tracker leak fix (0.7.1)** — an undetected creature that is also a combatant now has its
  combat-tracker row hidden from players too (previously the gate hid only the canvas token);
  the row is restored on reveal/clear.
- **Perception Gate (0.2.0)** — runtime-verified two-client (`docs/0.2.0-RUNTIME-VERIFY.md`).
- **Perception roll requests (0.3.0)** — runtime-verified end-to-end over socketlib (`docs/0.3.0-RUNTIME-VERIFY.md`).
- **0.3.1** — dialog readability/width fix.
- **Spellcasting recon (0.4.0)** — written probe report, no feature code (`docs/0.4.0-PROBE.md`).
- **Spell Identification MVP (0.5.0)** — runtime-verified **live two-client**: the privacy gate
  (card suppression + zero identity leak), the Spellcraft broker, and the player-seat roll relay →
  reveal whisper. See `docs/0.5.0-RUNTIME-VERIFY.md`.
- **Shared Discovery UI (0.6.0)** — GM panel consolidating active perception + spell gates
  (`scripts/discovery-panel.mjs`). See `docs/0.6.0-RUNTIME-VERIFY.md`.
- **Stripped public mechanics (0.7.0)** — opt-in `Show Masked Spell Effect` setting adds a
  non-identifying save/attack/damage line to the generic masked card (never name/school/DC/amount).
  Off by default; runtime-verified that the effect shows when on and leaks no identity
  (`docs/0.7.0-RUNTIME-VERIFY.md`).

See `docs/PLAN.md`, `docs/ROADMAP.md`, `docs/0.4.0-PROBE.md`, and `docs/SECURITY_AND_PRIVACY.md`.

## Module Name

Folder/module id: `pf15-discovery-veil` · Human-facing title: **PF1.5 Discovery Veil**
