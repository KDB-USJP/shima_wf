
import { app } from "../../scripts/app.js";

function setupSeedLoggerWidgets(node) {
    // Container for content
    const container = document.createElement("div");
    container.className = "shima-seed-logger-display";
    container.style.cssText = `
        background: #222; 
        color: #eee; 
        padding: 5px; 
        overflow: auto; 
        border-radius: 4px;
        box-sizing: border-box;
        font-family: sans-serif;
    `;

    // Add as DOM widget
    const widget = node.addDOMWidget("seed_logger_display", "div", container, {
        serialize: false,
        hideOnZoom: false
    });

    // Auto-update size
    if (widget) {
        widget.computeSize = () => [250, 200];
    }

    // Function to render content
    function render(content) {
        if (!content) {
            // Show styled placeholder that looks like real content
            content = `
                <style>
                    .shima-simple-seed-list { font-family: monospace; font-size: 14px; color: #ddd; padding: 5px; }
                    .shima-seed-item { padding: 4px 8px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; }
                    .shima-seed-index { color: #666; font-size: 10px; margin-right: 10px; align-self: center; }
                    .shima-seed-number { font-weight: bold; color: #555; font-style: italic; }
                </style>
                <div class="shima-simple-seed-list">
                    <div class="shima-seed-item" style="opacity:0.5;">
                        <span class="shima-seed-index">#0</span>
                        <span class="shima-seed-number">awaiting first run...</span>
                    </div>
                </div>
            `;
        }
        container.innerHTML = content;
    }

    // Function to set up the onExecuted hook
    function setupExecutedHook() {
        // Only hook if not already hooked
        if (node._shimaExecutedHooked) return;
        node._shimaExecutedHooked = true;

        const origOnExecuted = node.onExecuted;

        node.onExecuted = function (message) {
            if (origOnExecuted) origOnExecuted.call(this, message);

            // message should contain: content (array)
            if (message && message.content && message.content[0]) {
                render(message.content[0]);
            }
        };
    }

    // Initial render
    render("");

    // Set up hook with delay to ensure node is fully initialized
    // This helps when nodes are deserialized from saved workflows
    setTimeout(() => {
        setupExecutedHook();
    }, 100);

    // Also hook onConfigure for nodes loaded from saved workflows
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        if (origOnConfigure) origOnConfigure.call(this, info);

        // Validate history_limit widget (fix for empty string error)
        setTimeout(() => {
            const limitWidget = node.widgets?.find(w => w.name === "history_limit");
            if (limitWidget) {
                if (limitWidget.value === "" || limitWidget.value === undefined || limitWidget.value === null) {
                    limitWidget.value = 50;
                }
            }
        }, 50);

        // Re-setup hook after configuration (workflow load)
        setTimeout(() => {
            setupExecutedHook();
        }, 200);
    };

    // Add Copy listener
    container.addEventListener("click", async (e) => {
        // Handle click on item or the number span directly
        const target = e.target.closest(".shima-seed-item");
        if (target) {
            const numberSpan = target.querySelector(".shima-seed-number");
            if (!numberSpan) return;

            const seed = numberSpan.innerText;
            try {
                await navigator.clipboard.writeText(seed);

                // Visual feedback
                const originalColor = numberSpan.style.color;
                numberSpan.style.color = "#44ff88"; // Flash green
                numberSpan.innerText = "COPIED";

                setTimeout(() => {
                    numberSpan.style.color = originalColor;
                    numberSpan.innerText = seed;
                }, 800);

            } catch (err) {
                console.error("Failed to copy seed:", err);
            }
        }
    });
}

app.registerExtension({
    name: "Shima.SeedLogger",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.SeedLogger") {
            console.log("[SeedLogger] Registering extension for Shima.SeedLogger");
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                console.log("[SeedLogger] onNodeCreated called");
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                setupSeedLoggerWidgets(this);
                console.log("[SeedLogger] setupSeedLoggerWidgets complete");
            };
        }
    }
});
