/**
 * Shima - ComfyUI Workflow Island Marketplace
 * Frontend extension for right-click menu integration and island management
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { addShimaToolbar } from "./shima_topbar.js";

// ============================================================================
// Global Shima Utility Object & Console Sanitization
// ============================================================================
window.Shima = window.Shima || {};

/// Silence the "Parameter defaultValue is deprecated" nag and common external deprecation noise
// We intercept these to maintain a clean boot hygiene without being the "blame center" for 3rd party issues.
const _originalWarn = console.warn;
console.warn = function (msg, ...args) {
    if (typeof msg === 'string') {
        const ignoreList = [
            "Parameter defaultValue is deprecated",
            "[ComfyUI Deprecated]",
            "[ComfyUI Notice]",
            "[MaskEditor] ComfyApp.open_maskeditor is deprecated",
            "Monkey-patching getCanvasMenuOptions is deprecated",
            "not found in widget",
            "defaultValue",
            "Use of defaultInput on required input",
            "Unsupported color format in color palette: transparent"
        ];
        if (ignoreList.some(item => msg.includes(item))) return;
    }
    return _originalWarn.call(console, msg, ...args);
};

/**
 * Robustly opens the ComfyUI settings dialog and navigates to the "Shima" tab.
 */
window.Shima.openSettings = async function() {
    // 1. Open the main settings dialog
    const settingsBtn = document.querySelector(".comfy-settings-btn") || 
                        document.querySelector("button[id*='settings']");
    
    if (settingsBtn) {
        settingsBtn.click();
    } else if (app.ui.settings && app.ui.settings.show) {
        app.ui.settings.show();
    } else {
        console.warn("[Shima] Could not find settings button or API.");
        return;
    }

    // 2. Wait for modal and navigate to Shima tab
    // Retries for up to 1 second
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 50));
        
        const selectors = [
            ".comfy-modal button", 
            ".comfy-modal div", 
            ".p-dialog .p-menuitem-link", 
            ".p-dialog li",
            ".p-tabmenu-nav .p-menuitem-link"
        ];
        
        const buttons = Array.from(document.querySelectorAll(selectors.join(",")));
        const shimaTab = buttons.find(el => 
            el.innerText && 
            el.innerText.trim() === "Shima" && 
            el.offsetParent !== null // Must be visible
        );

        if (shimaTab) {
            shimaTab.click();
            return;
        }
    }
    console.log("[Shima] Could not auto-select settings tab");
};

// ============================================================================
// Helper Functions for Group Management
// ============================================================================

/**
 * Generate a random alphanumeric string for group suffixes
 * @param {number} length - Length of the string (default 4)
 * @returns {string} Random string like "A7xK"
 */
function randomString(length = 4) {
    return Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1).toUpperCase();
}

// ============================================================================
// Toolbar Widget Hiding
// ============================================================================

/**
 * Hide toggle widgets that are now controlled by toolbar icons
 * Must set hidden=true and disabled=true for proper hiding
 */
function hideToolbarWidgets(node) {
    const widgetsToHide = ["use_commonparams", "allow_external_linking", "show_used_values"];
    setTimeout(() => {
        widgetsToHide.forEach(widgetName => {
            const widget = node.widgets?.find(w => w.name === widgetName);
            if (widget && widget.type !== "hidden") {
                widget.origType = widget.type;
                widget.origComputeSize = widget.computeSize;
                widget.type = "hidden";
                widget.computeSize = () => [0, -4];
                widget.hidden = true;
                // Note: NOT setting disabled=true as it may break serialization
            }
        });
    }, 50);
}

/**
 * WORKAROUND: Preserve widget values during serialization
 * ComfyUI's core serialization has issues with hidden/toolbar widgets
 * This explicitly saves and restores critical widget values
 * @param {LGraphNode} node - The node to protect
 * @param {string[]} widgetNames - Array of widget names to preserve
 */
function preserveWidgetValues(node, widgetNames) {
    const origSerialize = node.serialize;
    node.serialize = function () {
        const data = origSerialize ? origSerialize.call(this) : {};

        // Store all critical widget values
        data._shima_preserved = {};
        widgetNames.forEach(widgetName => {
            const widget = this.widgets?.find(w => w.name === widgetName);
            if (widget !== undefined && widget.value !== undefined) {
                data._shima_preserved[widgetName] = widget.value;
            }
        });

        return data;
    };

    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        if (origOnConfigure) origOnConfigure.call(this, info);

        // Restore preserved widget values after configuration
        if (info._shima_preserved) {
            setTimeout(() => {
                Object.entries(info._shima_preserved).forEach(([widgetName, value]) => {
                    const widget = this.widgets?.find(w => w.name === widgetName);
                    if (widget) {
                        widget.value = value;
                        // Trigger callback to ensure UI updates (e.g. show/hide logic)
                        if (widget.callback) {
                            widget.callback(value);
                        }
                        console.log(`[Shima] Restored ${widgetName} to:`, value);
                    }
                });
            }, 100);
        }
    };
}


// ============================================================================
// Used Values Display (Debug Feature)
// ============================================================================

/**
 * Field configurations for show_values feature per node type
 * Maps node name to array of widget names to display
 */
const USED_VALUES_FIELDS = {
    "Shima.LatentMaker": ["s33d", "width", "height", "batch_size"],
    "Shima.Sampler": ["s33d", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
    "Shima.FileSaver": ["project_name", "base_folder", "base_name"],
    "Shima.MultiSaver": ["project", "base_folder"],
    "Shima.Preview": ["folder_path", "filename"],
    "Shima.PreviewCompare": ["folder_path", "filename"],
    "Shima.StyleIterator": ["style_mode", "name", "current_index", "formatted_name"],
};

/**
 * Set up used values display DOM widget for a node
 * Shows current widget values when show_used_values toggle is ON
 * @param {LGraphNode} node - The node instance
 * @param {string} nodeType - The node type name (e.g., "Shima.LatentMaker")
 */
function setupUsedValuesDisplay(node, nodeType) {
    const fields = USED_VALUES_FIELDS[nodeType];
    if (!fields) return;

    // Create container for the text display
    const container = document.createElement("div");
    container.className = "shima-used-values-display";
    container.style.cssText = `
        background: #1a1a1a;
        color: #888;
        padding: 8px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        border-top: 1px solid #333;
        white-space: pre-wrap;
        line-height: 1.4;
        display: none;
        overflow-y: auto;
        max-height: 200px;
    `;
    container.textContent = "Values will appear after execution...";

    // Add as a DOM widget (non-serialized)
    const widget = node.addDOMWidget("used_values_display", "div", container, {
        serialize: false,
        hideOnZoom: false
    });

    if (widget) {
        // Initial height, will be updated dynamically
        widget.computeSize = () => [node.size[0] - 20, 0];
    }

    // Store references
    node.shimaUsedValuesContainer = container;
    node.shimaUsedValuesWidget = widget;
    node.shimaUsedValuesFields = fields;

    // Update function to refresh display
    const updateDisplay = () => {
        const showWidget = node.widgets?.find(w => w.name === "show_used_values");
        const isVisible = showWidget?.value === true;

        container.style.display = isVisible ? "block" : "none";

        // If visible, update content
        if (isVisible) {
            // Check if we have backend UI data (from last execution)
            // Stored in our custom property by onExecuted
            if (node._shimaLastUiValues && node._shimaLastUiValues.length > 0) {
                container.textContent = node._shimaLastUiValues.join("\n");
            } else {
                // Fallback to "No values available yet (Run workflow...)"
                container.textContent = "No execution data yet.\nRun workflow to see used values.";
            }
        }

        // Dynamic, flexible height logic
        // If visible, give it enough space but let it scroll if huge
        if (widget) {
            widget.computeSize = () => [node.size[0] - 20, isVisible ? 120 : 0];
        }

        node.setDirtyCanvas(true, true);
    };

    // Hook into show_used_values widget callback
    setTimeout(() => {
        const showWidget = node.widgets?.find(w => w.name === "show_used_values");
        if (showWidget) {
            const origCallback = showWidget.callback;
            showWidget.callback = function (value) {
                if (origCallback) origCallback.call(this, value);
                updateDisplay();
                // Trigger resize (preserve width)
                const newSize = node.computeSize();
                node.setSize([Math.max(node.size[0], newSize[0]), newSize[1]]);
            };
            // Initial update
            updateDisplay();
            const newSize = node.computeSize();
            node.setSize([Math.max(node.size[0], newSize[0]), newSize[1]]);
        }
    }, 100);

    // Also update after execution
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) origOnExecuted.call(this, message);

        // Check for UI payload
        if (message) {
            // ComfyUI passes the 'ui' dict content directly as message
            // Support both direct access and nested just in case
            const values = message.used_values || message.values || (message.ui && (message.ui.used_values || message.ui.values));

            if (values) {
                node._shimaLastUiValues = values;
            }
        }

        updateDisplay();
        const newSize = node.computeSize();
        node.setSize([Math.max(node.size[0], newSize[0]), newSize[1]]);
    };
}

// ============================================================================
// Widget Highlighting Utilities
// ============================================================================

/**
 * Helper to draw rounded rectangle (for widget halos)
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * Highlight one or more widgets with colored halos
 * Creates a visible border around widgets without z-order issues
 * 
 * @param {LGraphNode} node - The node instance
 * @param {Array<Object>} highlights - Array of highlight configs
 *   Static color: {widgetName: string, color: string}
 *   Dynamic color: {widgetName: string, colorOn: string, colorOff: string}
 * 
 * @example
 * // Static color (always green)
 * setupWidgetHighlighting(node, [{widgetName: "seed", color: "#00ff00"}]);
 * 
 * // Dynamic color (green when ON, red when OFF)
 * setupWidgetHighlighting(node, [{
 *   widgetName: "use_commonparams", 
 *   colorOn: "#00ff00",   // Green when true
 *   colorOff: "#ff0000"   // Red when false
 * }]);
 * 
 * // Multiple widgets with mixed static/dynamic colors
 * setupWidgetHighlighting(node, [
 *   {widgetName: "batch_size", color: "#ff00ff"},              // Static magenta
 *   {widgetName: "use_lora", colorOn: "#00ff00", colorOff: "#ff0000"}  // Dynamic
 * ]);
 */
function setupWidgetHighlighting(node, highlights) {
    if (!highlights || highlights.length === 0) return;

    // Store highlight config on the node
    node.shimaHighlightedWidgets = highlights;

    // Set up widget value change callbacks to trigger redraws
    for (const highlight of highlights) {
        // Only set up callbacks for dynamic colors
        if (highlight.colorOn && highlight.colorOff) {
            const widget = node.widgets?.find(w => w.name === highlight.widgetName);
            if (widget) {
                // Hook into the widget's callback to force redraw on value change
                const origCallback = widget.callback;
                widget.callback = function (value) {
                    if (origCallback) {
                        origCallback.call(this, value);
                    }
                    // Trigger canvas redraw to update halo color
                    node.setDirtyCanvas(true, false);
                };
            }
        }
    }

    // Override onDrawForeground to draw halos
    const origOnDrawForeground = node.onDrawForeground;

    node.onDrawForeground = function (ctx) {
        // Draw halos FIRST (so widgets render on top)
        if (this.shimaHighlightedWidgets && this.widgets) {
            const NODE_TITLE_HEIGHT = LiteGraph.NODE_TITLE_HEIGHT || 30;
            const NODE_WIDGET_HEIGHT = LiteGraph.NODE_WIDGET_HEIGHT || 20;

            ctx.save();

            for (const highlight of this.shimaHighlightedWidgets) {
                const widget = this.widgets.find(w => w.name === highlight.widgetName);
                if (!widget || widget.type === "hidden") continue;

                const widgetIndex = this.widgets.indexOf(widget);

                // Determine color: dynamic (based on value) or static
                let highlightColor;
                if (highlight.colorOn && highlight.colorOff) {
                    // Dynamic color based on widget value
                    highlightColor = widget.value ? highlight.colorOn : highlight.colorOff;
                } else {
                    // Static color
                    highlightColor = highlight.color || "#00ff00";
                }

                // Calculate widget Y position
                const topMargin = 2;
                const extraOffset = 36; // Base offset for widget positioning
                const y = NODE_TITLE_HEIGHT + topMargin + (widgetIndex * NODE_WIDGET_HEIGHT) + extraOffset;

                // Halo dimensions (fine-tuned for ComfyUI's widget pills)
                const haloOffset = 3; // Border thickness
                const actualPillHeight = 16; // Actual rendered pill height

                const haloX = 16 - haloOffset;
                const haloY = y - haloOffset - 1;
                const haloWidth = this.size[0] - 32 + (haloOffset * 2);
                const haloHeight = actualPillHeight + 1 + (haloOffset * 2);
                const pillRadius = haloHeight / 1.8; // Slightly oval ends

                // Draw halo outline
                ctx.strokeStyle = highlightColor;
                ctx.lineWidth = 2;
                ctx.setLineDash([]);

                drawRoundedRect(ctx, haloX, haloY, haloWidth, haloHeight, pillRadius);
                ctx.stroke();

                // Add glow effect
                ctx.shadowColor = highlightColor;
                ctx.shadowBlur = 6;

                drawRoundedRect(ctx, haloX, haloY, haloWidth, haloHeight, pillRadius);
                ctx.stroke();

                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }

        // Call original draw AFTER halos
        if (origOnDrawForeground) {
            origOnDrawForeground.call(this, ctx);
        }
    };

    console.log(`[Shima] Widget highlighting configured for ${highlights.length} widget(s) with dynamic color support`);
}

/**
 * Add clickable toggle icons to node titlebar
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
 * setupTitlebarToggles(node, {
 *     useCommonParams: true,
 *     allowExternalLinking: true
 * });
 */
function setupTitlebarToggles(node, config = {}) {
    if (!config.useCommonParams && !config.allowExternalLinking) return;

    // Store config on node
    node.shimaTitlebarToggles = config;

    // Override onDrawTitleBar to add icons
    const origDrawTitleBar = node.onDrawTitleBar;

    node.onDrawTitleBar = function (ctx, title_height, size, scale, fgcolor) {
        // Call original title bar drawing first
        if (origDrawTitleBar) {
            origDrawTitleBar.call(this, ctx, title_height, size, scale, fgcolor);
        }

        if (this.flags.collapsed) return; // FIX: Hide Shima Topbar when collapsed

        // Draw toggle icons on the right side of titlebar
        const iconSize = 16;
        const iconPadding = 6;
        let xOffset = this.size[0] - iconPadding;

        ctx.save();
        ctx.font = `${iconSize}px Arial`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        // Common Params toggle
        if (config.useCommonParams) {
            const cpWidget = this.widgets?.find(w => w.name === "use_commonparams");
            if (cpWidget) {
                const icon = cpWidget.value ? "🟢" : "🔴";
                const yPos = title_height / 2;

                ctx.fillText(icon, xOffset, yPos);

                // Store click area for later
                if (!this.shimaTitlebarButtons) this.shimaTitlebarButtons = [];
                this.shimaTitlebarButtons.push({
                    widget: cpWidget,
                    x: xOffset - iconSize,
                    y: 0,
                    width: iconSize + iconPadding,
                    height: title_height,
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
                const yPos = title_height / 2;

                ctx.fillText(icon, xOffset, yPos);

                // Store click area
                if (!this.shimaTitlebarButtons) this.shimaTitlebarButtons = [];
                this.shimaTitlebarButtons.push({
                    widget: elWidget,
                    x: xOffset - iconSize,
                    y: 0,
                    width: iconSize + iconPadding,
                    height: title_height,
                    tooltip: elWidget.value ? "External linking allowed (Click to disable)" : "External linking disabled (Click to enable)"
                });
            }
        }

        ctx.restore();
    };

    // Override onMouseDown to handle clicks
    const origOnMouseDown = node.onMouseDown;

    node.onMouseDown = function (e, localPos, canvas) {
        // Check if click is in titlebar
        const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
        if (localPos[1] < titleHeight && this.shimaTitlebarButtons) {
            // Check each button
            for (const btn of this.shimaTitlebarButtons) {
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

    // Override onMouseMove for tooltips (future enhancement)
    const origOnMouseMove = node.onMouseMove;

    node.onMouseMove = function (e, localPos, canvas) {
        const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
        if (localPos[1] < titleHeight && this.shimaTitlebarButtons) {
            // Check if hovering over a button
            for (const btn of this.shimaTitlebarButtons) {
                if (localPos[0] >= btn.x &&
                    localPos[0] <= btn.x + btn.width &&
                    localPos[1] >= btn.y &&
                    localPos[1] <= btn.y + btn.height) {

                    // Could show tooltip here in the future
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

    console.log(`[Shima] Titlebar toggles configured: CP=${config.useCommonParams}, EL=${config.allowExternalLinking}`);
}

// Export utility functions for use in other modules
export { setupWidgetHighlighting, drawRoundedRect, setupTitlebarToggles };

/**
 * Calculate bounding box and set group position/size to encompass all nodes AND interior groups
 * Ported from old aegisflow_utility_nodes, enhanced to handle nested groups
 * @param {LGraphGroup} group - The group to resize
 * @param {Object|Array} nodes - Nodes to include in the group
 * @param {Array} interiorGroups - Optional array of interior groups to include in bounding box
 */
function addNodesToGroup(group, nodes = {}, interiorGroups = []) {
    let x1 = -1, y1 = -1, x2 = -1, y2 = -1;

    // Convert nodes object to array if needed
    const nodeArray = Array.isArray(nodes) ? nodes : Object.values(nodes);

    // Process nodes
    for (const node of nodeArray) {
        if (!node) continue;

        let nx1 = node.pos[0];
        let ny1 = node.pos[1];
        let nx2 = node.pos[0] + node.size[0];
        let ny2 = node.pos[1] + node.size[1];

        // Account for title height
        if (node.type !== "Reroute") {
            ny1 -= LiteGraph.NODE_TITLE_HEIGHT;
        }

        // Handle collapsed nodes
        if (node.flags?.collapsed) {
            ny2 = ny1 + LiteGraph.NODE_TITLE_HEIGHT;
            if (node._collapsed_width) {
                nx2 = nx1 + Math.round(node._collapsed_width);
            }
        }

        if (x1 === -1 || nx1 < x1) x1 = nx1;
        if (y1 === -1 || ny1 < y1) y1 = ny1;
        if (x2 === -1 || nx2 > x2) x2 = nx2;
        if (y2 === -1 || ny2 > y2) y2 = ny2;
    }

    // Process interior groups - include their bounding boxes too
    for (const g of interiorGroups) {
        if (!g || !g.pos || !g.size) continue;

        const gx1 = g.pos[0];
        const gy1 = g.pos[1];
        const gx2 = g.pos[0] + g.size[0];
        const gy2 = g.pos[1] + g.size[1];

        if (x1 === -1 || gx1 < x1) x1 = gx1;
        if (y1 === -1 || gy1 < y1) y1 = gy1;
        if (x2 === -1 || gx2 > x2) x2 = gx2;
        if (y2 === -1 || gy2 > y2) y2 = gy2;
    }

    const padding = 10;
    y1 = y1 - Math.round(group.font_size * 1.4);

    group.pos = [x1 - padding, y1 - padding];
    group.size = [x2 - x1 + padding * 2, y2 - y1 + padding * 2];
}

/**
 * Update UE group_regex in all nodes to use a specific suffix
 * This ensures UE connections only match within the same island chain
 * ONLY applies to nodes that are actually using Use Everywhere (or explicit Shima nodes)
 * to avoid breaking standard wired connections.
 * 
 * EXCEPTIONS (nodes that broadcast/receive outside the Island):
 * 1. Nodes with allow_external_linking property set to true
 * 2. Node title contains "allowexternal" (case-insensitive)
 * 3. Node already has a group_regex set (don't overwrite user's intent)
 * 
 * @param {Array} nodes - Array of node objects
 * @param {string} suffix - The group suffix to apply (e.g., "_A7xK")
 */
function updateUEGroupRegex(nodes, suffix) {
    for (const node of nodes) {
        if (node.properties && node.properties.ue_properties) {
            const props = node.properties;
            const ue = props.ue_properties;

            // === EXCEPTION CHECKS ===
            // 1. Check for "allow_external_linking" property (Shima toggle)
            if (props.allow_external_linking === true) {
                console.log(`[Shima] Skipping group regex for node (allow_external_linking): ${node.title || node.type}`);
                continue;
            }

            // 2. Check if title contains "allowexternal" (case-insensitive)
            const nodeTitle = node.title || "";
            if (nodeTitle.toLowerCase().includes("allowexternal")) {
                console.log(`[Shima] Skipping group regex for node (title contains allowexternal): ${nodeTitle}`);
                continue;
            }

            // 3. Don't overwrite existing group_regex (respect user's intent)
            if (ue.group_regex && ue.group_regex.length > 0) {
                console.log(`[Shima] Skipping group regex for node (already has regex "${ue.group_regex}"): ${node.title || node.type}`);
                continue;
            }

            // === APPLY GROUP REGEX ===
            // Check if node is actually using UE features
            // 1. Has explicit Shima "ue_convert" flag
            // 2. Has configured connectable/unconnectable regexes
            const isShimaNode = props.ue_convert === true;

            const hasUEConnections =
                (ue.widget_ue_connectable && Object.keys(ue.widget_ue_connectable).length > 0) ||
                (ue.input_ue_unconnectable && Object.keys(ue.input_ue_unconnectable).length > 0) ||
                (ue.output_not_broadcasting && Object.keys(ue.output_not_broadcasting).length > 0) ||
                (ue.input_regex && ue.input_regex.length > 0);

            // Only apply strict group regex if the node is effectively a "Broadcaster/Receiver"
            if (isShimaNode || hasUEConnections) {
                ue.group_regex = suffix;
            }
        }
    }
}

/**
 * Wait for selected nodes after paste operation
 * @param {number} timeout - Max time to wait in ms
 * @returns {Promise<Object>} Selected nodes or empty object
 */
function waitForPastedNodes(timeout = 3000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            const selected = app.canvas.selected_nodes;
            if (selected && Object.keys(selected).length > 0) {
                clearInterval(checkInterval);
                resolve(selected);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                resolve({});
            }
        }, 100);
    });
}

/**
 * Rename a Shima group and update all UE group_regex within it
 * @param {LGraphGroup} group - The group to rename
 * @param {string} newSuffix - The new suffix to apply
 */
function renameShimaGroup(group, newSuffix) {
    // Parse the current group title to extract the base name
    // Format: "Shima.IslandName_OldSuffix"
    const match = group.title.match(/^(Shima\.[^_]+)_(.+)$/);
    if (!match) {
        console.warn("[Shima] Group title doesn't match Shima format:", group.title);
        return false;
    }

    const baseName = match[1];
    const oldSuffix = match[2];

    // Update group title
    group.title = `${baseName}_${newSuffix}`;

    // Find all nodes inside this group and update their UE group_regex
    group.recomputeInsideNodes();
    const nodesInGroup = group._nodes || [];

    let updatedCount = 0;
    for (const node of nodesInGroup) {
        if (node.properties && node.properties.ue_properties) {
            // Check if this node's group_regex matches the old suffix
            if (node.properties.ue_properties.group_regex === oldSuffix) {
                node.properties.ue_properties.group_regex = newSuffix;
                updatedCount++;
            }
        }
    }

    // Mark graph as changed
    app.canvas.graph.change();

    console.log(`[Shima] Renamed group: ${baseName}_${oldSuffix} → ${baseName}_${newSuffix} (${updatedCount} UE nodes updated)`);
    return true;
}

/**
 * Show dialog to rename a Shima group
 * @param {LGraphGroup} group - The group to rename
 */
function showRenameDialog(group) {
    // Extract current suffix from group title
    const match = group.title.match(/^Shima\.[^_]+_(.+)$/);
    const currentSuffix = match ? match[1] : "";

    // Create dialog
    const dialog = document.createElement("div");
    dialog.className = "shima-dialog";
    dialog.innerHTML = `
        <div class="shima-dialog-content">
            <h3>🏝️ Rename Island Chain</h3>
            <p>Current: <strong>${group.title}</strong></p>
            <div class="shima-dialog-field">
                <label>New Suffix:</label>
                <input type="text" id="shima-new-suffix" value="${currentSuffix}" placeholder="e.g. K7XY" />
            </div>
            <div class="shima-dialog-buttons">
                <button id="shima-rename-cancel">Cancel</button>
                <button id="shima-rename-confirm" class="primary">Rename</button>
            </div>
        </div>
    `;

    // Add styles if not already present
    if (!document.getElementById("shima-rename-styles")) {
        const style = document.createElement("style");
        style.id = "shima-rename-styles";
        style.textContent = `
            .shima-dialog {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            .shima-dialog-content {
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 8px;
                padding: 20px;
                min-width: 350px;
                color: #fff;
            }
            .shima-dialog-content h3 {
                margin: 0 0 15px 0;
                font-size: 18px;
            }
            .shima-dialog-content p {
                margin: 0 0 15px 0;
                color: #aaa;
            }
            .shima-dialog-field {
                margin-bottom: 15px;
            }
            .shima-dialog-field label {
                display: block;
                margin-bottom: 5px;
                color: #ccc;
            }
            .shima-dialog-field input {
                width: 100%;
                padding: 8px;
                border: 1px solid #555;
                border-radius: 4px;
                background: #333;
                color: #fff;
                font-size: 14px;
                box-sizing: border-box;
            }
            .shima-dialog-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
            .shima-dialog-buttons button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            .shima-dialog-buttons button:not(.primary) {
                background: #444;
                color: #fff;
            }
            .shima-dialog-buttons button.primary {
                background: #3a5a7c;
                color: #fff;
            }
            .shima-dialog-buttons button:hover {
                opacity: 0.9;
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(dialog);

    // Focus input
    const input = dialog.querySelector("#shima-new-suffix");
    input.focus();
    input.select();

    // Handle confirm
    const confirmBtn = dialog.querySelector("#shima-rename-confirm");
    confirmBtn.addEventListener("click", () => {
        const newSuffix = input.value.trim();
        if (newSuffix && newSuffix !== currentSuffix) {
            renameShimaGroup(group, newSuffix);
        }
        document.body.removeChild(dialog);
    });

    // Handle cancel
    const cancelBtn = dialog.querySelector("#shima-rename-cancel");
    cancelBtn.addEventListener("click", () => {
        document.body.removeChild(dialog);
    });

    // Handle Enter key
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            confirmBtn.click();
        } else if (e.key === "Escape") {
            cancelBtn.click();
        }
    });
}

// ============================================================================
// Dynamic Widget Visibility Helpers
// ============================================================================

/**
 * Find a widget on a node by name
 * @param {LGraphNode} node - The node to search
 * @param {string} name - Widget name to find
 * @returns {object|null} The widget or null
 */
function findWidget(node, name) {
    return node.widgets?.find(w => w.name === name) || null;
}

/**
 * Set widget visibility while preserving node width
 * @param {LGraphNode} node - The node containing the widget
 * @param {string} widgetName - Name of widget to show/hide
 * @param {boolean} visible - Whether widget should be visible
 */
function setWidgetVisibility(node, widgetName, visible) {
    const widget = findWidget(node, widgetName);
    if (!widget) return;

    // Store current width to preserve it
    const currentWidth = node.size[0];

    // Store original properties if hiding for the first time
    if (!visible && widget.origType === undefined) {
        widget.origType = widget.type;
        widget.origComputeSize = widget.computeSize;
    }

    if (visible) {
        // Restore original widget
        if (widget.origType) {
            widget.type = widget.origType;
            widget.computeSize = widget.origComputeSize;
            delete widget.origType;
            delete widget.origComputeSize;
        }
    } else {
        // Hide widget by converting to "hidden" type
        widget.type = "hidden";
        widget.computeSize = () => [0, -4]; // Collapse space
    }

    // Recalculate height but preserve user-set width
    const newSize = node.computeSize();
    node.setSize([Math.max(currentWidth, newSize[0]), newSize[1]]);
    app.canvas.setDirty(true);
}

/**
 * Set up a widget to control visibility of other widgets
 * @param {LGraphNode} node - The node
 * @param {string} controlWidgetName - Widget that controls visibility
 * @param {object} visibilityMap - Map of control values to arrays of widget names to show
 * @param {Array} allControlledWidgets - All widgets that can be hidden
 */
function setupWidgetVisibilityControl(node, controlWidgetName, visibilityMap, allControlledWidgets) {
    const controlWidget = findWidget(node, controlWidgetName);
    if (!controlWidget) return;

    // Function to update visibility based on current value
    const updateVisibility = (value) => {
        const visibleWidgets = visibilityMap[value] || [];
        for (const widgetName of allControlledWidgets) {
            setWidgetVisibility(node, widgetName, visibleWidgets.includes(widgetName));
        }
    };

    // Store original callback
    const originalCallback = controlWidget.callback;

    // Set up callback for value changes
    controlWidget.callback = function (value) {
        updateVisibility(value);
        if (originalCallback) {
            originalCallback.call(this, value);
        }
    };

    // Apply initial visibility
    updateVisibility(controlWidget.value);
}

/**
 * Set up dynamic widgets for Shima.LatentMaker node
 * - Shows width/height only when aspect_ratio is "Custom"
 * @param {LGraphNode} node - The LatentMaker node
 */
function setupLatentMakerWidgets(node) {
    // Add toolbar (both toggles + show_values)
    addShimaToolbar(node, ["commonparams", "external_linking", "show_values"]);
    hideToolbarWidgets(node);

    // Set up used values display
    setupUsedValuesDisplay(node, "Shima.LatentMaker");

    // Preserve toolbar widget values
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking", "show_used_values"]);

    // Width and height should only be visible when aspect_ratio is "Custom"
    setupWidgetVisibilityControl(
        node,
        "aspect_ratio",
        {
            // Only "Custom" shows width/height
            "Custom": ["width", "height"],
            // All other values hide width/height
            "1:1 Square": [],
            "4:3 Standard": [],
            "3:4 Portrait": [],
            "16:9 Widescreen": [],
            "9:16 Vertical": [],
            "21:9 Ultrawide": [],
            "3:2 Photo": [],
            "2:3 Portrait Photo": [],
        },
        ["width", "height"]
    );

    // Enable Use Everywhere broadcasting for latentmaker.bndl
    setTimeout(() => {
        if (!node.properties) node.properties = {};
        node.properties.ue_properties = node.properties.ue_properties || {};

        // Unconditionally force correct broadcast properties
        node.properties.ue_properties.output_not_broadcasting = {
            "latent": true, "s33d": true, "width": true, "height": true
        };
        node.properties.ue_properties.input_regex = "latentmaker.bndl";
        node.properties.ue_properties.version = "7.0"; // Satisfy UE version check
        node.properties["ue_convert"] = true;

        if (app.graph) node.setDirtyCanvas(true, true);
        console.log("[Shima] Enabled exact regex UE broadcasting for Shima.LatentMaker");
    }, 100);
}

/**
 * Shima.ControlAgent - Toolbar setup
 * @param {LGraphNode} node - The ControlAgent node
 */
function setupControlAgentWidgets(node) {
    if (node.comfyClass !== "Shima.PanelControlAgent") {
        addShimaToolbar(node, ["commonparams", "external_linking"]);
    }
    hideToolbarWidgets(node);
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking"]);
}

/**
 * Shima.Sampler - Toolbar setup
 * Has both use_commonparams and allow_external_linking
 * @param {LGraphNode} node - The Sampler node
 */
function setupSamplerWidgets(node) {
    // Add toolbar (both toggles + show_values)
    addShimaToolbar(node, ["commonparams", "samplercommons", "external_linking", "show_values"]);
    hideToolbarWidgets(node);

    // Set up used values display
    setupUsedValuesDisplay(node, "Shima.Sampler");

    // Preserve critical widget values during serialization
    preserveWidgetValues(node, ["use_commonparams", "use_samplercommons", "allow_external_linking", "show_used_values", "vae_decode"]);

    // Removed port visual overrides
}

/**
 * Shima.SamplerCommons - Toolbar setup + model_type preset sync
 * @param {LGraphNode} node - The SamplerCommons node
 */
function setupSamplerCommonsWidgets(node) {
    addShimaToolbar(node, ["commonparams", "external_linking", "show_values"]);
    hideToolbarWidgets(node);
    setupUsedValuesDisplay(node, "Shima.SamplerCommons");
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking", "show_used_values"]);

    // Track last model_type for change detection
    node._lastModelType = "";

    // When execution completes, check if model_type changed and apply preset
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (data) {
        if (origOnExecuted) origOnExecuted.call(this, data);

        const newModelType = data?.model_type?.[0];
        const presetJson = data?.preset?.[0];

        if (newModelType && presetJson && newModelType !== this._lastModelType) {
            // Model type changed — update widgets to recommended preset
            try {
                const preset = JSON.parse(presetJson);
                const WIDGET_KEYS = ["steps", "cfg", "sampler_name", "scheduler", "denoise"];
                for (const key of WIDGET_KEYS) {
                    const w = this.widgets?.find(w => w.name === key);
                    if (w && preset[key] !== undefined) {
                        w.value = preset[key];
                        if (w.callback) w.callback(preset[key]);
                    }
                }
                console.log(`[SamplerCommons] Preset applied for ${newModelType}:`, preset);
                this.setDirtyCanvas(true, true);
            } catch (e) {
                console.error("[SamplerCommons] Failed to parse preset:", e);
            }
        }
        this._lastModelType = newModelType || "";
    };

    // Enable Use Everywhere broadcasting for shima.samplercommons
    setTimeout(() => {
        if (!node.properties) node.properties = {};
        node.properties.ue_properties = node.properties.ue_properties || {};

        // Unconditionally force correct broadcast properties
        node.properties.ue_properties.output_not_broadcasting = {
            "steps": true, "cfg": true, "sampler_name": true, "scheduler": true, "denoise": true
        };
        node.properties.ue_properties.input_regex = "shima.samplercommons";
        node.properties.ue_properties.version = "7.0"; // Satisfy UE version check
        node.properties["ue_convert"] = true;

        if (app.graph) node.setDirtyCanvas(true, true);
        console.log("[Shima] Enabled exact regex UE broadcasting for Shima.SamplerCommons");
    }, 100);
}

/**
 * Set up Shima.Styler (Iterator)
 */
function setupStylerWidgets(node) {
    // Add toolbar with external_linking and show_values
    addShimaToolbar(node, ["external_linking", "show_values"]);
    hideToolbarWidgets(node);

    // Set up used values display
    setupUsedValuesDisplay(node, "Shima.StyleIterator");

    // Preserve values
    preserveWidgetValues(node, ["allow_external_linking", "show_used_values"]);
}

/**
 * Shima.PhotoRemix - Toolbar and resolution handling
 * @param {LGraphNode} node - The PhotoRemix node
 */
function setupPhotoRemixWidgets(node) {
    // Add toolbar
    addShimaToolbar(node, ["commonparams", "external_linking", "show_values"]);
    hideToolbarWidgets(node);

    // Set up used values display
    setupUsedValuesDisplay(node, "Shima.PhotoRemix");

    // Preserve values
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking", "show_used_values", "resolution_mode", "bucket_width", "bucket_height"]);

    // Resolution Mode -> Bucket dimensions (only show if Custom)
    setupWidgetVisibilityControl(
        node,
        "resolution_mode",
        {
            "Custom": ["bucket_width", "bucket_height"],
            "Source": [],
            "SDXL Buckets": [],
            "SD1.5 Buckets": [],
            "Custom": ["bucket_width", "bucket_height"]
        },
        ["bucket_width", "bucket_height"]
    );

    console.log("[Shima] Set up dynamic widgets for PhotoRemix");
}


/**
 * Set up dynamic widgets for Shima.FileSaver node
 * - Shows collision_id_mode only when collision_id_enabled is true
 * - Shows timestamp_format only when timestamp_enabled is true
 * - Shows export_quality only when export_as is not PNG
 * @param {LGraphNode} node - The FileSaver node
 */
function setupFileSaverWidgets(node) {
    // Add toolbar (both toggles + show_values)
    addShimaToolbar(node, ["commonparams", "external_linking", "show_values"]);
    hideToolbarWidgets(node);

    // Set up used values display
    setupUsedValuesDisplay(node, "Shima.FileSaver");

    // Preserve toolbar widget values
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking", "show_used_values"]);

    // collision_id_mode visibility based on collision_id_enabled
    const collisionWidget = findWidget(node, "collision_id_enabled");
    if (collisionWidget) {
        const originalCollisionCallback = collisionWidget.callback;
        collisionWidget.callback = function (value) {
            setWidgetVisibility(node, "collision_id_mode", value);
            if (originalCollisionCallback) {
                originalCollisionCallback.call(this, value);
            }
        };
        // Initial state
        setWidgetVisibility(node, "collision_id_mode", collisionWidget.value);
    }

    // timestamp_format visibility based on timestamp_enabled
    const timestampWidget = findWidget(node, "timestamp_enabled");
    if (timestampWidget) {
        const originalTimestampCallback = timestampWidget.callback;
        timestampWidget.callback = function (value) {
            setWidgetVisibility(node, "timestamp_format", value);
            if (originalTimestampCallback) {
                originalTimestampCallback.call(this, value);
            }
        };
        // Initial state
        setWidgetVisibility(node, "timestamp_format", timestampWidget.value);
    }

    // export_quality visibility based on export_as (hide for PNG)
    const exportAsWidget = findWidget(node, "export_as");
    if (exportAsWidget) {
        const originalExportCallback = exportAsWidget.callback;
        exportAsWidget.callback = function (value) {
            setWidgetVisibility(node, "export_quality", value !== "PNG");
            if (originalExportCallback) {
                originalExportCallback.call(this, value);
            }
        };
        // Initial state
        setWidgetVisibility(node, "export_quality", exportAsWidget.value !== "PNG");
    }

    console.log("[Shima] Set up dynamic widgets for FileSaver");
}

/**
 * Set up dynamic widgets for Shima.FileNamer node
 * - Shows collision_id_mode only when collision_id_enabled is true
 * - Shows timestamp_format only when timestamp_enabled is true
 * @param {LGraphNode} node - The FileNamer node
 */
function setupFileNamerWidgets(node) {
    // Add toolbar (external_linking only - FileNamer doesn't use commonparams)
    addShimaToolbar(node, ["external_linking"]);
    hideToolbarWidgets(node);

    // collision_id_mode visibility based on collision_id_enabled
    const collisionWidget = findWidget(node, "collision_id_enabled");
    if (collisionWidget) {
        const originalCallback = collisionWidget.callback;
        collisionWidget.callback = function (value) {
            setWidgetVisibility(node, "collision_id_mode", value);
            if (originalCallback) {
                originalCallback.call(this, value);
            }
        };
        setWidgetVisibility(node, "collision_id_mode", collisionWidget.value);
    }

    // timestamp_format visibility based on timestamp_enabled
    const timestampWidget = findWidget(node, "timestamp_enabled");
    if (timestampWidget) {
        const originalCallback = timestampWidget.callback;
        timestampWidget.callback = function (value) {
            setWidgetVisibility(node, "timestamp_format", value);
            if (originalCallback) {
                originalCallback.call(this, value);
            }
        };
        setWidgetVisibility(node, "timestamp_format", timestampWidget.value);
    }

    console.log("[Shima] Set up dynamic widgets for FileNamer");
}

/**
 * Set up dynamic widgets for Shima.MultiSaver node
 * - Shows processing params only when their toggle is enabled
 * - Shows collision_id_mode and timestamp_format based on toggles
 * @param {LGraphNode} node - The MultiSaver node
 */
function setupMultiSaverWidgets(node) {
    // Add toolbar (both toggles + show_values)
    addShimaToolbar(node, ["commonparams", "external_linking", "show_values"]);
    hideToolbarWidgets(node);

    // Set up used values display
    setupUsedValuesDisplay(node, "Shima.MultiSaver");

    // Preserve toolbar widget values
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking", "show_used_values"]);

    // Map of toggle widget → parameter widgets to show/hide
    const toggleMap = {
        "save_lineart": ["lineart_model", "lineart_resolution", "lineart_reverse"],
        "save_canny": ["canny_low", "canny_high"],
        "save_depth": ["depth_model"],
        "save_normal": ["normal_model", "normal_strength"],
        "save_highlight": ["highlight_threshold"],
        "save_shadow": ["shadow_threshold"],
        "save_palette": ["palette_colors"],
        "collision_id_enabled": ["collision_id_mode"],
        "timestamp_enabled": ["timestamp_format"],
    };

    for (const [toggleName, paramNames] of Object.entries(toggleMap)) {
        const toggleWidget = findWidget(node, toggleName);
        if (!toggleWidget) continue;

        const originalCallback = toggleWidget.callback;
        toggleWidget.callback = function (value) {
            for (const paramName of paramNames) {
                setWidgetVisibility(node, paramName, value);
            }
            if (originalCallback) {
                originalCallback.call(this, value);
            }
        };

        // Apply initial visibility
        for (const paramName of paramNames) {
            setWidgetVisibility(node, paramName, toggleWidget.value);
        }
    }

    console.log("[Shima] Set up dynamic widgets for MultiSaver");
}

/**
 * Set up dynamic widgets for Shima.Commons node
 * - Shows width/height only when aspect_ratio is "Custom"
 * - Shows collision_id_mode based on collision_id_enabled
 * @param {LGraphNode} node - The Commons node
 */
function setupCommonsWidgets(node) {
    // Add toolbar (external_linking only - Commons doesn't use commonparams)
    addShimaToolbar(node, ["external_linking"]);
    hideToolbarWidgets(node);

    // Width and height should only be visible when aspect_ratio is "Custom"
    setupWidgetVisibilityControl(
        node,
        "aspect_ratio",
        {
            "Custom": ["width", "height"],
            "1:1 Square": [],
            "16:9 Widescreen": [],
            "4:3 Standard": [],
            "21:9 Ultrawide": [],
            "3:2 Photo": [],
            "1:1": [], "16:9": [], "9:16": [], "4:3": [], "3:4": [], "21:9": [],
            "SDXL": [], "SD1.5": []
        },
        ["width", "height"]
    );

    // Collision ID Mode
    const collisionWidget = findWidget(node, "collision_id_enabled");
    if (collisionWidget) {
        const originalCollisionCallback = collisionWidget.callback;
        collisionWidget.callback = function (value) {
            setWidgetVisibility(node, "collision_id_mode", value);
            if (originalCollisionCallback) originalCollisionCallback.call(this, value);
        };
        setWidgetVisibility(node, "collision_id_mode", collisionWidget.value);
    }

    console.log("[Shima] Set up dynamic widgets for Commons");

    // Enable Use Everywhere broadcasting by default
    setTimeout(() => {
        if (!node.properties) node.properties = {};
        node.properties.ue_properties = node.properties.ue_properties || {};

        // Unconditionally force correct broadcast properties
        node.properties.ue_properties.output_not_broadcasting = {
            // Disable all outputs except index 0 (shima.commonparams)
            "s33d": true, "WIDTH": true, "HEIGHT": true, "PROJECT_NAME": true,
            "SAVE_PATH": true, "COLLISION_ID": true, "TIMESTAMP": true, "CONTROL_AFTER_GENERATE": true
        };
        node.properties.ue_properties.input_regex = "shima.commonparams";
        node.properties.ue_properties.version = "7.0"; // Satisfy UE version check
        node.properties["ue_convert"] = true;

        if (app.graph) node.setDirtyCanvas(true, true);
        console.log("[Shima] Enabled exact regex UE broadcasting for Shima.Commons");
    }, 100);
}

/**
 * Set up Shima.StringConcat with auto-growing inputs
 * @param {LGraphNode} node 
 */
function setupConcatenatorWidgets(node) {
    // 1. Separator visibility
    setupWidgetVisibilityControl(
        node,
        "separator",
        {
            "Custom": ["custom_separator"],
            "None": [], "Space": [], "Comma": [], "Newline": []
        },
        ["custom_separator"]
    );

    // 2. Auto-grow logic
    // Ensure initial input exists
    if (!node.findInputSlot("string_1")) {
        // Might be called 'string_1' by Python, check existing
    }

    node.onConnectionsChange = function (slotType, slotIndex, isConnected, link_info, ioSlot) {
        if (slotType !== 1) return; // Only care about inputs (1)

        // Count string inputs
        let stringInputs = node.inputs.filter(inp => inp.name.startsWith("string_"));

        // If the last slot is connected, add a new one
        const lastIndex = node.inputs.length - 1;
        const lastInput = node.inputs[lastIndex];

        if (isConnected && slotIndex === lastIndex && lastInput.name.startsWith("string_")) {
            const nextIdx = stringInputs.length + 1;
            node.addInput(`string_${nextIdx}`, "STRING");
            // Force resize after a slight delay to ensure UI reflow
            setTimeout(() => {
                const calculatedHeight = (node.inputs.length * 20) + 50; // Manual fallback
                const computed = node.computeSize();
                // Use max of calculated or computed to avoid shrinking
                node.setSize([node.size[0], Math.max(calculatedHeight, computed[1])]);
                node.setDirtyCanvas(true, true);
            }, 50);
        }

        // Cleanup logic (optional): remove trailing unconnected slots if more than 1 free?
        // Let's stick to simple "Add on connect" for now.
    }
}

/**
 * Set up Shima.Preview node with Copy, Edit, Save buttons
 * @param {LGraphNode} node - The Preview node
 */
function setupShimaPreviewWidgets(node) {
    // Add toolbar with toggles AND action buttons
    addShimaToolbar(node, ["commonparams", "external_linking", "|", "copy", "folder", "edit", "save"]);
    hideToolbarWidgets(node);

    // Preserve toolbar widget values
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking"]);

    // Toolbar action callbacks
    node.onToolbarCopy = function () {
        if (this.shimaPreviewReady && this.shimaPreviewPaths.length > 0) {
            const idx = this.shimaFocusedIndex >= 0 ? this.shimaFocusedIndex : 0;
            shimaPreviewCopy([this.shimaPreviewPaths[idx]]);
        }
    };

    node.onToolbarFolder = function () {
        if (this.shimaPreviewReady && this.shimaPreviewPaths.length > 0) {
            const idx = this.shimaFocusedIndex >= 0 ? this.shimaFocusedIndex : 0;
            shimaPreviewOpen([this.shimaPreviewPaths[idx]], false);
        }
    };

    node.onToolbarEdit = function () {
        if (this.shimaPreviewReady && this.shimaPreviewPaths.length > 0) {
            const idx = this.shimaFocusedIndex >= 0 ? this.shimaFocusedIndex : 0;
            shimaPreviewOpen([this.shimaPreviewPaths[idx]], true);
        }
    };

    node.onToolbarSave = function () {
        if (this.shimaPreviewReady && this.shimaPreviewPaths.length > 0) {
            const idx = this.shimaFocusedIndex >= 0 ? this.shimaFocusedIndex : 0;
            shimaPreviewSaveAs([this.shimaPreviewPaths[idx]]);
        }
    };

    // Track preview state
    node.shimaPreviewPaths = [];
    node.shimaPreviewReady = false;
    node.shimaFocusedIndex = -1;  // -1 = all images, >=0 = specific image
    node.shimaBatchSize = 0;

    // Hook into onExecuted to capture preview info
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) {
            origOnExecuted.call(this, message);
        }

        // Mark as ready for buttons
        if (message?.images && message.images.length > 0) {
            this.shimaPreviewPaths = message.images.map((img) => img.filename);
            this.shimaPreviewReady = true;
            this.shimaBatchSize = message.images.length;
            this.shimaFocusedIndex = -1;  // Reset to "all" on new execution

            // Update dropdown selector and button container
            if (this.shimaButtonContainer) {
                this.shimaButtonContainer.style.display = "flex";
                updateImageSelector(this);
            }
        }
    };

    // Hook onDrawForeground to continuously sync dropdown with imageIndex
    // This detects when user clicks X to exit focus mode (DOM-based, not canvas events)
    const origOnDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        if (origOnDrawForeground) {
            origOnDrawForeground.call(this, ctx);
        }

        // Sync dropdown with actual imageIndex
        if (this.shimaPreviewReady && this.shimaBatchSize > 1 && this.shimaImageSelector) {
            const currentImgIndex = this.imageIndex;

            if (currentImgIndex === null || currentImgIndex === undefined) {
                // Focus mode exited - sync to "All"
                if (this.shimaFocusedIndex !== -1) {
                    this.shimaFocusedIndex = -1;
                    this.shimaImageSelector.value = "-1";
                }
            } else if (typeof currentImgIndex === 'number' && currentImgIndex >= 0) {
                // Focus mode entered via click - sync to specific image
                if (this.shimaFocusedIndex !== currentImgIndex) {
                    this.shimaFocusedIndex = currentImgIndex;
                    this.shimaImageSelector.value = currentImgIndex.toString();
                }
            }
        }
    };

    // Create image selector container as DOM widget (buttons now in toolbar)
    setTimeout(() => {
        try {
            // Preserve user-set node width
            const savedWidth = node.size[0];

            // Create container for image selector only
            const container = document.createElement("div");
            container.style.cssText = "display: none; gap: 8px; padding: 6px 10px; justify-content: center; align-items: center;";

            // Image selector dropdown (only shown for batches)
            const selector = document.createElement("select");
            selector.id = "shima-image-selector";
            selector.style.cssText = "padding: 5px 8px; border-radius: 4px; border: 1px solid #555; background: #333; color: white; font-size: 12px;";
            selector.onchange = (e) => {
                e.stopPropagation();
                const selectedIndex = parseInt(selector.value);
                node.shimaFocusedIndex = selectedIndex;

                // Sync with ComfyUI's preview widget (imageIndex)
                if (selectedIndex >= 0 && node.imgs && node.imgs.length > selectedIndex) {
                    node.imageIndex = selectedIndex;
                } else {
                    // "All" selected - exit focus mode by clearing imageIndex
                    node.imageIndex = null;
                }
                node.setDirtyCanvas(true, true);  // Force redraw
            };
            container.appendChild(selector);
            node.shimaImageSelector = selector;

            // Add as DOM widget with fixed height
            const widget = node.addDOMWidget("shima_buttons", "div", container, {
                serialize: false,
                hideOnZoom: false,
            });
            // Fix widget height
            if (widget) {
                widget.computeSize = () => [node.size[0], 36];
            }

            node.shimaButtonContainer = container;

            // Restore width, compute height (respecting user resize)
            const newSize = node.computeSize();
            node.setSize([savedWidth, Math.max(node.size[1], newSize[1])]);
        } catch (err) {
            console.error("[Shima] Failed to create preview selector:", err);
        }
    }, 100);

    console.log("[Shima] Set up Preview node with toolbar actions");
}

/**
 * Set up Shima.PreviewCompare node with before/after slider
 * @param {LGraphNode} node - The PreviewCompare node
 */
function setupShimaCompareWidgets(node) {
    // Add toolbar with toggles AND action buttons
    addShimaToolbar(node, ["commonparams", "external_linking", "|", "copy", "folder", "edit", "save"]);
    hideToolbarWidgets(node);

    // Preserve toolbar widget values
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking"]);

    // ----- Compare State -----
    node.shimaCompareSide = "left";    // which side is selected for actions
    node.shimaSliderPos = 0.5;         // 0.0-1.0, horizontal fraction
    node.shimaDraggingSlider = false;
    node.shimaLeftPaths = [];
    node.shimaRightPaths = [];
    node.shimaLeftImg = null;           // HTMLImageElement
    node.shimaRightImg = null;          // HTMLImageElement
    node.shimaCompareReady = false;

    // ----- Toolbar action callbacks -----
    node.onToolbarCopy = function () {
        if (!this.shimaCompareReady) return;
        const paths = this.shimaCompareSide === "left" ? this.shimaLeftPaths : this.shimaRightPaths;
        if (paths.length > 0) shimaPreviewCopy([paths[0]]);
    };
    node.onToolbarFolder = function () {
        if (!this.shimaCompareReady) return;
        const paths = this.shimaCompareSide === "left" ? this.shimaLeftPaths : this.shimaRightPaths;
        if (paths.length > 0) shimaPreviewOpen([paths[0]], false);
    };
    node.onToolbarEdit = function () {
        if (!this.shimaCompareReady) return;
        const paths = this.shimaCompareSide === "left" ? this.shimaLeftPaths : this.shimaRightPaths;
        if (paths.length > 0) shimaPreviewOpen([paths[0]], true);
    };
    node.onToolbarSave = function () {
        if (!this.shimaCompareReady) return;
        const paths = this.shimaCompareSide === "left" ? this.shimaLeftPaths : this.shimaRightPaths;
        if (paths.length > 0) shimaPreviewSaveAs([paths[0]]);
    };

    // ----- onExecuted: load both image sets -----
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) origOnExecuted.call(this, message);

        const compareArray = message?.shima_compare;
        const compareData = Array.isArray(compareArray) ? compareArray[0] : compareArray;

        if (compareData) {
            this.shimaLeftPaths = compareData.left_filenames || [];
            this.shimaRightPaths = compareData.right_filenames || [];

            // Load left image
            if (this.shimaLeftPaths.length > 0) {
                const leftImg = new Image();
                leftImg.src = `/view?filename=${encodeURIComponent(this.shimaLeftPaths[0])}&type=temp&t=${Date.now()}`;
                leftImg.onload = () => {
                    this.shimaLeftImg = leftImg;
                    this.setDirtyCanvas(true, true);
                };
            }
            // Load right image
            if (this.shimaRightPaths.length > 0) {
                const rightImg = new Image();
                rightImg.src = `/view?filename=${encodeURIComponent(this.shimaRightPaths[0])}&type=temp&t=${Date.now()}`;
                rightImg.onload = () => {
                    this.shimaRightImg = rightImg;
                    this.setDirtyCanvas(true, true);
                };
            }

            this.shimaCompareReady = true;
            this.shimaSliderPos = 0.5;
            this.shimaFitMode = compareData.fit_mode || "Squeeze";

            // Show side selector
            if (this.shimaSideContainer) {
                this.shimaSideContainer.style.display = "flex";
            }
        }
    };

    // ----- Canvas rendering: clip-based before/after -----
    const origOnDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        // Let ComfyUI draw its normal preview first
        if (origOnDrawForeground) origOnDrawForeground.call(this, ctx);

        if (!this.shimaCompareReady || !this.shimaLeftImg || !this.shimaRightImg) return;

        // Calculate image area: starts below all widgets, ends above the DOM selector
        const titleH = LiteGraph.NODE_TITLE_HEIGHT || 20;
        const domWidgetH = 44; // height of our LEFT/RIGHT DOM widget

        // Find the bottom of the last widget to know where the image area starts
        let widgetsEndY = titleH;
        if (this.widgets && this.widgets.length > 0) {
            for (const w of this.widgets) {
                if (w.last_y !== undefined && w.computeSize) {
                    const wh = w.computeSize ? w.computeSize()[1] : 20;
                    widgetsEndY = Math.max(widgetsEndY, w.last_y + wh + 6);
                }
            }
        }
        // Also account for input slots
        if (this.inputs) {
            const slotBottom = titleH + this.inputs.length * LiteGraph.NODE_SLOT_HEIGHT;
            widgetsEndY = Math.max(widgetsEndY, slotBottom);
        }

        const areaX = 0;
        const areaY = widgetsEndY;
        const areaW = this.size[0];
        const areaH = this.size[1] - widgetsEndY - domWidgetH;

        if (areaW <= 0 || areaH <= 0) return;

        // ------ Determine display dimensions (scale larger to smaller) ------
        const lw = this.shimaLeftImg.naturalWidth;
        const lh = this.shimaLeftImg.naturalHeight;
        const rw = this.shimaRightImg.naturalWidth;
        const rh = this.shimaRightImg.naturalHeight;

        const fitMode = this.shimaFitMode || "Squeeze";
        let targetAspect;

        if (fitMode === "Crop to Left" && lw && lh) {
            targetAspect = lw / lh;
        } else if (fitMode === "Crop to Right" && rw && rh) {
            targetAspect = rw / rh;
        } else {
            // Squeeze / default: Use the smaller resolution as target for visual display
            const targetW = Math.min(lw, rw);
            const targetH = Math.min(lh, rh);
            targetAspect = targetW / targetH;
        }

        // Fit into available area while preserving aspect ratio
        const areaAspect = areaW / areaH;

        let drawW, drawH;
        if (targetAspect > areaAspect) {
            drawW = areaW;
            drawH = areaW / targetAspect;
        } else {
            drawH = areaH;
            drawW = areaH * targetAspect;
        }

        const drawX = areaX + (areaW - drawW) / 2;
        const drawY = areaY + (areaH - drawH) / 2;

        // Slider X position
        const sliderX = drawX + drawW * this.shimaSliderPos;

        ctx.save();

        // Helper for centered cropping
        const drawImageCropped = (img, dX, dY, dW, dH, aspect) => {
            const iW = img.naturalWidth;
            const iH = img.naturalHeight;
            const iAspect = iW / iH;

            let sX = 0, sY = 0, sW = iW, sH = iH;

            if (fitMode !== "Squeeze") {
                if (iAspect > aspect) {
                    sW = iH * aspect;
                    sX = (iW - sW) / 2;
                } else {
                    sH = iW / aspect;
                    sY = (iH - sH) / 2;
                }
            }
            ctx.drawImage(img, sX, sY, sW, sH, dX, dY, dW, dH);
        };

        // Draw LEFT image (full width, clipped to left of slider)
        ctx.save();
        ctx.beginPath();
        ctx.rect(drawX, drawY, sliderX - drawX, drawH);
        ctx.clip();
        drawImageCropped(this.shimaLeftImg, drawX, drawY, drawW, drawH, targetAspect);
        ctx.restore();

        // Draw RIGHT image (full width, clipped to right of slider)
        ctx.save();
        ctx.beginPath();
        ctx.rect(sliderX, drawY, drawX + drawW - sliderX, drawH);
        ctx.clip();
        drawImageCropped(this.shimaRightImg, drawX, drawY, drawW, drawH, targetAspect);
        ctx.restore();

        // Draw slider line
        ctx.beginPath();
        ctx.moveTo(sliderX, drawY);
        ctx.lineTo(sliderX, drawY + drawH);
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw slider handle (circle)
        const handleY = drawY + drawH / 2;
        ctx.beginPath();
        ctx.arc(sliderX, handleY, 10, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw arrows on handle
        ctx.fillStyle = "#333";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("◀▶", sliderX, handleY);

        // Draw side labels
        ctx.font = "bold 13px sans-serif";
        ctx.textBaseline = "top";
        // Left label
        ctx.textAlign = "left";
        const leftLabel = this.shimaCompareSide === "left" ? "◀ LEFT ✓" : "◀ LEFT";
        ctx.fillStyle = this.shimaCompareSide === "left" ? "rgba(0,200,100,0.85)" : "rgba(255,255,255,0.6)";
        ctx.fillText(leftLabel, drawX + 6, drawY + 6);
        // Right label
        ctx.textAlign = "right";
        const rightLabel = this.shimaCompareSide === "right" ? "✓ RIGHT ▶" : "RIGHT ▶";
        ctx.fillStyle = this.shimaCompareSide === "right" ? "rgba(0,200,100,0.85)" : "rgba(255,255,255,0.6)";
        ctx.fillText(rightLabel, drawX + drawW - 6, drawY + 6);

        // Store bounds for mouse interaction
        this._compareBounds = { x: drawX, y: drawY, w: drawW, h: drawH };

        ctx.restore();
    };

    // ----- Mouse interaction: drag slider or select side -----
    const origOnMouseDown = node.onMouseDown;
    node.onMouseDown = function (e, localPos, canvas) {
        if (this._compareBounds && this.shimaCompareReady) {
            const b = this._compareBounds;
            const mx = localPos[0];
            const my = localPos[1];

            if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
                const sliderX = b.x + b.w * this.shimaSliderPos;

                // Check if near slider line (±12px for easy grabbing)
                if (Math.abs(mx - sliderX) <= 12) {
                    this.shimaDraggingSlider = true;
                    return true; // consume event
                } else {
                    // Click on a side = select it
                    this.shimaCompareSide = mx < sliderX ? "left" : "right";
                    if (this.shimaSideLeftBtn && this.shimaSideRightBtn) {
                        this.shimaSideLeftBtn.style.background = this.shimaCompareSide === "left" ? "#0a8" : "#444";
                        this.shimaSideRightBtn.style.background = this.shimaCompareSide === "right" ? "#0a8" : "#444";
                    }
                    this.setDirtyCanvas(true, true);
                    showShimaNotification(`🎯 Selected: ${this.shimaCompareSide.toUpperCase()}`);
                    return true;
                }
            }
        }
        if (origOnMouseDown) return origOnMouseDown.call(this, e, localPos, canvas);
    };

    const origOnMouseMove = node.onMouseMove;
    node.onMouseMove = function (e, localPos, canvas) {
        if (this.shimaDraggingSlider && this._compareBounds) {
            const b = this._compareBounds;
            const mx = localPos[0];
            this.shimaSliderPos = Math.max(0.02, Math.min(0.98, (mx - b.x) / b.w));
            this.setDirtyCanvas(true, true);
            return true;
        }
        if (origOnMouseMove) return origOnMouseMove.call(this, e, localPos, canvas);
    };

    const origOnMouseUp = node.onMouseUp;
    node.onMouseUp = function (e, localPos, canvas) {
        if (this.shimaDraggingSlider) {
            this.shimaDraggingSlider = false;
            return true;
        }
        if (origOnMouseUp) return origOnMouseUp.call(this, e, localPos, canvas);
    };

    // ----- DOM widget: side selector buttons -----
    setTimeout(() => {
        try {
            const savedWidth = node.size[0];

            const container = document.createElement("div");
            container.style.cssText = "display: none; gap: 6px; padding: 6px 10px; justify-content: center; align-items: center;";

            const btnStyle = "flex: 1; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; color: white; transition: background 0.15s;";

            // LEFT button
            const leftBtn = document.createElement("button");
            leftBtn.innerHTML = "◀ LEFT";
            leftBtn.title = "Select left image for toolbar actions";
            leftBtn.style.cssText = btnStyle + "background: #0a8;";
            leftBtn.onclick = (e) => {
                e.stopPropagation();
                node.shimaCompareSide = "left";
                leftBtn.style.background = "#0a8";
                rightBtn.style.background = "#444";
                node.setDirtyCanvas(true, true);
                showShimaNotification("🎯 Selected: LEFT");
            };
            container.appendChild(leftBtn);
            node.shimaSideLeftBtn = leftBtn;

            // RIGHT button
            const rightBtn = document.createElement("button");
            rightBtn.innerHTML = "RIGHT ▶";
            rightBtn.title = "Select right image for toolbar actions";
            rightBtn.style.cssText = btnStyle + "background: #444;";
            rightBtn.onclick = (e) => {
                e.stopPropagation();
                node.shimaCompareSide = "right";
                rightBtn.style.background = "#0a8";
                leftBtn.style.background = "#444";
                node.setDirtyCanvas(true, true);
                showShimaNotification("🎯 Selected: RIGHT");
            };
            container.appendChild(rightBtn);
            node.shimaSideRightBtn = rightBtn;

            // Add as DOM widget
            const widget = node.addDOMWidget("shima_compare_selector", "div", container, {
                serialize: false,
                hideOnZoom: false,
            });
            if (widget) {
                widget.computeSize = () => [node.size[0], 36];
            }

            node.shimaSideContainer = container;

            // Set initial size (wider for comparison)
            const newSize = node.computeSize();
            node.setSize([Math.max(savedWidth, 380), Math.max(node.size[1], newSize[1], 350)]);
        } catch (err) {
            console.error("[Shima] Failed to create compare selector:", err);
        }
    }, 100);

    console.log("[Shima] Set up PreviewCompare node with slider");
}

/**
 * Set up Shima.CarouselPreview node with navigation
 * @param {LGraphNode} node - The CarouselPreview node
 */
function setupShimaCarouselWidgets(node) {
    // Add toolbar (external_linking only)
    addShimaToolbar(node, ["external_linking"]);
    hideToolbarWidgets(node);

    // Track carousel state
    node.shimaCarouselGroups = [];
    node.shimaCurrentGroup = 0;
    node.shimaReady = false;

    // Hook into onExecuted to capture group info
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) {
            origOnExecuted.call(this, message);
        }

        // Restore original images if they were filtered, to ensure we start fresh
        if (this.shimaAllImages && this.shimaAllImages.length > 0) {
            console.log("[Shima Carousel] Resetting internal cache for new execution");
            this.shimaAllImages = [];
            this.imageIndex = null; // Ensure we aren't locked to a specific index
        }

        // Capture carousel data from UI message (wrapped in array to prevent ComfyUI flattening)
        const carouselArray = message?.shima_carousel;
        const carouselData = Array.isArray(carouselArray) ? carouselArray[0] : carouselArray;
        if (carouselData && carouselData.groups) {
            this.shimaCarouselGroups = carouselData.groups || [];
            this.shimaGroupImages = carouselData.group_images || {};

            // Persist state for redraws
            if (!this.properties) this.properties = {};
            this.properties.carousel_groups = this.shimaCarouselGroups;
            this.properties.carousel_group_images = this.shimaGroupImages;

            this.shimaCurrentGroup = 0;
            this.shimaReady = true;

            // Capture images after a delay to allow them to load
            this.imageIndex = null;
            this.shimaAllImages = []; // Clear manual cache

            // Wait for images to load (polling based on expected count)
            // message.images is array of filenames
            const expectedCount = message.images ? message.images.length : 0;

            const captureAndFilter = () => {
                // Wait until ComfyUI populates this.imgs
                if (this.imgs && this.imgs.length >= expectedCount && expectedCount > 0) {
                    console.log(`[Shima Carousel] Images loaded: ${this.imgs.length}/${expectedCount}. Resetting cache.`);
                    this.shimaAllImages = [...this.imgs];

                    if (this.shimaNavContainer) {
                        this.shimaNavContainer.style.display = "flex";
                        updateCarouselNav(this);
                        filterCarouselImages(this);
                    }
                } else if (expectedCount === 0) {
                    // No images?
                } else {
                    // Keep waiting
                    setTimeout(captureAndFilter, 100);
                }
            };

            setTimeout(captureAndFilter, 100);
        }
    };

    // Create navigation container as DOM widget
    setTimeout(() => {
        try {
            const savedWidth = node.size[0];

            // Restore state from properties if available (for redraws)
            if (node.properties && node.properties.carousel_groups) {
                node.shimaCarouselGroups = node.properties.carousel_groups;
                node.shimaGroupImages = node.properties.carousel_group_images;
                node.shimaReady = true;
            }

            // Create container for navigation
            const container = document.createElement("div");
            container.style.cssText = "display: none; gap: 8px; padding: 6px 10px; justify-content: center; align-items: center;";

            const btnStyle = "padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;";

            // Refresh Button (NEW)
            const refreshBtn = document.createElement("button");
            refreshBtn.innerHTML = "🔄";
            refreshBtn.title = "Refresh Sorting";
            refreshBtn.style.cssText = btnStyle + "background: #444; color: white; padding: 6px 8px;";
            refreshBtn.onclick = (e) => {
                e.stopPropagation();
                // Force reset cache from current images
                if (node.imgs && node.imgs.length > 0) {
                    node.shimaAllImages = [...node.imgs];
                    updateCarouselNav(node);
                    filterCarouselImages(node);
                    showShimaNotification("🔄 Resorted!");
                }
            };
            container.appendChild(refreshBtn);

            // Previous button
            const prevBtn = document.createElement("button");
            prevBtn.innerHTML = "◀";
            prevBtn.title = "Previous batch";
            prevBtn.style.cssText = btnStyle + "background: #555; color: white;";
            prevBtn.onclick = (e) => {
                e.stopPropagation();
                if (node.shimaCurrentGroup > 0) {
                    node.shimaCurrentGroup--;
                    updateCarouselNav(node);
                    filterCarouselImages(node);
                }
            };
            container.appendChild(prevBtn);
            node.shimaPrevBtn = prevBtn;

            // Manual auto-restore trigger if images exist
            if (node.shimaReady && node.imgs && node.imgs.length > 0) {
                // Defer slightly to ensure widget attached
                setTimeout(() => {
                    // Check if we need to hydrate cache
                    if (!node.shimaAllImages || node.shimaAllImages.length === 0) {
                        // Assume current images are the full set (best guess for redraw)
                        node.shimaAllImages = [...node.imgs];
                        container.style.display = "flex";
                        updateCarouselNav(node);
                        // Don't force filter on load to avoid flashing, let user click refresh if needed?
                        // Actually, if we are sure, filter it.
                        filterCarouselImages(node);
                    }
                }, 500);
            }

            // Group label
            const label = document.createElement("span");
            label.style.cssText = "padding: 6px 12px; background: #333; border-radius: 4px; color: white; font-size: 12px; min-width: 100px; text-align: center;";
            label.textContent = "No groups";
            container.appendChild(label);
            node.shimaGroupLabel = label;

            // Next button
            const nextBtn = document.createElement("button");
            nextBtn.innerHTML = "▶";
            nextBtn.title = "Next batch";
            nextBtn.style.cssText = btnStyle + "background: #555; color: white;";
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                if (node.shimaCurrentGroup < node.shimaCarouselGroups.length - 1) {
                    node.shimaCurrentGroup++;
                    updateCarouselNav(node);
                    filterCarouselImages(node);
                }
            };
            container.appendChild(nextBtn);
            node.shimaNextBtn = nextBtn;

            // Add as DOM widget
            const widget = node.addDOMWidget("shima_carousel_nav", "div", container, {
                serialize: false,
                hideOnZoom: false,
            });
            if (widget) {
                widget.computeSize = () => [node.size[0], 36];
            }

            node.shimaNavContainer = container;

            const newSize = node.computeSize();
            node.setSize([savedWidth, newSize[1]]);
        } catch (err) {
            console.error("[Shima] Failed to create carousel navigation:", err);
        }
    }, 100);

    console.log("[Shima] Set up CarouselPreview node with navigation");
}

/** Update carousel navigation display */
function updateCarouselNav(node) {
    if (!node.shimaNavContainer) return;

    const groups = node.shimaCarouselGroups;
    const current = node.shimaCurrentGroup;

    // Update label
    if (node.shimaGroupLabel) {
        if (groups.length > 0) {
            const groupName = groups[current] || "Group";
            node.shimaGroupLabel.textContent = `${groupName} (${current + 1}/${groups.length})`;
        } else {
            node.shimaGroupLabel.textContent = "No groups";
        }
    }

    // Update button states
    if (node.shimaPrevBtn) {
        node.shimaPrevBtn.style.opacity = current > 0 ? "1" : "0.5";
        node.shimaPrevBtn.disabled = current <= 0;
    }
    if (node.shimaNextBtn) {
        node.shimaNextBtn.style.opacity = current < groups.length - 1 ? "1" : "0.5";
        node.shimaNextBtn.disabled = current >= groups.length - 1;
    }
}

/** Filter carousel images to show only current group */
function filterCarouselImages(node) {
    try {
        if (!node.shimaAllImages || !node.shimaGroupImages) {
            console.log("[Shima Carousel] No images to filter");
            return;
        }

        const current = node.shimaCurrentGroup;
        const indices = node.shimaGroupImages[current];

        if (!indices || indices.length === 0) {
            return;
        }

        // Filter to only show images for current group
        const allImages = node.shimaAllImages;
        const filteredImages = [];

        for (const idx of indices) {
            if (idx >= 0 && idx < allImages.length && allImages[idx]) {
                filteredImages.push(allImages[idx]);
            }
        }

        if (filteredImages.length === 0) {
            return;
        }

        // Create new array instead of mutating - safer for desktop app
        node.imgs = filteredImages.slice();
        node.imageIndex = null;  // Reset to show all

        // Use requestAnimationFrame for smoother update
        requestAnimationFrame(() => {
            if (node.setDirtyCanvas) {
                node.setDirtyCanvas(true, true);
            }
        });
    } catch (err) {
        console.error("[Shima Carousel] Filter error:", err);
    }
}

/** Check if point is within bounds */
function isInBounds(x, y, bounds) {
    return x >= bounds.x && x <= bounds.x + bounds.w &&
        y >= bounds.y && y <= bounds.y + bounds.h;
}

/** Copy preview image to clipboard */
async function shimaPreviewCopy(filenames) {
    if (!filenames || filenames.length === 0) return;

    try {
        const filename = filenames[0];
        const response = await fetch(`/view?filename=${filename}&type=temp`);
        const blob = await response.blob();

        await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
        ]);

        showShimaNotification("📋 Copied to clipboard!");
    } catch (error) {
        console.error("[Shima] Copy failed:", error);
        showShimaNotification("❌ Copy failed: " + error.message);
    }
}

/** Open preview image in folder or editor */
async function shimaPreviewOpen(filenames, useEditor = false) {
    if (!filenames || filenames.length === 0) return;

    try {
        const filename = filenames[0];
        const editorPath = useEditor ? getShimaSetting("editorPath") : "";

        const response = await api.fetchApi("/shima/preview/open_editor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                path: `temp/${filename}`,
                editor_path: editorPath,
            }),
        });

        if (useEditor && editorPath) {
            showShimaNotification("🖌️ Opening in editor...");
        } else {
            showShimaNotification("📂 Opening folder...");
        }
    } catch (error) {
        console.error("[Shima] Open failed:", error);
    }
}

/** Save preview image to filesystem via browser download (Save As dialog) */
async function shimaPreviewSaveAs(filenames) {
    if (!filenames || filenames.length === 0) return;

    for (const filename of filenames) {
        const link = document.createElement("a");
        // Preview images are in temp/ unless persisted. 
        // type=temp is required for ComfyUI's /view endpoint for these.
        link.href = `/view?filename=${encodeURIComponent(filename)}&type=temp`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    if (filenames.length > 0) {
        showShimaNotification(`💾 Opening system save dialog for ${filenames.length} image(s)...`);
    }
}

/** Save preview image to filesystem (Server-side auto-save) */
async function shimaPreviewSave(focusedIndex = -1) {
    try {
        const response = await api.fetchApi("/shima/preview/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                focused_index: focusedIndex,
                default_folder: getShimaSetting("defaultOutputFolder")
            }),
        });

        const data = await response.json();
        if (data.success) {
            showShimaNotification(`💾 Saved ${data.count} image(s)!`);
        } else {
            showShimaNotification("❌ Save failed: " + data.error);
        }
    } catch (error) {
        console.error("[Shima] Save failed:", error);
        showShimaNotification("❌ Save failed: " + error.message);
    }
}

/** Update image selector dropdown and Save button when batch size changes */
function updateImageSelector(node) {
    if (!node.shimaButtonContainer) return;

    const selector = node.shimaImageSelector;
    const saveBtn = node.shimaButtonContainer.querySelector("button:last-child");

    if (node.shimaBatchSize > 1) {
        // Populate selector (hidden - used for internal state tracking)
        if (selector) {
            // Keep hidden - selector.style.display = "inline-block";
            selector.innerHTML = "";

            // Add "All" option
            const allOpt = document.createElement("option");
            allOpt.value = "-1";
            allOpt.text = `All (${node.shimaBatchSize})`;
            selector.appendChild(allOpt);

            // Add individual options
            for (let i = 0; i < node.shimaBatchSize; i++) {
                const opt = document.createElement("option");
                opt.value = i.toString();
                opt.text = `#${i + 1}`;
                selector.appendChild(opt);
            }

            // Set current selection
            selector.value = node.shimaFocusedIndex.toString();
        }

        // Save button text - just "Save" (dropdown indicates selection)
        if (saveBtn) {
            saveBtn.innerHTML = "💾 Save";
        }
    } else {
        // Single image - hide selector
        if (selector) {
            selector.style.display = "none";
        }
        if (saveBtn) {
            saveBtn.innerHTML = "💾 Save";
        }
    }
}

/** Show brief notification */
function showShimaNotification(message) {
    // Use ComfyUI's notification system if available
    if (app.ui && app.ui.dialog) {
        app.ui.dialog.show(message);
        setTimeout(() => app.ui.dialog.close(), 2000);
    } else {
        console.log("[Shima]", message);
    }
}
// [Old State section removed - superseded by Remote Islands section]

/**
 * Clipboard helper - runs callback then restores original clipboard
 */
async function clipboardAction(cb) {
    const old = localStorage.getItem("litegrapheditor_clipboard");
    await cb();
    // Add small delay to ensure paste reads the data before we restore
    await new Promise(r => setTimeout(r, 100));
    if (old) {
        localStorage.setItem("litegrapheditor_clipboard", old);
    }
}

/**
 * Load an island workflow into the graph (ADDING to existing, not replacing)
 * Transforms the data to match ComfyUI's expected clipboard/template format
 * @param {Object} island - Island metadata
 * @param {string} suffix - Optional group suffix (auto-generated if not provided)
 * @returns {Promise<Object>} Loaded workflow data
 */
async function loadIsland(island, suffix = null) {
    try {
        let workflow;

        // If workflow is already provided (remote islands), use it directly
        if (island.workflow) {
            workflow = island.workflow;
            console.log(`[Shima] Using pre-downloaded workflow for "${island.name}"`);
        } else {
            // Fetch from local ComfyUI API (local islands)
            const response = await api.fetchApi(`/shima/island/${island.file}`);
            workflow = await response.json();

            if (workflow.error) {
                alert("Failed to load island: " + workflow.error);
                return null;
            }
        }

        if (!workflow.nodes || workflow.nodes.length === 0) {
            console.warn("[Shima] Island has no nodes");
            return null;
        }

        // Generate suffix if not provided
        const groupSuffix = suffix || randomString(4);

        // Update UE group_regex in all nodes BEFORE pasting
        updateUEGroupRegex(workflow.nodes, groupSuffix);

        // Use clipboard action pattern from old Shima code
        await clipboardAction(async () => {
            // Prepare clipboard data in the format ComfyUI expects
            // Sanitize extra data to avoid conflicting state (like cached UE links from the saved file)
            let safeExtra = {};
            if (workflow.extra) {
                try {
                    safeExtra = JSON.parse(JSON.stringify(workflow.extra));
                    // Remove UE-specific state that might force disconnections or stale logic
                    delete safeExtra.ue_links;
                    delete safeExtra.links_added_by_ue;
                    // Remove view state
                    delete safeExtra.ds;
                } catch (e) {
                    console.warn("[Shima] Failed to sanitize extra data", e);
                    safeExtra = {};
                }
            }

            // Transform links from array format to object format
            // Workflow JSON stores links as: [id, origin_id, origin_slot, target_id, target_slot, type]
            // Clipboard expects objects: {id, origin_id, origin_slot, target_id, target_slot, type}
            const rawLinks = JSON.parse(JSON.stringify(workflow.links || []));
            const safeLinks = rawLinks.map(link => {
                if (Array.isArray(link)) {
                    return {
                        id: link[0],
                        origin_id: link[1],
                        origin_slot: link[2],
                        target_id: link[3],
                        target_slot: link[4],
                        type: link[5]
                    };
                }
                return link; // Already in object format
            });

            console.log(`[Shima Debug] Pasting Island: ${workflow.nodes.length} nodes, ${safeLinks.length} links`);
            if (safeLinks.length > 0) {
                console.log(`[Shima Debug] Transformed Link:`, safeLinks[0]);
            }

            const clipboardData = {
                nodes: workflow.nodes,
                links: safeLinks,
                groups: workflow.groups || [],
                reroutes: workflow.reroutes || [],
                // Pass through metadata for extensions (UE, rgthree, etc)
                version: workflow.version || 0.4,
                config: workflow.config || {},
                extra: safeExtra,
            };

            // Transform definitions.subgraphs to subgraphs at root level
            if (workflow.definitions && workflow.definitions.subgraphs) {
                clipboardData.subgraphs = workflow.definitions.subgraphs;
            } else if (workflow.subgraphs) {
                clipboardData.subgraphs = workflow.subgraphs;
            }

            // Also register with GroupNodeConfig for old-style group nodes
            if (workflow.groupNodes) {
                const GroupNodeConfig = window.comfyAPI?.groupNode?.GroupNodeConfig;
                if (GroupNodeConfig) {
                    await GroupNodeConfig.registerFromWorkflow(workflow.groupNodes, {});
                }
            }

            // Store transformed data in clipboard
            localStorage.setItem("litegrapheditor_clipboard", JSON.stringify(clipboardData));

            // Paste from clipboard
            app.canvas.pasteFromClipboard();
        });

        // Wait for paste to complete, then wrap in group
        // Increase delay slightly to ensuring pasting finishes
        await new Promise(r => setTimeout(r, 300));
        const pastedNodes = await waitForPastedNodes();

        if (Object.keys(pastedNodes).length > 0) {
            // Create a wrapper group for this island
            const group = new LiteGraph.LGraphGroup();
            group.title = `Shima.${island.name}_${groupSuffix}`;
            const groupColor = island.color || window.SHIMA_THEME?.palette?.islands || "#222222";
            group.color = groupColor;

            // Find interior groups that were pasted with this island
            // These are groups from the workflow that exist on the graph now
            const allGraphGroups = app.canvas.graph._groups || [];
            const interiorGroups = [];

            // The island workflow may have had groups - find newly added ones
            // by looking for groups that contain any of the pasted nodes
            for (const g of allGraphGroups) {
                // Skip if this is our new wrapper group
                if (g === group) continue;

                // Check if any pasted node is inside this group
                if (g._nodes) {
                    g.recomputeInsideNodes();
                    for (const nodeId in pastedNodes) {
                        if (g._nodes.includes(pastedNodes[nodeId])) {
                            interiorGroups.push(g);
                            break;
                        }
                    }
                }
            }

            // Size the group to encompass all pasted nodes AND interior groups
            addNodesToGroup(group, pastedNodes, interiorGroups);

            // Add group to the graph
            app.canvas.graph.add(group);
            app.canvas.graph.change();

            // Deselect nodes after grouping
            LGraphCanvas.active_canvas.deselectAllNodes();

            console.log(`[Shima] Added island: Shima.${island.name}_${groupSuffix} (${workflow.nodes.length} nodes, ${interiorGroups.length} interior groups)`);
        }

        return { workflow, suffix: groupSuffix };

    } catch (error) {
        console.error("[Shima] Failed to load island:", error);
        alert("Failed to load island: " + error.message);
        return null;
    }
}

/**
 * Load multiple islands with the same group suffix
 * Creates a parent wrapper group around all island sub-groups
 * @param {Array} islands - Array of island objects to load
 * @param {string} suffix - Shared group suffix
 */
async function loadMultipleIslands(islands, suffix) {
    const groupSuffix = suffix || randomString(4);
    const allPastedNodes = [];

    for (const island of islands) {
        const result = await loadIsland(island, groupSuffix);
        if (result) {
            // Collect info for parent wrapper group
            allPastedNodes.push({ island, result });
        }
        // Small delay between islands to let paste complete
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[Shima] Loaded ${allPastedNodes.length} islands with suffix ${groupSuffix}`);
    return { suffix: groupSuffix, count: allPastedNodes.length };
}

/**
 * Show multi-select island picker dialog
 */
function showIslandPickerDialog() {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = `
        padding: 0;
        border: 1px solid #555;
        border-radius: 8px;
        background: #2a2a2a;
        color: #eee;
        min-width: 400px;
        max-height: 80vh;
    `;

    // Group islands by category
    const groups = {};
    for (const island of cachedIslands) {
        const category = island.category?.[0] || "Uncategorized";
        if (!groups[category]) groups[category] = [];
        groups[category].push(island);
    }

    // Build checkbox list HTML
    let checkboxesHtml = "";
    for (const [category, islands] of Object.entries(groups)) {
        checkboxesHtml += `<div style="margin-bottom: 10px;">
            <div style="font-weight: bold; color: #aaa; margin-bottom: 5px;">${category}</div>`;
        for (const island of islands) {
            checkboxesHtml += `
                <label style="display: flex; align-items: center; padding: 5px 10px; cursor: pointer; border-radius: 4px;"
                       onmouseover="this.style.background='#3a3a3a'" onmouseout="this.style.background='transparent'">
                    <input type="checkbox" value="${island.file}" style="margin-right: 10px;">
                    <span>${island.name}</span>
                </label>`;
        }
        checkboxesHtml += `</div>`;
    }

    dialog.innerHTML = `
        <div style="padding: 20px;">
            <h3 style="margin: 0 0 15px 0;">🏝️ Island Picker</h3>
            <p style="color: #aaa; margin-bottom: 15px;">Select islands to add together:</p>
            
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #444; border-radius: 4px; padding: 10px; margin-bottom: 15px;">
                ${checkboxesHtml || '<p style="color: #888;">No islands available</p>'}
            </div>
            
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 20px;">
                <label style="color: #aaa;">Group Suffix:</label>
                <input type="text" id="shima-suffix" placeholder="Auto" 
                       style="flex: 1; padding: 8px; background: #333; border: 1px solid #555; border-radius: 4px; color: #eee;">
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: space-between;">
                <div>
                    <button type="button" id="shima-select-all" style="padding: 8px 16px; cursor: pointer;">Select All</button>
                    <button type="button" id="shima-select-none" style="padding: 8px 16px; cursor: pointer;">Select None</button>
                </div>
                <div>
                    <button type="button" id="shima-picker-cancel" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                    <button type="button" id="shima-picker-add" style="padding: 8px 16px; cursor: pointer; background: #4a7c59; border: none; color: white;">Add Selected</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    // Event handlers
    dialog.querySelector("#shima-picker-cancel").onclick = () => {
        dialog.close();
        dialog.remove();
    };

    dialog.querySelector("#shima-select-all").onclick = () => {
        dialog.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    };

    dialog.querySelector("#shima-select-none").onclick = () => {
        dialog.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    };

    dialog.querySelector("#shima-picker-add").onclick = async () => {
        const checked = dialog.querySelectorAll('input[type="checkbox"]:checked');
        const selectedFiles = Array.from(checked).map(cb => cb.value);

        if (selectedFiles.length === 0) {
            alert("Please select at least one island");
            return;
        }

        // Find island objects by file
        const selectedIslands = cachedIslands.filter(i => selectedFiles.includes(i.file));

        // Get custom suffix or auto-generate
        const customSuffix = dialog.querySelector("#shima-suffix").value.trim();
        const suffix = customSuffix || randomString(4);

        dialog.close();
        dialog.remove();

        // Load all selected islands
        await loadMultipleIslands(selectedIslands, suffix);
    };

    // Close on backdrop click
    dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {
            dialog.close();
            dialog.remove();
        }
    });
}

/**
 * Build menu items for islands grouped by category
 */
function buildIslandMenu(islands) {
    if (islands.length === 0) {
        return [{
            content: "No islands available",
            disabled: true
        }];
    }

    // Group by first category
    const groups = {};
    for (const island of islands) {
        const category = island.category?.[0] || "Uncategorized";
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(island);
    }

    // Build menu structure
    const menuItems = [];
    for (const [category, categoryIslands] of Object.entries(groups)) {
        if (Object.keys(groups).length === 1 && category === "Uncategorized") {
            // No submenu needed if only uncategorized
            for (const island of categoryIslands) {
                menuItems.push({
                    content: island.name,
                    callback: () => loadIsland(island)
                });
            }
        } else {
            menuItems.push({
                content: category,
                submenu: {
                    options: categoryIslands.map(island => ({
                        content: island.name,
                        callback: () => loadIsland(island)
                    }))
                }
            });
        }
    }

    return menuItems;
}

// ============================================================================
// Settings & Configuration
// ============================================================================

/**
 * Register Shima settings in ComfyUI
 */
function registerShimaSettings() {
    if (!app.ui.settings) return;

    app.ui.settings.addSetting({
        id: "Shima.xlsxStatus",
        name: "Shima: XLSX Data Status",
        type: "text",
        defaultValue: "Checking...",
        tooltip: "Status of shima_sheets.xlsx in assets/data/",
        onChange: () => {}, // Read-only
    });

    // Fetch initial status
    setTimeout(async () => {
        try {
            const res = await api.fetchApi("/shima/assets/check");
            const data = await res.json();
            const status = data.data_exists ? "✅ FOUND" : "❌ MISSING";
            app.ui.settings.setSettingValue("Shima.xlsxStatus", status);
        } catch (e) {
            app.ui.settings.setSettingValue("Shima.xlsxStatus", "⚠️ ERROR");
        }
    }, 1000);

    app.ui.settings.addSetting({
        id: "Shima.editorPath",
        name: "Shima: External Editor Path",
        type: "text",
        defaultValue: "",
        tooltip: "Full path to external image editor (e.g., Photoshop, GIMP). Leave empty for system default.",
    });

    app.ui.settings.addSetting({
        id: "Shima.defaultOutputFolder",
        name: "Shima: Default Output Folder",
        type: "text",
        defaultValue: "ComfyUI/output/Shima",
        tooltip: "Default folder for Preview node saves. Leave empty for ComfyUI output folder.",
    });

    app.ui.settings.addSetting({
        id: "Shima.apiBase",
        name: "Shima: API Base URL",
        type: "text",
        defaultValue: "https://shima.wf",
        tooltip: "URL for Shima backend (e.g. http://custom_url:3000 or https://shima.wf)",
        onChange: (value) => {
            api.fetchApi("/shima/settings/save", {
                method: "POST",
                body: JSON.stringify({ api_base: value })
            }).catch(e => console.error("[Shima] Failed to sync apiBase:", e));
        }
    });

    app.ui.settings.addSetting({
        id: "Shima.assetDirectory",
        name: "Shima: Asset Directory",
        type: "text",
        defaultValue: "",
        tooltip: "Custom folder for style thumbnails. Leave empty for default extension folder.",
        onChange: (value) => {
            api.fetchApi("/shima/settings/save", {
                method: "POST",
                body: JSON.stringify({ asset_directory: value })
            }).catch(e => console.error("[Shima] Failed to sync settings:", e));
        }
    });

    app.ui.settings.addSetting({
        id: "Shima.civitaiKey",
        name: "Shima: CivitAI API Key",
        type: "text",
        defaultValue: "",
        tooltip: "API Key for downloading from CivitAI. Enter your af_key...",
        onChange: (value) => {
            api.fetchApi("/shima/settings/save", {
                method: "POST",
                body: JSON.stringify({ civitai_key: value })
            }).catch(e => console.error("[Shima] Failed to sync CivitAI key:", e));
        }
    });

    app.ui.settings.addSetting({
        id: "Shima.hfToken",
        name: "Shima: HuggingFace Token",
        type: "text",
        defaultValue: "",
        tooltip: "API Token for downloading from HuggingFace. Enter hf_...",
        onChange: (value) => {
            api.fetchApi("/shima/settings/save", {
                method: "POST",
                body: JSON.stringify({ hf_token: value })
            }).catch(e => console.error("[Shima] Failed to sync HF token:", e));
        }
    });

    app.ui.settings.addSetting({
        id: "Shima.ActiveThumbnailPack",
        name: "Shima: Active Style Thumbnail Pack",
        type: "combo",
        defaultValue: "walking_woman",
        options: async () => {
            try {
                const res = await api.fetchApi("/shima/assets/check");
                const data = await res.json();
                return Object.keys(data.pack_status || {});
            } catch (e) {
                return ["walking_woman", "still_life_classic"];
            }
        },
        onChange: (value) => {
            api.fetchApi("/shima/settings/save", {
                method: "POST",
                body: JSON.stringify({ active_thumbnail_pack: value })
            }).catch(e => console.error("[Shima] Failed to sync active pack:", e));
        }
    });

    // --- Dynamic Palette Picker setting (Moved from utilities) ---
    app.ui.settings.addSetting({
        id: "Shima.ActivePalette",
        name: "🏝️ Shima Active Node Palette",
        type: "combo",
        defaultValue: "Standard",
        options: (value) => {
            try {
                const palettes = window.SHIMA_THEME?.palettes || {};
                const themes = Object.keys(palettes);
                if (themes.length === 0) return ["Standard"];
                return themes;
            } catch (e) {
                console.error("[Shima] Error getting palette options:", e);
                return ["Standard"];
            }
        },
        onChange: (value) => {
            if (window.applyPalette) window.applyPalette(value);
        }
    });
}

/**
 * Get Shima setting value
 */
function getShimaSetting(name) {
    if (!app.ui.settings) return null;
    return app.ui.settings.getSettingValue("Shima." + name);
}

// ============================================================================
// Remote Islands (Shima.wf Marketplace)
// ============================================================================

// Configuration - change for production
// const SHIMA_API_BASE = "http://localhost:3000"; // Development
const SHIMA_API_BASE = "https://shima.wf"; // Production

// Remote Islands State
let cachedIslands = [];
let cachedFolders = [];
let cachedUnorganized = [];
let isAuthenticated = false;
let shimUserId = null;
let userPrefs = { isOver18: false };

/**
 * Helper to build proxy URLs for remote Shima API calls
 */
function getProxyUrl(endpoint) {
    const base = getShimaSetting("apiBase") || "https://shima.wf";
    const target = `${base}${endpoint}`;
    return `/shima/proxy?target=${encodeURIComponent(target)}`;
}

// Load from localStorage
function loadShimaAuth() {
    const saved = localStorage.getItem("shima_auth");
    if (saved) {
        try {
            const data = JSON.parse(saved);
            shimUserId = data.userId;
            isAuthenticated = !!shimUserId;
            console.log("[Shima] Auth loaded:", shimUserId ? "authenticated" : "not authenticated");

            // Sync to Python backend for piracy checks
            syncAuthToBackend();
        } catch (e) {
            console.error("[Shima] Failed to parse auth:", e);
        }
    }
}

function syncAuthToBackend() {
    api.fetchApi("/shima/auth", {
        method: "POST",
        body: JSON.stringify({ key: shimUserId || "" })
    }).catch(e => console.error("[Shima] Failed to sync auth to backend:", e));
}

function saveShimaAuth() {
    localStorage.setItem("shima_auth", JSON.stringify({ userId: shimUserId }));
}

/**
 * Fetch user preferences from Shima.wf
 */
// Mock checkAuth to prevent startup error
async function checkAuth() {
    // Placeholder - eventually will check valid session/token
    return true;
}

/**
 * Fetch user preferences from Shima.wf (isOver18, etc)
 */
async function fetchUserPrefs() {
    if (!isAuthenticated || !shimUserId) return;
    try {
    const proxyUrl = getProxyUrl(`/api/ext/user-prefs?userId=${shimUserId}`);
        const res = await api.fetchApi(proxyUrl);
        if (res.ok) {
            userPrefs = await res.json();
            console.log("[Shima] User preferences fetched");
        }
    } catch (e) {
        console.error("[Shima] Error fetching user prefs:", e);
    }
}

/**
 * Fetch user's Islands from Shima.wf (with local fallback)
 */
async function fetchIslands() {
    // 1. Always try to load from local DB first for instant UI response/offline support
    try {
        const localRes = await api.fetchApi("/shima/islands");
        if (localRes.ok) {
            const localData = await localRes.json();
            if (localData.islands && localData.islands.length > 0) {
                console.log(`[Shima] Loaded ${localData.islands.length} islands from local SQLite DB`);
                cachedIslands = localData.islands;
                // Note: local DB currently stores flat list, folders would need extra schema work
                // For now, we put them in a "Synced" folder if they came from local DB
                cachedIslands.forEach(i => i._folder = i._folder || "Synced");
            }
        }
    } catch (e) {
        console.warn("[Shima] Local DB fetch failed:", e);
    }

    if (!isAuthenticated || !shimUserId) {
        console.log("[Shima] Not authenticated, skipping remote fetch");
        // We keep local islands if they exist
        return;
    }

    try {
        const nsfwParam = userPrefs.isOver18 ? '&nsfw=true' : '';
        const endpoint = `/api/ext/my-islands?userId=${shimUserId}${nsfwParam}`;
        const proxyUrl = getProxyUrl(endpoint);

        console.log(`[Shima] Fetching islands via proxy: ${proxyUrl}`);

        const res = await api.fetchApi(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        console.log(`[Shima] API Response:`, { folders: data.folders?.length || 0, unorganized: data.unorganized?.length || 0, total: data.total });

        cachedFolders = data.folders || [];

        // Flatten Islands from folder tree + unorganized
        const remoteIslands = [];
        function extractIslands(folders, currentPath = []) {
            for (const folder of folders) {
                const folderPath = [...currentPath, folder.name];
                for (const island of (folder.islands || [])) {
                    remoteIslands.push({
                        ...island,
                        _folder: folder.name,
                        category: folderPath
                    });
                }
                if (folder.children) {
                    extractIslands(folder.children, folderPath);
                }
            }
        }
        extractIslands(cachedFolders);

        // Store unorganized Islands separately for menu
        cachedUnorganized = data.unorganized || [];

        // Add unorganized Islands to flat list too
        for (const island of cachedUnorganized) {
            remoteIslands.push({
                ...island,
                _folder: "Unorganized",
                category: ["Unorganized"]
            });
        }

        // If we got remote data, overwrite the cached list
        if (remoteIslands.length > 0) {
            cachedIslands = remoteIslands;
        }

        console.log(`[Shima] Fetched ${remoteIslands.length} remote Islands in ${cachedFolders.length} folders`);
    } catch (error) {
        console.error("[Shima] Failed to fetch Islands from remote:", error);
        // Error? We still have the local islands from step 1!
    }
}

/**
 * Sync all cachedIslands to local SQLite DB
 */
async function syncIslandsToLocal() {
    if (!cachedIslands || cachedIslands.length === 0) return;

    showShimaNotification("⏳ Syncing to local DB...");
    console.log(`[Shima] Starting sync for ${cachedIslands.length} islands...`);

    try {
        const fullIslands = [];

        // Fetch full workflow JSON for each island
        // Use bypassLocal=true to ensure we're getting the latest from the server
        for (const island of cachedIslands) {
            console.log(`[Shima] Syncing workflow: ${island.name} (${island.id})`);
            const data = await downloadRemoteIsland(island.id, true);
            if (data && data.workflow) {
                fullIslands.push({
                    id: island.id,
                    name: island.name,
                    workflow: data.workflow,
                    type: island.type || 'island',
                    category: island.category || (island._folder ? [island._folder] : ["General"]),
                    status: island.status || 'published'
                });
            }
        }

        if (fullIslands.length === 0) {
            showShimaNotification("⚠️ No workflows found to sync");
            return;
        }

        // Send to local backend for SQLite storage
        const syncRes = await api.fetchApi("/shima/island/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ islands: fullIslands })
        });

        if (syncRes.ok) {
            const syncData = await syncRes.json();
            showShimaNotification(`✅ Offline Sync Complete (${syncData.count} items)`);
            console.log(`[Shima] Sync complete: ${syncData.count} items saved to SQLite`);
        } else {
            const err = await syncRes.text();
            throw new Error(err);
        }
    } catch (e) {
        console.error("[Shima] Sync failed:", e);
        showShimaNotification("❌ Sync Failed: " + e.message);
    }
}

/**
 * Download Island workflow from Shima.wf (or local SQLite cached version)
 */
async function downloadRemoteIsland(islandId, bypassLocal = false) {
    if (!isAuthenticated || !shimUserId) {
        alert("Please authenticate first");
        return null;
    }

    // 1. Try local cache first unless bypassed
    if (!bypassLocal) {
        try {
            const localRes = await api.fetchApi(`/shima/island/${islandId}`);
            if (localRes.ok) {
                const localData = await localRes.json();
                console.log(`[Shima] Loaded island ${islandId} from local cache`);
                // Note: local SQLite stores the full workflow JSON directly, 
                // but the remote API returns it wrapped in metadata { name, workflow, ... }
                // So we wrap it if it's missing the name (indicating it's just the workflow JSON)
                if (localData.nodes && !localData.workflow) {
                    return { workflow: localData, name: "Synced Workflow" };
                }
                return localData;
            }
        } catch (e) {
            console.warn(`[Shima] Local fetch failed for ${islandId}, falling back to remote:`, e);
        }
    }

    // 2. Fallback to remote fetch
    try {
        const proxyUrl = getProxyUrl(`/api/ext/download/${islandId}?userId=${shimUserId}`);
        const res = await api.fetchApi(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // Show dependencies warning if needed
        if (data.externalDeps?.length || data.modelDeps?.length) {
            const deps = [
                ...(data.externalDeps || []).map(d => `🧩 ${d}`),
                ...(data.modelDeps || []).map(d => `📦 ${d}`),
            ];
            console.log(`[Shima] Island "${data.name}" dependencies:\n${deps.join("\n")}`);
        }

        return data;
    } catch (error) {
        console.error("[Shima] Failed to download Island:", error);
        alert("Failed to download Island: " + error.message);
        return null;
    }
}

/**
 * Load remote Island into graph
 */
async function loadRemoteIsland(islandSummary) {
    const data = await downloadRemoteIsland(islandSummary.id);
    if (!data) return;

    // Convert to format expected by loadIsland
    const island = {
        name: data.name,
        workflow: data.workflow,
        color: window.SHIMA_THEME?.palette?.islands || "#222222", // Default subtle black/gray
    };

    await loadIsland(island);
}

/**
 * Show authentication dialog
 */
function showAuthDialog() {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = `
        padding: 0;
        border: 1px solid #555;
        border-radius: 8px;
        background: #2a2a2a;
        color: #eee;
        min-width: 350px;
    `;
    dialog.innerHTML = `
        <div style="padding: 20px;">
            <h3 style="margin: 0 0 15px;">🏝️ Shima.wf Login</h3>
            <p style="color: #aaa; margin-bottom: 15px;">
                Enter your Shima.wf user ID to sync your Islands.
            </p>
            <input type="text" id="shima-user-id" placeholder="User ID" 
                style="width: 100%; padding: 8px; background: #1a1a1a; border: 1px solid #444; border-radius: 4px; color: #fff; margin-bottom: 15px;"
                value="${shimUserId || ""}"
            />
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="shima-auth-cancel" style="padding: 8px 16px; background: #444; border: none; border-radius: 4px; color: #fff; cursor: pointer;">
                    Cancel
                </button>
                ${isAuthenticated ? `
                    <button id="shima-auth-logout" style="padding: 8px 16px; background: #a33; border: none; border-radius: 4px; color: #fff; cursor: pointer;">
                        Logout
                    </button>
                ` : ""}
                <button id="shima-auth-save" style="padding: 8px 16px; background: #3a7c5a; border: none; border-radius: 4px; color: #fff; cursor: pointer;">
                    ${isAuthenticated ? "Update" : "Login"}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    dialog.querySelector("#shima-auth-cancel").onclick = () => {
        dialog.close();
        dialog.remove();
    };

    const logoutBtn = dialog.querySelector("#shima-auth-logout");
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            shimUserId = null;
            isAuthenticated = false;
            cachedIslands = [];
            cachedFolders = [];
            saveShimaAuth();
            syncAuthToBackend(); // Sync logout to backend
            dialog.close();
            dialog.remove();
            console.log("[Shima] Logged out");
        };
    }

    dialog.querySelector("#shima-auth-save").onclick = async () => {
        const input = dialog.querySelector("#shima-user-id");
        const userId = input.value.trim();
        if (!userId) {
            alert("Please enter a user ID");
            return;
        }

        shimUserId = userId;
        isAuthenticated = true;
        saveShimaAuth();
        syncAuthToBackend(); // Sync login to backend

        dialog.close();
        dialog.remove();

        // Fetch user preferences first, then Islands
        await fetchUserPrefs();
        await fetchIslands();
        console.log("[Shima] Authenticated as:", userId);
    };
}

/**
 * Build Islands menu from folder tree for right-click menu
 */
function buildRemoteIslandMenu(islandsToProcess, typeFilter = null) {
    const items = [];

    // Helper to filter islands
    const filterIslands = (list) => {
        return list.filter(i => {
            // Drop disabled items completely
            if (i.status === 'disabled') return false;

            // If type filter is active, respect it
            if (typeFilter) {
                const t = i.type || 'island';
                return t === typeFilter;
            }
            return true;
        });
    };

    const filteredIslands = filterIslands(islandsToProcess || []);

    // 1. Build a nested folder tree from the flat category arrays
    const rootTree = { subfolders: {}, islands: [] };
    const unorganized = [];

    for (const island of filteredIslands) {
        let catArray = island.category;

        // Handle legacy flat _folder tag if category array is missing
        if (!catArray || !Array.isArray(catArray)) {
            catArray = island._folder ? [island._folder] : ["Unorganized"];
        }

        // Catch Uncategorized/General explicitly
        if (catArray.length === 0 || catArray[0] === "Uncategorized" || catArray[0] === "Unorganized" || catArray[0] === "General") {
            unorganized.push(island);
            continue;
        }

        // Navigate the tree
        let currentLevel = rootTree;
        for (const folderName of catArray) {
            if (!currentLevel.subfolders[folderName]) {
                currentLevel.subfolders[folderName] = { subfolders: {}, islands: [] };
            }
            currentLevel = currentLevel.subfolders[folderName];
        }

        // Drop the island in the deepest folder
        currentLevel.islands.push(island);
    }

    // 2. Recursive function to turn that tree into ComfyUI dropdown nodes
    function buildFolderMenu(node, folderName) {
        const children = [];

        // Add Islands in this folder
        for (const island of node.islands) {
            children.push({
                content: island.name,
                callback: () => loadRemoteIsland(island)
            });
        }

        // Add subfolders
        let hasContent = node.islands.length > 0;

        // Sort folder names alphabetically for a cleaner UI
        const sortedSubfolderNames = Object.keys(node.subfolders).sort();

        for (const subFolderName of sortedSubfolderNames) {
            const subNode = node.subfolders[subFolderName];
            const subMenu = buildFolderMenu(subNode, subFolderName);
            if (subMenu && subMenu.submenu.options.length > 0) {
                children.push(subMenu);
                hasContent = true;
            }
        }

        // Do not render empty folders
        if (!hasContent) return null;

        return {
            content: `📂 ${folderName}`,
            submenu: { options: children }
        };
    }

    // 3. Add root folders mapping to items list
    const sortedRootNames = Object.keys(rootTree.subfolders).sort();
    for (const rootFolderName of sortedRootNames) {
        const menu = buildFolderMenu(rootTree.subfolders[rootFolderName], rootFolderName);
        if (menu) items.push(menu);
    }

    // 4. Add unorganized Islands to the bottom
    if (unorganized.length > 0) {
        if (items.length > 0) items.push(null); // separator
        items.push({
            content: "📁 Unorganized",
            submenu: {
                options: unorganized.map(island => ({
                    content: island.name,
                    callback: () => loadRemoteIsland(island)
                })).sort((a, b) => a.content.localeCompare(b.content))
            }
        });
    }

    return items;
}

// Initialize auth on load
loadShimaAuth();
if (isAuthenticated) {
    // Delay fetch to allow ComfyUI to initialize
    setTimeout(async () => {
        await fetchUserPrefs();
        await fetchIslands();
    }, 2000);
}

// ============================================================================
// Register Extension
// ============================================================================

app.registerExtension({
    name: "Shima",

    async setup() {
        console.log("[Shima] Extension loaded - v3.1 (Fixes Applied)");


        // Register Shima settings
        registerShimaSettings();

        // Check auth and fetch prefs/islands on startup
        await checkAuth();
        await fetchUserPrefs();
        await fetchIslands();
    },

    /**
     * Modern Context Menu hook for Islands (Group Nodes)
     */
    getGroupMenuOptions(options, group) {
        // Check if this is a Shima group (title starts with "Shima.")
        if (group && group.title && group.title.startsWith("Shima.")) {
            // Add separator and Shima options
            options.push(null); // separator
            options.push({
                content: "🏝️ Rename Island Chain...",
                callback: () => showRenameDialog(group)
            });
        }
    },

    /**
     * Hook into node registration to add dynamic widget behavior for Shima nodes
     */
    beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Only process Shima nodes
        if (!nodeData.name?.startsWith("Shima.")) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            // Set up dynamic widget visibility based on node type
            if (nodeData.name === "Shima.LatentMaker") {
                setupLatentMakerWidgets(this);
            } else if (nodeData.name === "Shima.FileSaver") {
                setupFileSaverWidgets(this);
            } else if (nodeData.name === "Shima.FileNamer") {
                setupFileNamerWidgets(this);
            } else if (nodeData.name === "Shima.MultiSaver") {
                setupMultiSaverWidgets(this);
            } else if (nodeData.name === "Shima.Preview") {
                setupShimaPreviewWidgets(this);
            } else if (nodeData.name === "Shima.CarouselPreview") {
                setupShimaCarouselWidgets(this);
            } else if (nodeData.name === "Shima.Commons") {
                setupCommonsWidgets(this);
            } else if (nodeData.name === "Shima.RichDisplay") {
                setupRichContentWidgets(this);
            } else if (nodeData.name === "Shima.Content") {
                setupContentPopup(this);
            } else if (nodeData.name === "Shima.Sticker") {
                setupStickerWidgets(this);
            } else if (nodeData.name === "Shima.ControlAgent" || nodeData.name === "Shima.PanelControlAgent") {
                setupControlAgentWidgets(this);
            } else if (nodeData.name === "Shima.Sampler") {
                setupSamplerWidgets(this);
            } else if (nodeData.name === "Shima.PhotoRemix") {
                setupPhotoRemixWidgets(this);
            } else if (nodeData.name === "Shima.StyleIterator") {
                setupStylerWidgets(this);
            } else if (nodeData.name === "Shima.PreviewCompare") {
                setupShimaCompareWidgets(this);
            } else if (nodeData.name === "Shima.SamplerCommons") {
                setupSamplerCommonsWidgets(this);
            }
        };
    },

    /**
     * Add Shima menu to canvas right-click
     */
    getCanvasMenuItems(canvas) {
        // Build submenu for Shima nodes (similar to RGThree)
        // Get all registered Shima nodes
        const nodeTypes = LiteGraph.registered_node_types || {};
        const shimaNodes = Object.keys(nodeTypes)
            .filter(name => name.startsWith("Shima."))
            .sort();

        // Recursive tree builder for nested categories
        const menuTree = {};

        for (const nodeName of shimaNodes) {
            const nodeType = LiteGraph.registered_node_types[nodeName];
            const category = nodeType.category || "Shima";
            // Remove "Shima/" prefix if present
            const parts = category.replace(/^Shima\//, "").replace(/^Shima$/, "General").split("/");

            let current = menuTree;
            let leaf = null;
            for (const part of parts) {
                if (!current[part]) current[part] = { _nodes: [], _sub: {} };
                leaf = current[part];
                current = current[part]._sub;
            }

            leaf._nodes.push({
                content: nodeName.replace("Shima.", ""),
                callback: () => {
                    const node = LiteGraph.createNode(nodeName);
                    if (node) {
                        node.pos = [canvas.graph_mouse[0], canvas.graph_mouse[1]];
                        canvas.graph.add(node);
                        app.canvas.selectNode(node);
                    }
                }
            });
        }

        // Helper to convert tree to LiteGraph menu options
        function buildNestedMenu(tree) {
            const items = [];

            // Sort keys to maintain consistent order
            const keys = Object.keys(tree).sort();

            for (const key of keys) {
                const branch = tree[key];
                const submenuOptions = [];

                // 1. Add nodes in this category
                if (branch._nodes.length > 0) {
                    submenuOptions.push(...branch._nodes.sort((a, b) => a.content.localeCompare(b.content)));
                }

                // 2. Add subcategories
                const subKeys = Object.keys(branch._sub);
                if (subKeys.length > 0) {
                    if (submenuOptions.length > 0) submenuOptions.push(null); // Separator
                    submenuOptions.push(...buildNestedMenu(branch._sub));
                }

                items.push({
                    content: `📦 ${key}`,
                    submenu: { options: submenuOptions }
                });
            }
            return items;
        }

        const shimaNodeOptions = buildNestedMenu(menuTree);

        return [
            {
                content: "🏝️ Shima",
                submenu: {
                    options: [
                        // Shima Nodes section
                        ...(shimaNodeOptions.length > 0 ? [
                            {
                                content: "🧩 Nodes",
                                submenu: { options: shimaNodeOptions }
                            },
                            null, // separator
                        ] : []),
                        // 1. My Islands (Top Level)
                        {
                            content: "🏝️ My Islands",
                            submenu: {
                                options: isAuthenticated ? [
                                    ...(buildRemoteIslandMenu(cachedIslands, 'island').length > 0
                                        ? buildRemoteIslandMenu(cachedIslands, 'island')
                                        : [{ content: "No islands found", disabled: true }])
                                ] : [
                                    { content: "Login required", disabled: true },
                                    {
                                        content: "🔑 Login to Shima",
                                        callback: () => showAuthDialog()
                                    }
                                ]
                            }
                        },
                        // 2. My Workflows (Top Level)
                        {
                            content: "⚡ My Workflows",
                            submenu: {
                                options: isAuthenticated ? [
                                    ...(buildRemoteIslandMenu(cachedIslands, 'workflow').length > 0
                                        ? buildRemoteIslandMenu(cachedIslands, 'workflow')
                                        : [{ content: "No workflows found", disabled: true }])
                                ] : [
                                    { content: "Login required", disabled: true },
                                    {
                                        content: "🔑 Login to Shima",
                                        callback: () => showAuthDialog()
                                    }
                                ]
                            }
                        },
                        null, // separator
                        // 3. Actions (Top Level)
                        {
                            content: "🔄 Refresh & Sync Library",
                            callback: async () => {
                                if (!isAuthenticated) {
                                    showShimaNotification("Login required to refresh");
                                    return;
                                }
                                await fetchIslands();
                                await syncIslandsToLocal();
                                console.log("[Shima] Library refreshed and synced offline");
                            }
                        },
                        {
                            content: "⚙️ Open Shima Settings",
                            callback: () => window.Shima.openSettings()
                        },
                        {
                            content: "🌐 Link to Shima.wf",
                            callback: () => {
                                window.open(SHIMA_API_BASE, '_blank');
                            }
                        },
                        null, // separator
                        {
                            content: isAuthenticated ? `✅ ${shimUserId}` : "🔑 Login",
                            submenu: isAuthenticated ? {
                                options: [
                                    { content: `Logged in as: ${shimUserId}`, disabled: true },
                                    null,
                                    {
                                        content: "🚪 Logout",
                                        callback: () => {
                                            shimUserId = null;
                                            isAuthenticated = false;
                                            cachedIslands = [];
                                            cachedFolders = [];
                                            cachedUnorganized = [];
                                            localStorage.removeItem("shima_auth");
                                            console.log("[Shima] Logged out");
                                        }
                                    }
                                ]
                            } : undefined,
                            callback: isAuthenticated ? undefined : () => showAuthDialog()
                        }
                    ]
                }
            }
        ];
    }
});

/**
 * Helper to convert URLs to embeddable versions
 * Detects localhost/127.0.0.1 and converts to relative path for proxy support.
 */
function getEmbedUrl(url) {
    if (!url) return "";
    url = url.trim();

    const getAppRoot = () => {
        let p = window.location.pathname;
        if (p.includes("/extensions/")) p = p.substring(0, p.indexOf("/extensions/"));
        if (p.endsWith("/")) p = p.slice(0, -1);
        return p;
    };
    const appBase = getAppRoot();
    let path = url;

    // 1. Aggressive Strip Local Origins
    path = path.replace(/https?:\/\/(127\.0\.0\.1|localhost|.*-proxy\.mimicpc\.com)(:\d+)?/gi, "");

    // 2. Resolve Path Tokens
    // Special handling for [input] which requires ComfyUI's /view endpoint
    if (path.match(/\[input\]|%5Binput%5D/i)) {
        const filename = path.replace(/.*(?:\[input\]|%5Binput%5D)/i, "");
        path = `view?filename=${encodeURIComponent(filename)}&type=input`;
    } else {
        path = path.replace(/\[shima\]|%5Bshima%5D/gi, "extensions/Shima/");
        path = path.replace(/<shima>/gi, "extensions/Shima/").replace(/<input>/gi, "input/");
    }

    // 3. Universal Subpath Injection
    const isInternal = path.includes("extensions/Shima/") || path.includes("input/") || path.includes("view?");
    if (isInternal) {
        // Find where the internal path starts in case of leading junk
        const markers = ["extensions/Shima/", "input/", "view?"];
        for (const marker of markers) {
            if (path.includes(marker)) {
                path = path.substring(path.indexOf(marker));
                break;
            }
        }

        let finalUrl = appBase + "/" + path;
        if (finalUrl.includes(".html")) {
            const separator = finalUrl.includes("?") ? "&" : "?";
            finalUrl += separator + `base=${encodeURIComponent(appBase)}`;
        }
        return finalUrl;
    }

    if (url.includes("youtube.com/watch") || url.includes("youtu.be/")) {
        const videoId = url.split("v=")[1]?.split("&")[0] || url.split("/").pop();
        return `https://www.youtube.com/embed/${videoId}`;
    }

    return path;
}

/**
 * Set up Shima.RichDisplay node (Viewer)
 * @param {LGraphNode} node 
 */
function setupRichContentWidgets(node) {
    // Container for content
    const container = document.createElement("div");
    container.className = "shima-rich-content";
    container.style.cssText = `
        background: #222; 
        color: #eee; 
        padding: 5px; 
        overflow: auto; 
        border-radius: 4px;
        box-sizing: border-box;
    `;

    // Add as DOM widget
    const widget = node.addDOMWidget("rich_content", "div", container, {
        serialize: false,
        hideOnZoom: false
    });

    // Auto-update size (Fixed minimum size)
    if (widget) {
        widget.computeSize = () => [220, 150];
    }

    // Function to render content
    function render(content, type, title, showTitle) {
        let html = "";

        if (showTitle && title) {
            html += `<div style="font-weight: bold; border-bottom: 1px solid #444; padding-bottom: 3px; margin-bottom: 5px; font-size: 14px;">${title}</div>`;
        }

        const contentStyle = "width: 100%; height: calc(100% - 25px); border: none; overflow: auto;";

        if (!content) content = "";

        if (type === "HTML") {
            html += `<div style="${contentStyle}">${content}</div>`;
        } else if (type === "Markdown") {
            const cleanContent = getEmbedUrl(content);
            let md = cleanContent
                .replace(/^# (.*$)/gim, '<h3>$1</h3>')
                .replace(/^## (.*$)/gim, '<h4>$1</h4>')
                .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
                .replace(/\*(.*)\*/gim, '<i>$1</i>')
                .replace(/\n/gim, '<br>');
            html += `<div style="${contentStyle}">${md}</div>`;
        } else if (type === "URL") {
            const embedUrl = getEmbedUrl(content);
            html += `<iframe src="${embedUrl}" style="width: 100%; height: 100%; border: none;" sandbox="allow-scripts allow-same-origin"></iframe>`;
        } else if (type === "Image") {
            const cleanUrl = getEmbedUrl(content);
            html += `<img src="${cleanUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: auto;">`;
        } else if (type === "Video") {
            const cleanUrl = getEmbedUrl(content);
            html += `<video src="${cleanUrl}" controls autoplay loop style="max-width: 100%; max-height: 100%; display: block; margin: auto;"></video>`;
        }

        container.innerHTML = html;
    }

    // Hook onExecuted to get content from message (sent by Python)
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) origOnExecuted.call(this, message);

        // message should contain: content, type, title, show_title (arrays)
        if (message && message.content && message.content[0]) {
            const mContent = message.content[0];
            const mType = message.type ? message.type[0] : "HTML";
            const mTitle = message.title ? message.title[0] : "";
            const mShowTitle = message.show_title ? message.show_title[0] : true;

            render(mContent, mType, mTitle, mShowTitle);
        }
    };

    // Initial render (Empty until executed)
    render("Waiting for content...", "HTML", "Shima Viewer", true);
}

/**
 * Enable Popup Logic for Shima.Content (Double-Click)
 */
/**
 * Set up Shima.Content node as "Smart Note"
 * - Displays content directly on node
 * - Double-click to edit source
 * - Respects manual resizing
 * - Playlist Support for URLs (URL || Title)
 */
function setupContentPopup(node) {
    // 1. Setup DOM Widget for direct display
    const container = document.createElement("div");
    container.className = "shima-smart-note";

    // Base styles (offsets updated in render)
    container.style.cssText = `
        position: absolute;
        left: 0;
        width: 100%;
        background: #1a1a1a; 
        color: #eee; 
        overflow: auto; 
        box-sizing: border-box;
        padding: 8px 12px;
        font-family: sans-serif;
        border-radius: 0 0 4px 4px;
        z-index: 10;
        pointer-events: auto;
        
        /* Custom Scrollbar */
        scrollbar-width: thin;
        scrollbar-color: #444 #1a1a1a;
    `;

    // Webkit scrollbar styling
    const style = document.createElement("style");
    style.textContent = `
        .shima-smart-note::-webkit-scrollbar { width: 8px; height: 8px; }
        .shima-smart-note::-webkit-scrollbar-track { background: #1a1a1a; }
        .shima-smart-note::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
        .shima-smart-note::-webkit-scrollbar-thumb:hover { background: #555; }
    `;
    container.appendChild(style);


    // Prevent mouse events from being swallowed by node dragging when selecting text
    container.onmousedown = (e) => {
        if (node.flags.collapsed) return;
        e.stopPropagation();
    };

    const domWidget = node.addDOMWidget("smart_content", "div", container, {
        serialize: false,
        hideOnZoom: false
    });

    // Auto-size helper (min size only)
    domWidget.computeSize = (width) => {
        return [width, 50];
    };

    // Initialize properties
    if (!node.properties) node.properties = {};
    if (typeof node.properties.urlIndex === 'undefined') node.properties.urlIndex = 0;

    // State for layout sync
    let lastTopOffset = 0;

    // Helper to sync height
    function syncHeight(currentTopOffset) {
        if (typeof currentTopOffset !== 'undefined') {
            lastTopOffset = currentTopOffset;
        } else {
            currentTopOffset = lastTopOffset;
        }

        if (node.size) {
            // Force container to fill remaining node height
            // Subtracting 50px (buffer) to ensure content doesn't hit the bottom resize handle
            // This effectively "adds length" to the node relative to content.
            const h = Math.max(0, node.size[1] - (currentTopOffset + 50));
            container.style.height = h + "px";
            container.style.top = currentTopOffset + "px";
        }
    }

    // Track manual resizing
    node.onResize = function (size) {
        // Now we can safely sync height using cached offset
        syncHeight();

        node.setDirtyCanvas(true, true); // Force redraw
        if (!this._isSystemResizing) {
            this.properties.userResized = true;
        }
    }

    // Helper to parse Playlist
    function parsePlaylist(text) {
        return text.split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                const parts = line.split("||");
                const url = parts[0].trim();
                // Default title is the URL or "Link X" if manual title missing
                const title = parts.length > 1 ? parts[1].trim() : (url.length > 30 ? "Link..." : url);
                return { url, title };
            });
    }

    // 2. Render Function
    function render() {
        // Get widgets
        const wType = node.widgets?.find(w => w.name === "content_type");
        const wTitle = node.widgets?.find(w => w.name === "title");
        const wContent = node.widgets?.find(w => w.name === "content");
        const wShowTitle = node.widgets?.find(w => w.name === "show_title");

        const type = wType?.value || "HTML";
        const title = wTitle?.value || "Content";
        const rawContent = wContent?.value || "";
        const showTitle = wShowTitle ? wShowTitle.value : true;

        // Hide raw widgets
        [wType, wTitle, wContent, wShowTitle].forEach(w => {
            if (w) {
                w.type = "hidden";
                w.computeSize = () => [0, -4];
                w.hidden = true;
            }
        });

        // 1. Calculate Layout Metrics
        let topOffset = 0;

        let headerHtml = "";
        let playlistHtml = "";

        // Main Title Header
        if (showTitle) {
            headerHtml = `<div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #444; color: #fff;">${title}</div>`;
        }

        // 2. Parse Content & Handle Playlist
        let bodyHtml = "";
        let activeContent = rawContent;
        let isPlaylist = false;

        if (type === "URL" && (rawContent.includes("\n") || rawContent.includes("||"))) {
            const playlist = parsePlaylist(rawContent);
            if (playlist.length > 1) {
                isPlaylist = true;

                // Validate index
                if (node.properties.urlIndex >= playlist.length) node.properties.urlIndex = 0;
                const currentItem = playlist[node.properties.urlIndex];

                activeContent = currentItem.url;

                // Playlist Controls
                playlistHtml = `
                    <div style="display:flex; align-items:center; justify-content:space-between; background:#222; padding:6px 10px; border-radius:4px; margin-bottom:8px; border:1px solid #333;">
                        <button id="btn-prev" style="background:none; border:none; color:#bbb; cursor:pointer; font-size:18px; padding:0 8px; line-height:1;">◀</button>
                        <div style="font-size:14px; font-weight:bold; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%; text-align:center;">${currentItem.title}</div>
                        <button id="btn-next" style="background:none; border:none; color:#bbb; cursor:pointer; font-size:18px; padding:0 8px; line-height:1;">▶</button>
                    </div>
                `;
            } else if (playlist.length === 1) {
                // Single item parsed correctly
                activeContent = playlist[0].url;
            }
        }

        // Force topOffset to 0 because content elements are internal to the container
        topOffset = 0;

        // Fix: Do not use accumulated dynamic height for top position since content is internal.
        // Use a fixed offset to clear the Main Node Header only.
        // Usually 0 is fine if the DOM widget is well-placed, but let's assume we want to fill the node body.
        topOffset = 0;

        // 3. Render Body
        if (!activeContent) {
            bodyHtml = "<div style='color:#666; font-style:italic; padding: 20px 0; text-align: center;'>Double-click to edit content...</div>";
        } else {
            if (type === "HTML") {
                bodyHtml = activeContent;
            } else if (type === "Markdown") {
                const cleanContent = getEmbedUrl(activeContent);
                bodyHtml = cleanContent
                    .replace(/^# (.*$)/gim, '<h3>$1</h3>')
                    .replace(/^## (.*$)/gim, '<h4>$1</h4>')
                    .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
                    .replace(/\*(.*)\*/gim, '<i>$1</i>')
                    .replace(/\n/gim, '<br>');
            } else if (type === "URL") {
                const embedUrl = getEmbedUrl(activeContent);
                bodyHtml = `<iframe src="${embedUrl}" style="width:100%; height:100%; min-height:100px; border:none;" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>`;
            } else if (type === "Image") {
                const cleanUrl = getEmbedUrl(activeContent);
                bodyHtml = `<img src="${cleanUrl}" style="max-width:100%; display:block; margin:auto;">`;
            } else if (type === "Video") {
                const cleanUrl = getEmbedUrl(activeContent);
                bodyHtml = `<video src="${cleanUrl}" controls style="max-width:100%;"></video>`;
            }
        }

        // We append the style block FIRST
        container.innerHTML = "";
        container.appendChild(style);

        // Append Content Wrapper
        const contentWrapper = document.createElement("div");
        // Structure: Header -> PlaylistNav -> Body
        // Note: Body needs to fill remaining height.
        // If it's URL/Video, we want flex growth.

        const isMedia = (type === "URL" || type === "Video" || type === "Image");
        const layoutStyle = isMedia ? `display:flex; flex-direction:column; height:100%;` : ``;
        // For media, use overflow:hidden to prevent scrollbar jumping if iframe fits perfectly
        // Use min-height:0 to ensure flex shrinking works
        const bodyStyle = isMedia ? `flex:1; min-height:0; overflow:hidden; position:relative;` : ``;

        contentWrapper.style.cssText = layoutStyle;
        contentWrapper.innerHTML = `
            ${headerHtml}
            ${playlistHtml}
            <div style="${bodyStyle}">
                ${bodyHtml}
            </div>
        `;

        // Move children to container
        if (isMedia) {
            container.appendChild(contentWrapper);
        } else {
            // For text, we just dump it in so scrolling works on root
            container.innerHTML += headerHtml + playlistHtml + bodyHtml;
        }

        // Event Listeners for Playlist
        if (isPlaylist) {
            const btnPrev = container.querySelector("#btn-prev");
            const btnNext = container.querySelector("#btn-next");

            if (btnPrev) btnPrev.onclick = (e) => {
                e.stopPropagation();
                const len = parsePlaylist(rawContent).length;
                node.properties.urlIndex = (node.properties.urlIndex - 1 + len) % len;
                render(); // Re-render
            };
            if (btnNext) btnNext.onclick = (e) => {
                e.stopPropagation();
                const len = parsePlaylist(rawContent).length;
                node.properties.urlIndex = (node.properties.urlIndex + 1) % len;
                render(); // Re-render
            };
        }

        // Handle Padding Logic
        // If Media and NO title and NO playlist -> Full Bleed
        // If Media and Title -> Padding top is handled by topOffset logic, side padding?
        if (isMedia) {
            // If we have UI chrome (Header or Playlist), we need side padding for the chrome, but maybe not the video?
            // Actually simpler to just keep side padding small for everything.
            // Or remove it if "Pure Media" mode.
            if (!showTitle && !isPlaylist) {
                container.style.padding = "0";
            } else {
                container.style.padding = "8px 12px 0 12px"; // Bottom padding 0 to let video hit edge?
            }
        } else {
            container.style.padding = "8px 12px";
        }

        // Style adjustments for links
        const links = container.querySelectorAll("a");
        links.forEach(l => {
            l.style.color = "#4a9eff";
            l.style.textDecoration = "none";
            l.onmouseover = () => l.style.textDecoration = "underline";
            l.onmouseout = () => l.style.textDecoration = "none";
            l.target = "_blank";
        });

        // Initial size check
        if (!node.properties.userResized && !node.properties.initialized) {
            node.properties.initialized = true;
            node._isSystemResizing = true;
            if (node.size[1] < 150) {
                node.setSize([220, 180]);
            }
            node._isSystemResizing = false;
        }

        // Ensure height is correct after render
        syncHeight(topOffset);
    }

    // 3. Edit Modal
    function showEditor() {
        const wType = node.widgets.find(w => w.name === "content_type");
        const wTitle = node.widgets.find(w => w.name === "title");
        const wContent = node.widgets.find(w => w.name === "content");
        const wShowTitle = node.widgets.find(w => w.name === "show_title");

        const modal = document.createElement("dialog");
        modal.style.cssText = `
            padding: 20px;
            background: #2a2a2a;
            color: #eee;
            border: 1px solid #444;
            border-radius: 8px;
            width: 600px;
            max-width: 90vw;
            height: 500px;
            display: flex;
            flex-direction: column;
            gap: 15px;
            z-index: 10000;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
        `;

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">📝 Edit Note</h3>
                <button id="close" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:18px;">✕</button>
            </div>
            
            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label style="display:block; color:#aaa; font-size:12px; margin-bottom:4px;">Title</label>
                    <input id="inp-title" type="text" value="${wTitle.value}" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; box-sizing:border-box;">
                </div>
                <div style="width:120px;">
                    <label style="display:block; color:#aaa; font-size:12px; margin-bottom:4px;">Type</label>
                    <select id="inp-type" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; box-sizing:border-box;">
                        <option value="HTML">HTML</option>
                        <option value="Markdown">Markdown</option>
                        <option value="URL">URL</option>
                        <option value="Image">Image</option>
                        <option value="Video">Video</option>
                    </select>
                </div>
            </div>

            <div style="flex:1; display:flex; flex-direction:column;">
                <label style="display:block; color:#aaa; font-size:12px; margin-bottom:4px;">Content / URL</label>
                <textarea id="inp-content" style="flex:1; width:100%; padding:10px; background:#111; border:1px solid #444; color:#fff; font-family:monospace; border-radius:4px; resize:none; box-sizing:border-box; line-height:1.4;">${wContent.value}</textarea>
            </div>

            <div style="display:flex; gap:10px; align-items:center;">
                 <label style="display:flex; align-items:center; cursor:pointer; gap:6px; user-select:none;">
                    <input id="inp-showtitle" type="checkbox" ${wShowTitle.value ? "checked" : ""}>
                    <span style="font-size:13px; color:#ccc;">Show Title</span>
                </label>
                <div style="flex:1;"></div>
                <button id="cancel" style="padding:8px 16px; background:transparent; color:#aaa; border:1px solid #444; border-radius:4px; cursor:pointer;">Cancel</button>
                <button id="save" style="padding:8px 24px; background:#3a5a7c; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Save</button>
            </div>
        `;

        document.body.appendChild(modal);
        modal.showModal();

        // Set type select value
        modal.querySelector("#inp-type").value = wType.value;

        // Handlers
        const close = () => { modal.close(); modal.remove(); };
        modal.querySelector("#close").onclick = close;
        modal.querySelector("#cancel").onclick = close;

        modal.querySelector("#save").onclick = () => {
            // Write back to widgets
            wTitle.value = modal.querySelector("#inp-title").value;
            wType.value = modal.querySelector("#inp-type").value;
            wContent.value = modal.querySelector("#inp-content").value;
            wShowTitle.value = modal.querySelector("#inp-showtitle").checked;

            // Trigger callbacks basically
            if (wTitle.callback) wTitle.callback(wTitle.value);

            render();
            node.setDirtyCanvas(true, true);

            close();
        };

        // NOTE: Backdrop click to close removed per user request
        // Users must explicitly click X or Cancel to close modal
    }

    // 4. Double Click Hook
    node.onDblClick = function () {
        showEditor();
    };

    // Initial Render delay to wait for widgets
    setTimeout(render, 100);
}

/**
 * Set up Shima.Sticker (Transparent Branding)
 */
/**
 * Set up Shima.Sticker (Transparent Branding)
 */
function setupStickerWidgets(node) {
    // Hide title logic
    node.title = "";
    if (node.bgcolor) node.bgcolor = "transparent";
    node.shima_ignore_color = true;

    // 1. Image Object for Canvas Drawing
    node.stickerImage = new Image();
    node.stickerImage.src = ""; // Init empty

    // --- State & Logic ---
    let logoList = [];

    // Fetch logos once
    async function fetchLogos() {
        try {
            const res = await api.fetchApi("/shima/logos");
            if (res.ok) {
                logoList = await res.json();
            }
        } catch (e) {
            console.error("[Shima] Failed to list logos", e);
        }
    }
    fetchLogos();

    // Helper to create range slider
    function createSlider(label, min, max, step, value, onChange) {
        const wrapper = document.createElement("div");
        wrapper.style.marginBottom = "10px";

        const labelDiv = document.createElement("div");
        labelDiv.style.display = "flex";
        labelDiv.style.justifyContent = "space-between";
        labelDiv.style.fontSize = "12px";
        labelDiv.style.color = "#ccc";
        labelDiv.innerHTML = `<span>${label}</span><span>${Number(value).toFixed(1)}</span>`;

        const input = document.createElement("input");
        input.type = "range";
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = value;
        input.style.width = "100%";

        input.oninput = (e) => {
            const v = parseFloat(e.target.value);
            labelDiv.lastElementChild.textContent = v.toFixed(1);
            onChange(v);
        };

        wrapper.appendChild(labelDiv);
        wrapper.appendChild(input);
        return wrapper;
    }

    // Picker Dialog
    function showPicker() {
        // Get current values
        const wOpacity = node.widgets.find(w => w.name === "opacity");
        const wScale = node.widgets.find(w => w.name === "scale");
        const currentOpacity = wOpacity ? wOpacity.value : 1.0;
        const currentScale = wScale ? wScale.value : 1.0;

        const dialog = document.createElement("dialog");
        dialog.style.cssText = `
            padding: 0;
            border: 1px solid #444;
            border-radius: 8px;
            background: #222;
            color: #eee;
            width: 320px;
            max-height: 500px;
            display: flex;
            flex-direction: column;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            margin: auto;
        `;

        // Header with Refresh and Close Buttons
        const header = document.createElement("div");
        header.style.cssText = "padding: 10px; border-bottom: 1px solid #333; font-weight: bold; background: #1a1a1a; display: flex; justify-content: space-between; align-items: center;";
        header.innerHTML = `<span>Sticker Settings</span>`;

        const btnContainer = document.createElement("div");
        btnContainer.style.display = "flex";
        btnContainer.style.gap = "8px";

        const refreshBtn = document.createElement("button");
        refreshBtn.textContent = "🔄";
        refreshBtn.title = "Refresh sticker list";
        refreshBtn.style.cssText = "background:none; border:none; color:#888; cursor:pointer; font-size:14px;";
        refreshBtn.onmouseenter = () => refreshBtn.style.color = "#fff";
        refreshBtn.onmouseleave = () => refreshBtn.style.color = "#888";
        refreshBtn.onclick = async () => {
            refreshBtn.textContent = "⏳";
            await fetchLogos();
            refreshBtn.textContent = "🔄";
            // Rebuild the logo list
            list.innerHTML = "";
            if (logoList.length === 0) {
                list.innerHTML = "<div style='padding:10px; color:#aa5555; font-size:12px;'>No logos found</div>";
            } else {
                logoList.forEach(name => {
                    const item = document.createElement("div");
                    item.textContent = name;
                    item.style.cssText = "padding: 6px 10px; cursor: pointer; border-bottom: 1px solid #222; font-size: 13px;";
                    item.onmouseover = () => item.style.background = "#333";
                    item.onmouseout = () => item.style.background = "transparent";
                    item.onclick = () => {
                        const wLogo = node.widgets.find(w => w.name === "logo");
                        if (wLogo) {
                            wLogo.value = name;
                            if (wLogo.callback) wLogo.callback(name);
                        }
                    };
                    list.appendChild(item);
                });
            }
        };
        btnContainer.appendChild(refreshBtn);

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        closeBtn.style.cssText = "background:none; border:none; color:#888; cursor:pointer; font-size:16px;";
        closeBtn.onmouseenter = () => closeBtn.style.color = "#fff";
        closeBtn.onmouseleave = () => closeBtn.style.color = "#888";
        closeBtn.onclick = () => dialog.close();
        btnContainer.appendChild(closeBtn);

        header.appendChild(btnContainer);
        dialog.appendChild(header);

        // Content Area
        const content = document.createElement("div");
        content.style.cssText = "padding: 15px; overflow-y: auto; flex: 1;";

        // Sliders
        const opacitySlider = createSlider("Opacity", 0, 1, 0.1, currentOpacity, (v) => {
            if (wOpacity) { wOpacity.value = v; if (wOpacity.callback) wOpacity.callback(v); }
        });
        const scaleSlider = createSlider("Scale", 0.1, 5, 0.1, currentScale, (v) => {
            if (wScale) { wScale.value = v; if (wScale.callback) wScale.callback(v); }
        });

        content.appendChild(opacitySlider);
        content.appendChild(scaleSlider);

        // Logo List Header
        const listHeader = document.createElement("div");
        listHeader.textContent = "Select Logo:";
        listHeader.style.cssText = "margin-top: 10px; margin-bottom: 5px; font-size: 12px; color: #888; border-top: 1px solid #333; padding-top: 10px;";
        content.appendChild(listHeader);

        // Logo List
        const list = document.createElement("div");
        list.style.cssText = "background: #111; border: 1px solid #333; border-radius: 4px; max-height: 200px; overflow-y: auto;";

        if (logoList.length === 0) {
            list.innerHTML = "<div style='padding:10px; color:#aa5555; font-size:12px;'>No logos found</div>";
        } else {
            logoList.forEach(name => {
                const item = document.createElement("div");
                item.textContent = name;
                item.style.cssText = "padding: 6px 10px; cursor: pointer; border-bottom: 1px solid #222; font-size: 13px;";
                item.onmouseover = () => item.style.background = "#333";
                item.onmouseout = () => item.style.background = "transparent";

                item.onclick = () => {
                    const wLogo = node.widgets.find(w => w.name === "logo");
                    if (wLogo) {
                        wLogo.value = name;
                        if (wLogo.callback) wLogo.callback(name);
                    }
                    // Keep open for slider adjustments
                };
                list.appendChild(item);
            });
        }
        content.appendChild(list);
        dialog.appendChild(content);

        document.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
    }



    // Bind Double Click
    node.onDblClick = function () {
        showPicker();
    };

    function update() {
        // Force empty title
        node.title = "";
        node.bgcolor = "transparent";
        node.boxcolor = "transparent";

        // Widgets: logo, opacity, scale
        const wLogo = node.widgets.find(w => w.name === "logo");
        const wOpacity = node.widgets.find(w => w.name === "opacity");
        const wScale = node.widgets.find(w => w.name === "scale");

        // Hide widgets!
        [wLogo, wOpacity, wScale].forEach(w => {
            if (w) {
                w.type = "hidden";
                w.computeSize = () => [0, 0];
                w.hidden = true;
            }
        });

        const logoName = wLogo?.value;
        const scale = wScale?.value ?? 1.0;

        if (logoName) {
            // New route: /shima/sticker/image/{subdir}/{filename}
            // logoName is "PNG/foo.png" or "SVG/bar.svg"
            const url = `/shima/sticker/image/${logoName}`;
            // Preload image
            if (!node.stickerImage.src.includes(url)) {
                node.stickerImage.src = url;
                node.stickerImage.onload = () => {
                    node.setDirtyCanvas(true, true);

                    // Only resize if user hasn't manually resized
                    if (!node.properties?.userResized) {
                        const img = node.stickerImage;
                        const padding = 20;
                        const w = img.width * scale;
                        const h = img.height * scale;

                        node._isSystemResizing = true;
                        node.setSize([w + padding, h + padding]);
                        node._isSystemResizing = false;
                    }
                }
            } else if (node.stickerImage.complete) {
                // Ensure size matches scale if already loaded
                if (!node.properties?.userResized) {
                    const img = node.stickerImage;
                    const padding = 20;
                    const w = img.width * scale;
                    const h = img.height * scale;

                    node._isSystemResizing = true;
                    node.setSize([w + padding, h + padding]);
                    node._isSystemResizing = false;
                }
            }
        }
    }

    // Initialize properties
    if (!node.properties) node.properties = {};

    // Track manual resizing
    node.onResize = function (size) {
        if (!this._isSystemResizing) {
            this.properties.userResized = true;
        }
    }

    // prevent default title/background drawing
    node.onDrawForeground = function (ctx) {
        if (this.flags.collapsed) return false; // Let it draw if collapsed (or handle differently)
        return true; // Return true to prevent default title/body drawing? 
        // Actually LiteGraph doesn't skip body with this return value usually, 
        // but we can try setting bgcolor/color to Fully Transparent
    }

    // Aggressive overrides removed

    // Force empty title
    node.getTitle = function () { return ""; }
    node.title = "";

    // Hook updates
    const widgets = ["logo", "opacity", "scale"];
    widgets.forEach(name => {
        const w = node.widgets.find(x => x.name === name);
        if (w) {
            const cb = w.callback;
            w.callback = function (v) {
                update();
                node.setDirtyCanvas(true, true);
                if (cb) cb(v);
            }
        }
    });

    // 2. Override Draw Background (Canvas Render)
    node.onDrawBackground = function (ctx) {
        if (!this.stickerImage || !this.stickerImage.src) return;

        // Get properties
        const wOpacity = this.widgets?.find(w => w.name === "opacity");
        const wScale = this.widgets?.find(w => w.name === "scale");
        const opacity = wOpacity ? wOpacity.value : 1.0;
        const scale = wScale ? wScale.value : 1.0;

        ctx.save();
        ctx.globalAlpha = opacity;

        // Draw centered and scaled
        const img = this.stickerImage;
        if (img.width && img.height) {
            const aspect = img.width / img.height;
            // Base size on node width
            let drawW = this.size[0] * scale;
            let drawH = (this.size[0] / aspect) * scale;

            // Center it relative to node center
            const x = (this.size[0] - drawW) / 2;
            let y = (this.size[1] - drawH) / 2;

            // Offset up to account for title bar and center in WHOLE node
            // LiteGraph.NODE_TITLE_HEIGHT is usually 30, so offset by 15
            y -= 15;

            ctx.drawImage(img, x, y, drawW, drawH);
        }

        ctx.restore();
        return true; // Overrides litegraph default box rendering entirely
    };

    setTimeout(update, 100);
}
