export const MODULE_ID = "pf15-discovery-veil";

export const SETTINGS = {
  perceptionEnabled: "perceptionEnabled",
  spellcraftEnabled: "spellcraftEnabled",
  debugLogging: "debugLogging",
  publicRegistry: "publicRegistry",
  privateStore: "privateStore"
};

export const SCHEMA_VERSION = 1;

/** Socket channel + message types for the 0.3.0 Perception roll broker. */
export const SOCKET = `module.${MODULE_ID}`;
export const SOCKET_TYPES = {
  perceptionRequest: "perceptionRequest",
  perceptionResult: "perceptionResult"
};

/** CSS class names owned by this module. */
export const CSS = {
  hudControl: "pf15dv-hud-control"
};
