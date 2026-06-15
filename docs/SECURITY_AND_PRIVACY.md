# Security and Privacy Notes

This module should inherit the privacy lessons from `baphomet-utils` A-017 and from the `pf15-identity-mask` design.

## Hard Rule

If a value is meant to be unknown to players, do not place it on a replicated surface.

Avoid hidden data in:

- world settings
- user settings
- user flags
- actor flags
- token flags
- combatant flags
- scene flags
- chat messages
- socket payloads sent to all clients

`config:false` hides a setting from the UI. It does not make the value confidential.

## Acceptable Public State

Public state can include:

- "this token has an undetected gate"
- "this spell cast is masked"
- "this user/actor has spotted it"
- "this user/actor has identified it"
- "this gate is globally revealed"

## Private State

Private state must stay on the active GM client:

- hidden Perception DCs
- true identity of currently undiscovered tokens if not otherwise public
- spell names before identification
- spell descriptions before identification
- original spell chat payloads
- GM notes

## Soft Reveal Caveat

Personal token reveal is a presentation feature. It can support normal table play, but it should not be described as strong anti-cheat secrecy if Foundry has already delivered scene/token data to the player client.

## Required Gate

Before any release that claims confidentiality:

- run a genuine player-seat reload test
- inspect user/world settings
- inspect relevant documents and flags
- inspect chat messages
- inspect socket payloads where practical
- confirm hidden DCs/spell names are absent from replicated surfaces
