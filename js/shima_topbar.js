/**
 * Shima Topbar - Configurable Toolbar Below Node Title
 * 
 * Usage:
 *   import { addShimaToolbar } from "./shima_topbar.js";
 *   
 *   // In onNodeCreated:
 *   addShimaToolbar(this, ["external_linking"]);                    // Most nodes
 *   addShimaToolbar(this, ["commonparams", "external_linking"]);    // Complex nodes
 *   addShimaToolbar(this, ["external_linking", "|", "copy", "folder"]); // With separator
 * 
 * Available button types:
 *   - "external_linking"  : Toggle allow_external_linking (default for most nodes)
 *   - "commonparams"      : Toggle use_commonparams
 *   - "|"                 : Visual separator ( | )
 *   - "copy"              : Copy action (requires node.onToolbarCopy)
 *   - "folder"            : Open folder action (requires node.onToolbarFolder)
 *   - "save"              : Save action (requires node.onToolbarSave)
 *   - "edit"              : Edit action (requires node.onToolbarEdit)
 */

const ROW_HEIGHT = 28;
const ICON_SIZE = 16;
const ICON_PADDING = 8;

/**
 * Button type definitions - all tooltips and icons defined here
 */
const BUTTON_TYPES = {
    // Toggle buttons (widget-based)
    external_linking: {
        type: "toggle",
        widget: "allow_external_linking",
        icon: (value) => value ? "🔗" : "❌",
        tooltip: (value) => `External Linking: ${value ? "ON" : "OFF"}`
    },
    commonparams: {
        type: "toggle",
        widget: "use_commonparams",
        icon: (value) => value ? "🟢" : "🔴",
        tooltip: (value) => `Common Params: ${value ? "ON" : "OFF"}`
    },
    show_values: {
        type: "toggle",
        widget: "show_used_values",
        icon: (value) => value ? "👁️" : "👁",
        tooltip: (value) => `Show Values: ${value ? "ON" : "OFF"}`
    },
    samplercommons: {
        type: "toggle",
        widget: "use_samplercommons",
        icon: (value) => value ? "🟩" : "🟥",
        tooltip: (value) => `Sampler Commons: ${value ? "ON" : "OFF"}`
    },

    // Separator
    "|": {
        type: "separator"
    },

    // Action buttons (require node callback)
    copy: {
        type: "action",
        icon: "📋",
        tooltip: "Copy to clipboard",
        callback: "onToolbarCopy"
    },
    folder: {
        type: "action",
        icon: "📁",
        tooltip: "Open folder",
        callback: "onToolbarFolder"
    },
    save: {
        type: "action",
        icon: "💾",
        tooltip: "Save",
        callback: "onToolbarSave"
    },
    edit: {
        type: "action",
        icon: "✏️",
        tooltip: "Open in editor",
        callback: "onToolbarEdit"
    }
};

/**
 * Add a configurable toolbar to a node
 * @param {LGraphNode} node - The node instance
 * @param {string[]} buttonNames - Array of button type names
 */
function addShimaToolbar(node, buttonNames) {
    if (!buttonNames || buttonNames.length === 0) return;

    // Calculate toolbar height (could support multiple rows in future)
    const toolbarHeight = ROW_HEIGHT;

    // Store button click areas
    node.toolbarButtons = [];
    node._toolbarConfig = buttonNames;
    node._toolbarHeight = toolbarHeight;

    const origDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        if (this.flags.collapsed) {
            if (origDrawForeground) origDrawForeground.call(this, ctx);
            return;
        }
        ctx.save();

        // Draw toolbar background
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(0, 0, this.size[0], toolbarHeight);

        // Draw bottom border
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, toolbarHeight);
        ctx.lineTo(this.size[0], toolbarHeight);
        ctx.stroke();

        // Reset button areas each frame
        this.toolbarButtons = [];

        const iconY = toolbarHeight / 2;
        let xOffset = ICON_PADDING;

        ctx.font = `${ICON_SIZE}px Arial`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";

        // Draw each button
        for (const btnName of this._toolbarConfig) {
            const btnDef = BUTTON_TYPES[btnName];
            if (!btnDef) continue;

            if (btnDef.type === "separator") {
                // Draw separator
                ctx.fillStyle = "#555";
                ctx.font = `${ICON_SIZE}px Arial`;
                ctx.fillText(" | ", xOffset, iconY);
                xOffset += 20;
            } else if (btnDef.type === "toggle") {
                // Widget toggle button
                const widget = this.widgets?.find(w => w.name === btnDef.widget);
                if (widget) {
                    const value = widget.value;
                    const icon = typeof btnDef.icon === "function" ? btnDef.icon(value) : btnDef.icon;

                    ctx.fillStyle = "#fff";
                    ctx.fillText(icon, xOffset, iconY);

                    this.toolbarButtons.push({
                        type: "toggle",
                        widget: widget,
                        btnDef: btnDef,
                        x: xOffset - 2,
                        y: 0,
                        width: ICON_SIZE + 4,
                        height: toolbarHeight
                    });
                    xOffset += ICON_SIZE + ICON_PADDING;
                }
            } else if (btnDef.type === "action") {
                // Action button
                const icon = btnDef.icon;

                ctx.fillStyle = "#fff";
                ctx.fillText(icon, xOffset, iconY);

                this.toolbarButtons.push({
                    type: "action",
                    btnDef: btnDef,
                    x: xOffset - 2,
                    y: 0,
                    width: ICON_SIZE + 4,
                    height: toolbarHeight
                });
                xOffset += ICON_SIZE + ICON_PADDING;
            }
        }

        ctx.restore();

        if (origDrawForeground) {
            origDrawForeground.call(this, ctx);
        }
    };

    // Handle clicks in toolbar
    const origOnMouseDown = node.onMouseDown;
    node.onMouseDown = function (e, localPos, canvas) {
        if (this.flags.collapsed) {
            if (origOnMouseDown) return origOnMouseDown.call(this, e, localPos, canvas);
            return;
        }
        if (this.toolbarButtons) {
            for (const btn of this.toolbarButtons) {
                if (localPos[0] >= btn.x && localPos[0] <= btn.x + btn.width &&
                    localPos[1] >= btn.y && localPos[1] <= btn.y + btn.height) {

                    if (btn.type === "toggle") {
                        // Toggle widget value
                        btn.widget.value = !btn.widget.value;
                        if (btn.widget.callback) btn.widget.callback(btn.widget.value);
                        this.setDirtyCanvas(true, true);
                        return true;
                    } else if (btn.type === "action") {
                        // Call node callback if defined
                        const callbackName = btn.btnDef.callback;
                        if (this[callbackName]) {
                            this[callbackName]();
                        }
                        return true;
                    }
                }
            }
        }
        if (origOnMouseDown) return origOnMouseDown.call(this, e, localPos, canvas);
    };

    // Handle hover for tooltips
    const origOnMouseMove = node.onMouseMove;
    node.onMouseMove = function (e, localPos, canvas) {
        if (this.flags.collapsed) {
            if (origOnMouseMove) return origOnMouseMove.call(this, e, localPos, canvas);
            return;
        }
        let tooltip = null;
        if (this.toolbarButtons) {
            for (const btn of this.toolbarButtons) {
                if (localPos[0] >= btn.x && localPos[0] <= btn.x + btn.width &&
                    localPos[1] >= btn.y && localPos[1] <= btn.y + btn.height) {

                    if (btn.type === "toggle") {
                        const value = btn.widget.value;
                        tooltip = typeof btn.btnDef.tooltip === "function"
                            ? btn.btnDef.tooltip(value)
                            : btn.btnDef.tooltip;
                    } else if (btn.type === "action") {
                        tooltip = btn.btnDef.tooltip;
                    }
                    break;
                }
            }
        }
        if (canvas && canvas.canvas) canvas.canvas.title = tooltip || "";
        if (origOnMouseMove) return origOnMouseMove.call(this, e, localPos, canvas);
    };

    // Increase node height for toolbar
    const origComputeSize = node.computeSize;
    node.computeSize = function (out) {
        const size = origComputeSize ? origComputeSize.call(this, out) : [200, 100];
        if (!this.flags.collapsed) {
            size[1] += toolbarHeight;
        }
        return size;
    };

    // Push slots down
    node.constructor.slot_start_y = toolbarHeight;
    node.slot_start_y = toolbarHeight;
}

export { addShimaToolbar, BUTTON_TYPES };
