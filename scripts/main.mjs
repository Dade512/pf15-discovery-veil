import { MODULE_ID } from "./module-constants.mjs";
import { registerSettings } from "./settings.mjs";
import { initializeStateApi } from "./state.mjs";
import { onRenderTokenHUD } from "./perception-gate.mjs";
import { onDrawToken, onRefreshToken } from "./rendering.mjs";
import { registerPerceptionSocket } from "./perception-requests.mjs";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  initializeStateApi();
  console.log(`${MODULE_ID} | PF1.5 Discovery Veil ready (0.3.1 perception gate + roll requests)`);
});

Hooks.once("socketlib.ready", () => {
  registerPerceptionSocket();
});

Hooks.on("renderTokenHUD", onRenderTokenHUD);
Hooks.on("drawToken", onDrawToken);
Hooks.on("refreshToken", onRefreshToken);
