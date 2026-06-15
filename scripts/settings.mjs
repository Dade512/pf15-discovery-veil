import { MODULE_ID, SETTINGS, SCHEMA_VERSION } from "./module-constants.mjs";
import { syncPerceptionTokens } from "./rendering.mjs";

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
