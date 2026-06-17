import { MODULE_ID } from "./module-constants.mjs";
import { registerSettings } from "./settings.mjs";
import { initializeStateApi } from "./state.mjs";
import { onRenderTokenHUD } from "./perception-gate.mjs";
import { onDrawToken, onRefreshToken } from "./rendering.mjs";
import { registerPerceptionSocket } from "./perception-requests.mjs";
import { onPreActionUse, onPreDisplayActionUse, onRenderChatMessageHTML } from "./spell-identification.mjs";
import { registerSpellcraftSocket } from "./spellcraft-requests.mjs";
import {
  openDiscoveryPanel, registerDiscoveryPanelControls, registerDiscoveryPanelKeybinding
} from "./discovery-panel.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerDiscoveryPanelKeybinding();
});

Hooks.once("ready", () => {
  initializeStateApi();
  // 0.6.0: surface the GM panel opener on the console API.
  if ( globalThis.pf15DiscoveryVeil ) globalThis.pf15DiscoveryVeil.openPanel = openDiscoveryPanel;
  console.log(`${MODULE_ID} | PF1.5 Discovery Veil ready (0.7.0 perception gate + roll requests + spell identification + shared discovery panel + stripped effects)`);
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

// 0.6.0 shared discovery UI: GM-only token scene-control button to open the panel.
Hooks.on("getSceneControlButtons", registerDiscoveryPanelControls);
