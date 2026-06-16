import { MODULE_ID } from "./module-constants.mjs";
import { registerSettings } from "./settings.mjs";
import { initializeStateApi } from "./state.mjs";
import { onRenderTokenHUD } from "./perception-gate.mjs";
import { onDrawToken, onRefreshToken } from "./rendering.mjs";
import { registerPerceptionSocket } from "./perception-requests.mjs";
import { onPreActionUse, onPreDisplayActionUse, onRenderChatMessageHTML } from "./spell-identification.mjs";
import { registerSpellcraftSocket } from "./spellcraft-requests.mjs";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  initializeStateApi();
  console.log(`${MODULE_ID} | PF1.5 Discovery Veil ready (0.5.0 perception gate + roll requests + spell identification)`);
});

Hooks.once("socketlib.ready", () => {
  registerPerceptionSocket();
  registerSpellcraftSocket();
});

Hooks.on("renderTokenHUD", onRenderTokenHUD);
Hooks.on("drawToken", onDrawToken);
Hooks.on("refreshToken", onRefreshToken);

// 0.5.0 spell identification: detect non-player casts before the player card,
// and add GM-only enhancements to the generic card.
Hooks.on("pf1PreActionUse", onPreActionUse);
Hooks.on("pf1PreDisplayActionUse", onPreDisplayActionUse);
Hooks.on("renderChatMessageHTML", onRenderChatMessageHTML);
