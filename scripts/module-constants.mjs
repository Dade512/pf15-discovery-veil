export const MODULE_ID = "pf15-discovery-veil";

export const SETTINGS = {
  perceptionEnabled: "perceptionEnabled",
  spellcraftEnabled: "spellcraftEnabled",
  debugLogging: "debugLogging",
  publicRegistry: "publicRegistry",
  privateStore: "privateStore"
};

export const SCHEMA_VERSION = 1;

/** Socket channel + message types for the 0.3.0 Perception + 0.5.0 Spellcraft brokers. */
export const SOCKET = `module.${MODULE_ID}`;
export const SOCKET_TYPES = {
  perceptionRequest: "perceptionRequest",
  perceptionResult: "perceptionResult",
  spellcraftRequest: "spellcraftRequest",
  spellcraftResult: "spellcraftResult"
};

/** CSS class names owned by this module. */
export const CSS = {
  hudControl: "pf15dv-hud-control",
  spellCast: "pf15dv-spell-cast",
  cardButton: "pf15dv-card-button",
  gmNote: "pf15dv-gm-note"
};

/**
 * PF1 base DC to identify a spell as it is being cast: 15 + spell level
 * (Spellcraft). The hidden per-cast DC is derived from this and stored only on
 * the active-GM client; the GM can override it when requesting the check.
 */
export const SPELL_ID_DC_BASE = 15;
