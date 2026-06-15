# Runtime Checklist

Use this once behavior exists. For v0.1.0 scaffold, only the load checks apply.

## Scaffold Load

- Module appears in Foundry module list.
- Module can be enabled in a PF1 world.
- No console error on `init`.
- No console error on `ready`.
- Settings appear:
  - Enable Perception Reveals
  - Enable Spellcraft Reveals
  - Discovery Veil Debug Logging
- `globalThis.pf15DiscoveryVeil.status` is `"scaffold-only"`.

## Perception MVP

- GM can mark selected token undetected.
- GM can clear undetected.
- GM can reveal globally.
- Player A who has not spotted does not see the token through intended surfaces.
- Player B who has spotted sees the token through intended surfaces.
- GM always sees true state.
- Player reload preserves spotted/global state.
- Hidden DC is not visible from player settings, flags, chat, or socket payloads.

## Spellcraft MVP

- Non-player spell cast creates only generic player-facing casting text before identification.
- Full spell name/description is not present in player-visible chat message data before success.
- Eligible PCs can roll Spellcraft.
- Success reveals approved spell information.
- Failure keeps spell masked.
- Missing active GM fails closed.
- Hidden spell name/DC is not visible from player settings, flags, chat, or socket payloads.
