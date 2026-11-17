import { MODULE_ID, SETTINGS, SCHEMA_VERSION } from "./module-constants.mjs";
import { syncPerceptionTokens } from "./rendering.mjs";
import { SPELL_MASK_SCOPES } from "./gate-rules.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.perceptionEnabled, {
    name: "PF15DV.Settings.PerceptionEnabled.Name",
    hint: "PF15DV.Settings.PerceptionEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.spellcraftEnabled, {
    name: "PF15DV.Settings.SpellcraftEnabled.Name",
    hint: "PF15DV.Settings.SpellcraftEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // 0.7.8 caster scope (TD-46): which non-player casters get masked. Hostile by
  // default; SECRET counts as hostile; player-owned casters are never masked.
  game.settings.register(MODULE_ID, SETTINGS.spellMaskScope, {
    name: "PF15DV.Settings.SpellMaskScope.Name",
    hint: "PF15DV.Settings.SpellMaskScope.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [SPELL_MASK_SCOPES[0]]: "PF15DV.Settings.SpellMaskScope.Hostile",
      [SPELL_MASK_SCOPES[1]]: "PF15DV.Settings.SpellMaskScope.HostileNeutral",
      [SPELL_MASK_SCOPES[2]]: "PF15DV.Settings.SpellMaskScope.AllNonPlayer"
    },
    default: "hostile"
  });

  // 0.7.0 stripped public mechanics: when ON, the generic masked-spell card also
  // shows the save type / attack / damage indicators (never the name, school,
  // DC, or damage amount). On by default since 0.7.8 (TD-46 b).
  game.settings.register(MODULE_ID, SETTINGS.spellPublicEffect, {
    name: "PF15DV.Settings.SpellPublicEffect.Name",
    hint: "PF15DV.Settings.SpellPublicEffect.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.debugLogging, {
    name: "PF15DV.Settings.DebugLogging.Name",
    hint: "PF15DV.Settings.DebugLogging.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.publicRegistry, {
    scope: "world",
    config: false,
    type: Object,
    default: { schemaVersion: SCHEMA_VERSION, perception: {}, spellcasting: {} },
    onChange: () => syncPerceptionTokens()
  });

  game.settings.register(MODULE_ID, SETTINGS.privateStore, {
    scope: "client",
    config: false,
    type: Object,
    default: { schemaVersion: SCHEMA_VERSION, worlds: {} }
  });
}
