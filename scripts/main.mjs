import { MODULE_ID } from "./module-constants.mjs";
import { registerSettings } from "./settings.mjs";
import { initializeStateApi } from "./state.mjs";
import { onRenderTokenHUD } from "./perception-gate.mjs";
import { onDrawToken, onRefreshToken } from "./rendering.mjs";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  initializeStateApi();
  console.log(`${MODULE_ID} | PF1.5 Discovery Veil ready (0.2.0 perception gate)`);
});

Hooks.on("renderTokenHUD", onRenderTokenHUD);
Hooks.on("drawToken", onDrawToken);
Hooks.on("refreshToken", onRefreshToken);
