
import { app } from "../../scripts/app.js";

function setupInspectorWidgets(node) {
    // Container
    const container = document.createElement("div");
    container.className = "shima-inspector";
    container.style.cssText = `
        background: #222; 
        color: #eee; 
        padding: 5px; 
        overflow: auto; 
        border-radius: 4px;
        box-sizing: border-box;
        font-family: sans-serif;
    `;

    // DOM Widget
    const widget = node.addDOMWidget("inspector_display", "div", container, {
        serialize: false,
        hideOnZoom: false
    });

    // Compute Size
    // Default wider as requested
    if (widget) {
        widget.computeSize = () => [350, 320];
    }

    // Initial size setting
    node.onResize = function (size) {
        // Ensure minimums
        size[0] = Math.max(350, size[0]);
        size[1] = Math.max(320, size[1]);
    }

    // Render logic
    function render(content) {
        if (!content) content = "<div style='color:#666; text-align:center; padding:20px;'>Waiting...</div>";
        container.innerHTML = content;
    }

    // Handle Execution
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) origOnExecuted.call(this, message);

        if (message && message.content && message.content[0]) {
            render(message.content[0]);
        }
    };

    render("");
}

app.registerExtension({
    name: "Shima.Inspector",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.Inspector") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                setupInspectorWidgets(this);
                // Set default size (Tall enough for 10 items)
                this.setSize([350, 320]);
            };
        }
    }
});
