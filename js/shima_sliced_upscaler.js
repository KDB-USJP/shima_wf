import { app } from "../../scripts/app.js";
import { addShimaToolbar } from "./shima_topbar.js";

// Import helpers from shima.js if possible, or assume they are global if shima.js is loaded
// In Shima, most UI helpers are attached to window.Shima or available in shima.js context.
// Based on toolbar_system.md, we can just call them if shima.js is loaded.

app.registerExtension({
    name: "Shima.SlicedUpscaler",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "Shima.SlicedUpscaler") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                // 1. Shima Standard Toolbar (Premium Pattern)
                if (typeof addShimaToolbar !== "undefined") {
                    addShimaToolbar(this, ["commonparams", "external_linking", "show_values"]);
                }

                // 2. Hide toggle widgets (controlled by toolbar)
                // These functions are globally available from shima.js
                if (typeof hideToolbarWidgets !== "undefined") {
                    hideToolbarWidgets(this);
                }
                
                // 3. Setup Used Values Display
                if (typeof setupUsedValuesDisplay !== "undefined") {
                    setupUsedValuesDisplay(this, "Shima.SlicedUpscaler");
                }
                
                // 4. Preserve values during serialization
                if (typeof preserveWidgetValues !== "undefined") {
                    preserveWidgetValues(this, ["use_commonparams", "allow_external_linking", "show_used_values"]);
                }

                // UI Aesthetics
                this.color = "#3a5a7c"; // Standard Shima Blue
                this.bgcolor = "#1a1a1a";

                console.log("[Shima] Sliced Upscaler UI (Premium) initialized.");
            };
        }
    }
});
