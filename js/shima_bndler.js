import { app } from "../../scripts/app.js";
import { addShimaToolbar } from "./shima_topbar.js";

function hideWidget(w) {
    if (!w) return;
    w.type = "hidden";
    w.hidden = true;
    w.computeSize = () => [0, -4];
    if (w.element) w.element.style.display = "none";
    w.onDraw = () => { };
}

app.registerExtension({
    name: "Shima.BNDLer",
    async nodeCreated(node) {
        if (node.comfyClass.startsWith("Shima.DeBNDL_") || node.comfyClass.startsWith("Shima.ReBNDL_")) {
            addShimaToolbar(node, ["external_linking"]);

            function hideWidgets() {
                if (!node.widgets) return;
                for (const w of node.widgets) {
                    if (w.name === "allow_external_linking") hideWidget(w);
                }
            }
            hideWidgets();
            [50, 100, 250, 500, 1000].forEach(ms => setTimeout(hideWidgets, ms));
        }
    }
});
