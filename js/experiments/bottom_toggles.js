/**
 * Add clickable toggle icons to the BOTTOM of a node
 * Creates emoji icons that toggle underlying widget values
 * 
 * @param {LGraphNode} node - The node instance
 * @param {Object} config - Configuration object
 *   {
 *     useCommonParams: boolean,  // Show common params toggle (🔴/🟢)
 *     allowExternalLinking: boolean  // Show external linking toggle (⛓️💥/🔗)
 *   }
 * 
 * @example
 * setupBottomToggles(node, {
 *     useCommonParams: true,
 *     allowExternalLinking: true
 * });
 */
function setupBottomToggles(node, config = {}) {
    if (!config.useCommonParams && !config.allowExternalLinking) return;

    // Store config on node
    node.shimaBottomToggles = config;

    // Override onDrawForeground to add icons at BOTTOM of node
    const origDrawForeground = node.onDrawForeground;

    node.onDrawForeground = function (ctx) {
        // Call original drawing first
        if (origDrawForeground) {
            origDrawForeground.call(this, ctx);
        }

        // Draw toggle icons at the bottom-right of the node
        const iconSize = 16;
        const iconPadding = 6;
        const bottomMargin = 8;
        const rightMargin = 18;  // Keep away from drag-resize handle
        let xOffset = this.size[0] - iconPadding - rightMargin;
        const yPos = this.size[1] - bottomMargin - iconSize / 2;

        ctx.save();
        ctx.font = `${iconSize}px Arial`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        // Clear button area array on each draw
        if (!this.shimaBottomButtons) this.shimaBottomButtons = [];
        this.shimaBottomButtons = [];

        // Common Params toggle
        if (config.useCommonParams) {
            const cpWidget = this.widgets?.find(w => w.name === "use_commonparams");
            if (cpWidget) {
                const icon = cpWidget.value ? "🟢" : "🔴";

                ctx.fillText(icon, xOffset, yPos);

                // Store click area
                this.shimaBottomButtons.push({
                    widget: cpWidget,
                    x: xOffset - iconSize - iconPadding,
                    y: this.size[1] - bottomMargin - iconSize,
                    width: iconSize + iconPadding * 2,
                    height: iconSize + bottomMargin,
                    tooltip: cpWidget.value ? "Using Common Params (Click to disable)" : "Not using Common Params (Click to enable)"
                });

                xOffset -= (iconSize + iconPadding);
            }
        }

        // External Linking toggle
        if (config.allowExternalLinking) {
            const elWidget = this.widgets?.find(w => w.name === "allow_external_linking");
            if (elWidget) {
                const icon = elWidget.value ? "🔗" : "❌";

                ctx.fillText(icon, xOffset, yPos);

                // Store click area (wider for double emoji)
                this.shimaBottomButtons.push({
                    widget: elWidget,
                    x: xOffset - iconSize * 1.5 - iconPadding,
                    y: this.size[1] - bottomMargin - iconSize,
                    width: iconSize * 1.5 + iconPadding * 2,
                    height: iconSize + bottomMargin,
                    tooltip: elWidget.value ? "External linking allowed (Click to disable)" : "External linking disabled (Click to enable)"
                });
            }
        }

        ctx.restore();
    };

    // Override onMouseDown to handle clicks
    const origOnMouseDown = node.onMouseDown;

    node.onMouseDown = function (e, localPos, canvas) {
        // Check if click is in bottom button area
        if (this.shimaBottomButtons) {
            for (const btn of this.shimaBottomButtons) {
                if (localPos[0] >= btn.x &&
                    localPos[0] <= btn.x + btn.width &&
                    localPos[1] >= btn.y &&
                    localPos[1] <= btn.y + btn.height) {

                    // Toggle the widget value
                    btn.widget.value = !btn.widget.value;

                    // Call the widget's callback if it exists
                    if (btn.widget.callback) {
                        btn.widget.callback(btn.widget.value);
                    }

                    // Mark node as dirty to redraw
                    this.setDirtyCanvas(true, true);

                    console.log(`[Shima] Toggled ${btn.widget.name} to ${btn.widget.value}`);

                    // Prevent event from propagating
                    return true;
                }
            }
        }

        // Call original handler
        if (origOnMouseDown) {
            return origOnMouseDown.call(this, e, localPos, canvas);
        }
        return false;
    };

    // Override onMouseMove for tooltips and cursor
    const origOnMouseMove = node.onMouseMove;

    node.onMouseMove = function (e, localPos, canvas) {
        if (this.shimaBottomButtons) {
            // Check if hovering over a button
            for (const btn of this.shimaBottomButtons) {
                if (localPos[0] >= btn.x &&
                    localPos[0] <= btn.x + btn.width &&
                    localPos[1] >= btn.y &&
                    localPos[1] <= btn.y + btn.height) {

                    canvas.canvas.style.cursor = "pointer";
                    canvas.canvas.title = btn.tooltip;
                    return;
                }
            }
        }

        // Reset cursor
        canvas.canvas.style.cursor = "";
        canvas.canvas.title = "";

        if (origOnMouseMove) {
            return origOnMouseMove.call(this, e, localPos, canvas);
        }
    };

    console.log(`[Shima] Bottom toggles configured: CP=${config.useCommonParams}, EL=${config.allowExternalLinking}`);
}

// Export for use in widget files
export { setupBottomToggles };
