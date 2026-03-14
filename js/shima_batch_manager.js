import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Shima.BatchManager",

    setup() {
        // Listen for Auto-Queue Request
        api.addEventListener("shima-batch-continue", (event) => {
            const { node_id } = event.detail;
            console.log(`[Shima] Auto-Queue triggered by node ${node_id}`);
            api.queuePrompt(0); // 0 = standard queue
        });

        // Listen for Index Widget Update
        api.addEventListener("shima-batch-update-index", (event) => {
            const { node_id, new_index } = event.detail;

            const node = app.graph.getNodeById(node_id);
            if (!node) return;

            // Find 'index' widget
            const widget = node.widgets?.find(w => w.name === "index");
            if (widget) {
                // Update value if different (avoids loops if we were the ones setting it)
                if (widget.value !== new_index) {
                    widget.value = new_index;
                    node.setDirtyCanvas(true, true); // Force redraw
                }
            }
        });
    }
});
