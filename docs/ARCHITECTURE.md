# Architecture Sketch

This is an intended design shape for Claude or another implementer. It is not a completed spec.

## Shared Concepts

### Discovery Gate

A discovery gate is a pending unknown that can be personally or globally revealed.

Examples:

- An undetected enemy token.
- A masked spell cast.

Common fields should stay player-safe:

```js
{
  schemaVersion: 1,
  perception: {
    "<sceneId>:<tokenId>": {
      state: "undetected" | "globallyRevealed",
      spottedBy: {
        "<userOrActorId>": true
      }
    }
  },
  spellcasting: {
    "<castId>": {
      state: "masked" | "globallyRevealed",
      identifiedBy: {
        "<userOrActorId>": true
      },
      publicLabel: "A spell is being cast."
    }
  }
}
```

Do not put hidden DCs, true spell names, token identities, spell descriptions, or GM notes in this registry.

### Private Store

Client-scope GM-only store:

```js
{
  schemaVersion: 1,
  worlds: {
    "<game.world.id>": {
      perception: {
        "<sceneId>:<tokenId>": {
          dc: 23,
          gmNotes: ""
        }
      },
      spellcasting: {
        "<castId>": {
          spellName: "Fireball",
          spellItemUuid: "...",
          casterActorUuid: "...",
          dc: 18,
          originalChatData: {}
        }
      }
    }
  }
}
```

The private store is machine/browser local. It must fail closed if `game.world.id` is unavailable or if the active GM changes and the new active GM lacks hidden state.

## Proposed Files

- `scripts/main.mjs`: hook registration and startup.
- `scripts/module-constants.mjs`: module id, setting keys, schema version.
- `scripts/settings.mjs`: world/client setting registration.
- `scripts/state.mjs`: registry/private-store read/write helpers.
- Future: `scripts/perception-gate.mjs`.
- Future: `scripts/spellcraft-gate.mjs`.
- Future: `scripts/roll-capture.mjs`.
- Future: `scripts/gm-panel.mjs`.
- Future: `scripts/rendering.mjs`.

## Public vs Private Rule

Public registry may contain:

- gate id
- safe state labels
- spotted/identified user or actor ids
- generic public text
- global reveal status

Private store may contain:

- hidden DCs
- true spell identity
- original spell item references
- GM notes
- any future hidden detection metadata

Socket payloads must never carry private fields to all clients.

## Perception Flow

1. GM marks token undetected.
2. Public registry records that a gate exists.
3. Private store records hidden DC if needed.
4. Player attempts Perception.
5. Active GM broker compares roll to hidden DC.
6. Success updates public `spottedBy`.
7. Rendering layer shows token only to successful user/actor and GM.
8. GM may click global reveal.

## Spellcraft Flow

1. Non-player spell cast is detected before player-visible full spell details are emitted.
2. Player-facing chat receives generic casting message only.
3. Active GM private store keeps true spell identity/details.
4. Eligible PCs are prompted or invited to roll Spellcraft.
5. Active GM broker compares roll to hidden DC.
6. Success updates public `identifiedBy`.
7. Module reveals spell identity according to GM-approved scope.

## Failure Mode

When hidden data is unavailable:

- Do not guess.
- Do not reveal.
- Warn the GM.
- Leave player-facing state generic/hidden.
