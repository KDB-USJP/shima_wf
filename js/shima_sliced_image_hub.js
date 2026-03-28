import { app } from "../../scripts/app.js";
import { addShimaToolbar } from "./shima_topbar.js";

app.registerExtension({
    name: "Shima.SlicedImageHub",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "Shima.SlicedImageHub") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                // 1. Shima Standard Toolbar (Simplified for Hub)
                if (typeof addShimaToolbar !== "undefined") {
                    addShimaToolbar(this, ["external_linking", "show_values"]);
                }

                // 2. Hide toggle widgets (controlled by toolbar)
                if (typeof hideToolbarWidgets !== "undefined") {
                    hideToolbarWidgets(this);
                }
                
                // 3. Setup Used Values Display
                if (typeof setupUsedValuesDisplay !== "undefined") {
                    setupUsedValuesDisplay(this, "Shima.SlicedImageHub");
                }
                
                // 4. Preserve values during serialization
                if (typeof preserveWidgetValues !== "undefined") {
                    preserveWidgetValues(this, ["allow_external_linking", "show_used_values"]);
                }

                // UI Aesthetics
                this.color = "#571a1a"; // Warm Shima Red/Brown for Hubs/Splitters
                this.bgcolor = "#1a1a1a";

                console.log("[Shima] Sliced Image Hub UI initialized.");
            };
        }
    }
});
