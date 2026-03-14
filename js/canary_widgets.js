import { app } from "../../scripts/app.js";

function setupCanaryWidget(node) {
    // Container
    const container = document.createElement("div");
    container.className = "shima-canary-container";
    container.style.cssText = `
        background: #111; 
        color: #eee; 
        padding: 10px; 
        border-radius: 4px;
        box-sizing: border-box;
        font-family: 'Inter', 'Segoe UI', sans-serif;
        display: flex;
        align-items: center;
        gap: 15px;
        border: 1px solid #333;
        min-height: 60px;
        box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
    `;

    // DOM Widget
    const widget = node.addDOMWidget("canary_display", "div", container, {
        serialize: false,
        hideOnZoom: false
    });

    // Compute Size
    if (widget) {
        widget.computeSize = () => [400, 80];
    }

    // Initial size setting
    node.onResize = function (size) {
        size[0] = Math.max(400, size[0]);
        size[1] = Math.max(80, size[1]);
    }

    // Render logic
    function render(data) {
        if (!data) {
            container.innerHTML = "<div style='color:#666; font-style: italic; font-size: 12px;'>Scanning for ghosts...</div>";
            return;
        }

        const { ghosts, current } = data;
        const hasGhosts = ghosts && ghosts.length > 0;

        const emoji = hasGhosts ? "⚠️" : "✅";
        const currentPIDs = (current || []).join(", ");
        const ghostPIDs = (ghosts || []).join(", ");

        const statusText = hasGhosts
            ? `Ghost ComfyUI Processes: <span style="color:#f87171; font-weight:bold;">${ghostPIDs}</span>`
            : "No Extra ComfyUI Processes Detected.";

        container.innerHTML = `
            <div style="font-size: 42px; line-height: 1; flex-shrink: 0; filter: drop-shadow(0 0 5px ${hasGhosts ? 'rgba(251,191,36,0.5)' : 'rgba(74,222,128,0.5)'});">
                ${emoji}
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
                <div style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #999;">
                    Current PIDs for ComfyUI: <span style="color: #4ade80;">${currentPIDs}</span>
                </div>
                <div style="font-size: 13px; line-height: 1.4; color: ${hasGhosts ? '#fca5a5' : '#eee'};">
                    ${statusText}
                </div>
            </div>
        `;
    }

    // Handle Execution
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) origOnExecuted.call(this, message);
        // ComfyUI sends the 'ui' dictionary directly as 'message'
        if (message && message.current) {
            render(message);
        }
    };

    render(null);
}

app.registerExtension({
    name: "Shima.Canary",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.Canary") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                setupCanaryWidget(this);
                this.setSize([400, 80]);
            };
        }
    }
});
