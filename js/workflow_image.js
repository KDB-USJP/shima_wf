import { app } from "../../scripts/app.js";
import { addShimaToolbar } from "./shima_topbar.js";

app.registerExtension({
    name: "Shima.WorkflowImage",
    async nodeCreated(node, app) {
        if (node.comfyClass !== "Shima.WorkflowImage") return;

        // 1. Add Shima Toolbar
        addShimaToolbar(node, ["commonparams", "external_linking"]);

        // 2. Hide toggle widgets (controlled by toolbar)
        const hideWidget = (widgetName) => {
            const widget = node.widgets?.find(w => w.name === widgetName);
            if (widget) {
                widget.type = "hidden";
                widget.computeSize = () => [0, -4];
                widget.hidden = true;
            }
        };

        // Small delay to ensure widgets are initialized
        setTimeout(() => {
            hideWidget("use_commonparams");
            hideWidget("allow_external_linking");

            // Force redraw/resize
            node.setDirtyCanvas(true, true);

            // Resize node to fit visible widgets
            const newSize = node.computeSize();
            node.setSize([Math.max(node.size[0], newSize[0]), newSize[1]]);
        }, 50);
    }
});
