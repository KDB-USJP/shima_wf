import { app } from "../../scripts/app.js";
import { addShimaToolbar } from "./shima_topbar.js";

app.registerExtension({
    name: "Shima.SlicedCommons",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "Shima.SlicedCommons") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                // 1. Shima Standard Toolbar
                if (typeof addShimaToolbar !== "undefined") {
                    addShimaToolbar(this, ["external_linking", "show_values"]);
                }

                // 2. Hide toggle widgets (controlled by toolbar)
                if (typeof hideToolbarWidgets !== "undefined") {
                    hideToolbarWidgets(this);
                }
                
                // 4. Preserve values during serialization
                if (typeof preserveWidgetValues !== "undefined") {
                    preserveWidgetValues(this, ["allow_external_linking", "show_used_values"]);
                }

                // UI Aesthetics
                this.color = "#3a5a7c"; // Standard Shima Blue for "Definition" nodes
                this.bgcolor = "#1a1a1a";

                console.log("[Shima] Sliced Commons UI initialized.");
            };
        }
    }
});
