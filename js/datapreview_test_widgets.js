/**
 * Shima.DataPreviewTest - Widget Extensions
 * 
 * Implements:
 * 1. "Used Values" display box (like Inspector)
 * 2. Widget highlighting (green border for critical switches)
 */

import { app } from "../../scripts/app.js";
// Bottom toggles replaced by toolbar - import removed

/**
 * EXPERIMENT: Toolbar with working toggle icons
 */
function addToolbarTest(node) {
    const TOOLBAR_HEIGHT = 28;

    // Store button click areas
    node.toolbarButtons = [];

    const origDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        ctx.save();

        // Draw toolbar background
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(0, 0, this.size[0], TOOLBAR_HEIGHT);

        // Draw bottom border
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, TOOLBAR_HEIGHT);
        ctx.lineTo(this.size[0], TOOLBAR_HEIGHT);
        ctx.stroke();

        // Reset button areas each frame
        this.toolbarButtons = [];

        const iconY = TOOLBAR_HEIGHT / 2;
        const iconSize = 16;
        let xOffset = 8;

        ctx.font = `${iconSize}px Arial`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";

        // Common Params toggle (dynamic icon)
        const cpWidget = this.widgets?.find(w => w.name === "use_commonparams");
        if (cpWidget) {
            const icon = cpWidget.value ? "🟢" : "🔴";
            ctx.fillStyle = "#fff";
            ctx.fillText(icon, xOffset, iconY);
            this.toolbarButtons.push({
                widget: cpWidget,
                x: xOffset - 2, y: 0,
                width: iconSize + 4, height: TOOLBAR_HEIGHT
            });
            xOffset += iconSize + 8;
        }

        // External Linking toggle (dynamic icon)
        const elWidget = this.widgets?.find(w => w.name === "allow_external_linking");
        if (elWidget) {
            const icon = elWidget.value ? "🔗" : "❌";
            ctx.fillStyle = "#fff";
            ctx.fillText(icon, xOffset, iconY);
            this.toolbarButtons.push({
                widget: elWidget,
                x: xOffset - 2, y: 0,
                width: iconSize + 4, height: TOOLBAR_HEIGHT
            });
        }

        // Label
        ctx.fillStyle = "#666";
        ctx.font = "10px Arial";
        ctx.textAlign = "right";
        ctx.fillText("(toolbar test)", this.size[0] - 8, iconY);

        ctx.restore();

        if (origDrawForeground) {
            origDrawForeground.call(this, ctx);
        }
    };

    // Handle clicks in toolbar
    const origOnMouseDown = node.onMouseDown;
    node.onMouseDown = function (e, localPos, canvas) {
        if (this.toolbarButtons) {
            for (const btn of this.toolbarButtons) {
                if (localPos[0] >= btn.x && localPos[0] <= btn.x + btn.width &&
                    localPos[1] >= btn.y && localPos[1] <= btn.y + btn.height) {
                    // Toggle!
                    btn.widget.value = !btn.widget.value;
                    if (btn.widget.callback) btn.widget.callback(btn.widget.value);
                    this.setDirtyCanvas(true, true);
                    console.log(`[Toolbar] Toggled ${btn.widget.name} to ${btn.widget.value}`);
                    return true;
                }
            }
        }
        if (origOnMouseDown) return origOnMouseDown.call(this, e, localPos, canvas);
    };

    // Handle hover for tooltips
    const origOnMouseMove = node.onMouseMove;
    node.onMouseMove = function (e, localPos, canvas) {
        let tooltip = null;
        if (this.toolbarButtons) {
            for (const btn of this.toolbarButtons) {
                if (localPos[0] >= btn.x && localPos[0] <= btn.x + btn.width &&
                    localPos[1] >= btn.y && localPos[1] <= btn.y + btn.height) {
                    // Generate tooltip text
                    if (btn.widget.name === "use_commonparams") {
                        tooltip = btn.widget.value
                            ? "Common Params: ON (click to disable)"
                            : "Common Params: OFF (click to enable)";
                    } else if (btn.widget.name === "allow_external_linking") {
                        tooltip = btn.widget.value
                            ? "External Linking: ON (click to disable)"
                            : "External Linking: OFF (click to enable)";
                    }
                    break;
                }
            }
        }

        // Set canvas tooltip
        if (canvas && canvas.canvas) {
            canvas.canvas.title = tooltip || "";
        }

        if (origOnMouseMove) return origOnMouseMove.call(this, e, localPos, canvas);
    };

    // Increase node height for toolbar
    const origComputeSize = node.computeSize;
    node.computeSize = function (out) {
        const size = origComputeSize ? origComputeSize.call(this, out) : [200, 100];
        size[1] += TOOLBAR_HEIGHT;
        return size;
    };

    // Push slots down
    node.constructor.slot_start_y = TOOLBAR_HEIGHT;
    node.slot_start_y = TOOLBAR_HEIGHT;

    console.log("[Test] Toolbar with click handling ready!");
}

/**
 * Set up the "used values" text display for DataPreviewTest node
 * @param {LGraphNode} node - The node instance
 */
function setupUsedValuesDisplay(node) {
    // Create a container for the text display
    const container = document.createElement("div");
    container.className = "shima-used-values-display";
    container.style.cssText = `
        background: #1a1a1a;
        color: #888;
        padding: 8px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        border-top: 1px solid #333;
        white-space: pre;
        line-height: 1.4;
    `;
    container.textContent = "Waiting for execution...";

    // Add as a DOM widget (non-serialized)
    const widget = node.addDOMWidget("used_values_display", "div", container, {
        serialize: false,
        hideOnZoom: false
    });

    if (widget) {
        // Make the widget taller to show all content
        widget.computeSize = () => [node.size[0] - 20, 140];
    }

    // Store reference for updates
    node.shimaUsedValuesContainer = container;
    node.shimaUsedValuesWidget = widget;

    // Hook into onExecuted to receive the used values text
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) {
            origOnExecuted.call(this, message);
        }

        // Update the text display if we received used_values
        if (message?.used_values && message.used_values[0]) {
            container.textContent = message.used_values[0];
        }
    };

    console.log("[Shima] Set up used values display for DataPreviewTest");
}

/**
 * Highlight a widget with a colored border and colored toggle dot
 * @param {LGraphNode} node - The node instance
 * @param {string} widgetName - Name of widget to highlight
 * @param {string} color - CSS color for the highlight
 */
function highlightWidget(node, widgetName, color) {
    const widget = node.widgets?.find(w => w.name === widgetName);
    if (!widget) {
        console.warn(`[Shima] Widget "${widgetName}" not found for highlighting`);
        return;
    }

    // Store custom color on the widget
    widget.shimaHighlightColor = color;

    // Mark node for custom drawing
    if (!node.shimaHighlightedWidgets) {
        node.shimaHighlightedWidgets = [];
    }
    node.shimaHighlightedWidgets.push(widgetName);

    console.log(`[Shima] Highlighting widget "${widgetName}" with color ${color}`);
}

/**
 * Helper to draw rounded rectangle
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
 * Custom draw function to render highlighted widget borders and colored toggle dots
 * Draws a "halo" effect - slightly larger rounded rectangle behind the widget
 * to create a visible border without z-order issues
 * @param {LGraphNode} node - The node instance
 */
function setupHighlightedWidgetDrawing(node) {
    // Use onDrawForeground which draws AFTER widgets
    const origOnDrawForeground = node.onDrawForeground;

    node.onDrawForeground = function (ctx) {
        // Draw highlights FIRST (before widgets render on top)
        if (this.shimaHighlightedWidgets && this.widgets) {
            const NODE_TITLE_HEIGHT = LiteGraph.NODE_TITLE_HEIGHT || 30;
            const NODE_WIDGET_HEIGHT = LiteGraph.NODE_WIDGET_HEIGHT || 20;

            ctx.save(); // Save context state

            for (const widgetName of this.shimaHighlightedWidgets) {
                const widget = this.widgets.find(w => w.name === widgetName);
                if (!widget || widget.type === "hidden") continue;

                const highlightColor = widget.shimaHighlightColor || "#00ff00";
                const widgetIndex = this.widgets.indexOf(widget);


                // DEBUG: Log once per node setup, not every frame
                if (!this.shimaHaloDebugLogged) {
                    console.log(`[Shima Halo] Highlighting widget "${widgetName}" at index ${widgetIndex} of ${this.widgets.length} total widgets`);
                    this.shimaHaloDebugLogged = true;
                }

                // Calculate widget Y position
                // Current calc puts us at widget 4, we need widget 5, so add 20px more
                // Formula was: 30 + 2 + (5*20) + 20 = 152 (widget 4)
                // Need: 30 + 2 + (5*20) + 40 = 172 (widget 5)
                const topMargin = 2;
                const extraOffset = 36; // Extra offset to align properly
                const y = NODE_TITLE_HEIGHT + topMargin + (widgetIndex * NODE_WIDGET_HEIGHT) + extraOffset;

                // For pill-shaped widgets (toggles), draw a halo that's slightly larger
                // This creates a visible border around the widget without z-order issues
                const haloOffset = 3; // How much larger the halo is (in all directions)

                // The actual widget pill is smaller than NODE_WIDGET_HEIGHT
                // It's approximately 16px tall, not 20px
                const actualPillHeight = 16;

                // Calculate precise dimensions for the halo
                const haloX = 16 - haloOffset;
                // Adjust Y to center on the smaller actual pill (+2px centers the halo vertically)
                const haloY = y - haloOffset - 1;
                const haloWidth = this.size[0] - 32 + (haloOffset * 2);
                // Use the actual pill height, not NODE_WIDGET_HEIGHT
                const haloHeight = actualPillHeight + 1 + (haloOffset * 2);

                // Make pill radius fully semicircular (height / 2 for perfect semi-circle ends)
                const pillRadius = haloHeight / 1.8;

                // Draw the halo outline
                ctx.strokeStyle = highlightColor;
                ctx.lineWidth = 2;
                ctx.setLineDash([]);

                drawRoundedRect(ctx, haloX, haloY, haloWidth, haloHeight, pillRadius);
                ctx.stroke();

                // Add a subtle glow effect for extra visibility
                ctx.shadowColor = highlightColor;
                ctx.shadowBlur = 6;

                // Draw again with glow
                drawRoundedRect(ctx, haloX, haloY, haloWidth, haloHeight, pillRadius);
                ctx.stroke();

                // Reset shadow
                ctx.shadowBlur = 0;
            }

            ctx.restore(); // Restore context state
        }

        // Call original draw AFTER highlights (so widgets draw on top)
        if (origOnDrawForeground) {
            origOnDrawForeground.call(this, ctx);
        }
    };
}

/**
 * Main setup function for Shima.DataPreviewTest node
 * @param {LGraphNode} node - The node instance
 */
function setupDataPreviewTestNode(node) {
    // EXPERIMENT: Add toolbar below title to test layout
    addToolbarTest(node);

    // 1. Add the "used values" text display box
    setupUsedValuesDisplay(node);

    // 2. Inject Icon Rows (Mid-Way Toolbar)
    const row1Items = [
        // Image Test (32x32 Cyan Square)
        {
            id: "img_test",

            icon: "🟦", // Fallback
            // image: "data:image/png;base64...", // Disabled to prevent crash
            tooltip: "Blue Box"
        },
        { id: "bear", icon: "🐻", tooltip: "Bear" },
        { id: "ferris", icon: "🎡", tooltip: "Ferris Wheel" },
        { id: "car", icon: "🚗", tooltip: "Car" },
        { id: "train", icon: "🚂", tooltip: "Train" },
        { id: "clap", icon: "👏", tooltip: "Clap" }
    ];

    createIconRowWidget(node, "emoji_row_1", row1Items, "test_width", {
        yOffset: 14 // Custom vertical alignment
    });

    // 2b. Inject 3x3 Grid (MultiSaver Preview)
    const gridItems = [
        { id: "unprocessed", image: "/extensions/Shima/icons/multisaver_icon_unprocessed_128px.png", default: true },
        { id: "lineart", image: "/extensions/Shima/icons/multisaver_icon_lineart_128px.png" },
        { id: "canny", image: "/extensions/Shima/icons/multisaver_icon_canny_128px.png" },
        { id: "depth", image: "/extensions/Shima/icons/multisaver_icon_depth_128px.png" },
        { id: "normal", image: "/extensions/Shima/icons/multisaver_icon_normals_128px.png" },
        { id: "palette", image: "/extensions/Shima/icons/multisaver_icon_palette_128px.png" },
        { id: "highlights", image: "/extensions/Shima/icons/multisaver_icon_highlights_128px.png" },
        { id: "shadow", image: "/extensions/Shima/icons/multisaver_icon_shadows_128px.png" },
        { id: "fx", icon: "✨" }
    ];

    // Mapping: Grid ID -> [Widget Names]
    const subsetMapping = {
        "lineart": ["line_art_invert"],
        "canny": ["canny_high", "canny_low"],
        "depth": ["depth_model"],
        "normal": ["normal_model", "normal_strength"],
        "palette": ["palette_colors"],
        "highlights": ["highlight_threshold"],
        "shadow": ["shadow_threshold"],
        "fx": []
    };

    // Helper to toggle visibility
    const updateWidgetVisibility = (activeIds) => {
        const allSubsetWidgets = Object.values(subsetMapping).flat();
        let changed = false;

        allSubsetWidgets.forEach(wName => {
            // Find parent ID
            const parentId = Object.keys(subsetMapping).find(k => subsetMapping[k].includes(wName));
            const shouldShow = activeIds.includes(parentId);

            const widget = node.widgets?.find(w => w.name === wName);
            if (widget) {
                if (shouldShow && widget.type === "hidden") {
                    widget.type = widget.origType;
                    widget.computeSize = widget.origComputeSize;
                    changed = true;
                } else if (!shouldShow && widget.type !== "hidden") {
                    if (!widget.origType) {
                        widget.origType = widget.type;
                        widget.origComputeSize = widget.computeSize;
                    }
                    widget.type = "hidden";
                    widget.computeSize = () => [0, -4];
                    changed = true;
                }
            }
        });

        if (changed) {
            node.setDirtyCanvas(true, true);
            node.setSize(node.computeSize());
        }
    };

    const gridWidget = createIconGridWidget(node, "grid_test", gridItems, "emoji_row_1", {
        columns: 3,
        cellHeight: 80,
        iconSize: 64
    });

    // Hook callback
    gridWidget.callback = (val) => {
        updateWidgetVisibility(val);
    };

    // Initial Update
    setTimeout(() => {
        updateWidgetVisibility(gridWidget.value);
    }, 100);

    // Bottom toggles removed - now using toolbar icons
    // 3. Hide the actual toggle widgets (handled by bottom icons now)
    const hideWidget = (widgetName) => {
        const widget = node.widgets?.find(w => w.name === widgetName);
        if (widget && widget.type !== "hidden") {
            widget.origType = widget.type;
            widget.origComputeSize = widget.computeSize;
            widget.type = "hidden";
            widget.computeSize = () => [0, -4];
        }
    };

    setTimeout(() => {
        hideWidget("use_commonparams");
        hideWidget("allow_external_linking");

        // Recalculate node size after hiding widgets
        const newSize = node.computeSize();
        node.setSize([node.size[0], newSize[1]]);
        node.setDirtyCanvas(true, true);
    }, 100);

    // 4. Set up dynamic visibility for the used values display
    const showWidget = node.widgets?.find(w => w.name === "show_used_values");
    if (showWidget && node.shimaUsedValuesWidget) {
        // Function to update visibility
        const updateVisibility = (visible) => {
            const widget = node.shimaUsedValuesWidget;
            if (!widget) return;

            // Store current width to preserve it
            const currentWidth = node.size[0];

            if (visible) {
                // Show the widget
                if (widget.type === "hidden") {
                    widget.type = widget.origType || "div";
                    widget.computeSize = widget.origComputeSize || (() => [currentWidth - 20, 140]);
                }
            } else {
                // Hide the widget
                if (widget.type !== "hidden") {
                    widget.origType = widget.type;
                    widget.origComputeSize = widget.computeSize;
                    widget.type = "hidden";
                    widget.computeSize = () => [0, -4];
                }
            }

            // Recalculate height but preserve width
            const newSize = node.computeSize();
            node.setSize([Math.max(currentWidth, newSize[0]), newSize[1]]);
            node.setDirtyCanvas(true, true);
        };

        // Hook into the toggle's callback
        const origCallback = showWidget.callback;
        showWidget.callback = function (value) {
            updateVisibility(value);
            if (origCallback) {
                origCallback.call(this, value);
            }
        };

        // Apply initial visibility
        updateVisibility(showWidget.value);
    }

    // 5. Adjust initial node size to accommodate the text box (if visible)
    setTimeout(() => {
        const currentHeight = node.size[1];
        const showValues = showWidget?.value !== false;
        const targetHeight = showValues ? 450 : 320;
        node.setSize([Math.max(node.size[0], 350), Math.max(currentHeight, targetHeight)]);
    }, 100);

    // 6. Persistence Fix
    preserveWidgetValues(node, ["use_commonparams", "allow_external_linking"]);

    // 7. Reorder Widgets (Requested Layout)
    // Desired: seed, width, emoji, grid, [sub-settings...], height, project, model, show_toggle, used_values_text
    setTimeout(() => {
        const order = [
            "shima.commonparams", "test_seed", "test_width",
            "emoji_row_1", "grid_test",
            // Sub-settings (Dynamic)
            "line_art_invert", "canny_high", "canny_low", "depth_model",
            "normal_model", "normal_strength", "palette_colors",
            "highlight_threshold", "shadow_threshold",
            // Standard
            "test_height", "test_project", "test_model",
            "allow_external_linking", "show_used_values"
        ];

        const getOrder = (w) => {
            const idx = order.indexOf(w.name);
            return idx === -1 ? 999 : idx;
        };

        if (node.widgets) {
            node.widgets.sort((a, b) => getOrder(a) - getOrder(b));

            // Force Hide Widgets (Ensure they stay hidden after sort)
            const hideList = ["use_commonparams", "allow_external_linking"];
            hideList.forEach(wName => {
                const w = node.widgets.find(x => x.name === wName);
                // Only hide if not already hidden
                if (w && w.type !== "hidden") {
                    w.origType = w.type;
                    w.origComputeSize = w.computeSize;
                    w.type = "hidden";
                    w.computeSize = () => [0, -4];
                }
            });

            node.setDirtyCanvas(true, true);
            node.setSize(node.computeSize());
        }
    }, 200);

    console.log("[Shima] DataPreviewTest node fully configured");
}

/**
 * Create a custom widget that displays a row of clickable icons (Mid-Way Toolbar)
 * @param {LGraphNode} node - The node to add widget to
 * @param {string} name - Widget name
 * @param {object} [options] - Configuration options
 * @param {number} [options.widgetHeight=44] - Widget height
 * @param {number} [options.iconSize=32] - Icon size (px)
 * @param {number} [options.padding=10] - Horizontal padding
 * @param {number} [options.yOffset=14] - Vertical offset
 * @param {string} [options.fontFamily="Arial"] - Font family for icons
 */
function createIconRowWidget(node, name, items, insertAfterName, options = {}) {
    const {
        widgetHeight = 44,
        iconSize = 32,
        padding = 10,
        yOffset = 14,
        fontFamily = "Arial"
    } = options;

    const WIDGET_HEIGHT = widgetHeight;
    const ICON_SIZE = iconSize;

    // Initialize default value (list of active IDs)
    const defaultVal = items.filter(i => i.default).map(i => i.id);

    const widget = {
        name: name,
        type: "SHIMA_ICON_ROW",
        value: defaultVal,
        options: { serialize: true },

        draw: function (ctx, node, widgetWidth, y, widgetHeight) {
            try {
                this.last_y = y; // Capture Y position for mouse hit testing
                ctx.save(); // CRITICAL: Prevent state leak to other widgets

                // Safety check for value
                if (!this.value || !Array.isArray(this.value)) {
                    this.value = this.value || []; // Ensure it is an iterable
                }

                const count = items.length;
                if (count === 0) { ctx.restore(); return; }

                const PADDING = padding;
                const availableWidth = widgetWidth - (PADDING * 2);
                const step = availableWidth / count;

                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.font = `${ICON_SIZE}px ${fontFamily}`;

                items.forEach((item, index) => {
                    const Y_OFFSET = yOffset;
                    const centerX = PADDING + (index * step) + (step / 2);
                    const centerY = y + (widgetHeight / 2) + Y_OFFSET;

                    const isActive = this.value.includes(item.id);

                    // Highlight if active
                    if (isActive) {
                        ctx.fillStyle = "#444";
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, (ICON_SIZE / 2) + 6, 0, Math.PI * 2);
                        ctx.fill();

                        // Active indicator (green dot)
                        ctx.fillStyle = "#00ff00";
                        ctx.beginPath();
                        ctx.arc(centerX + 8, centerY + 8, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    // Draw Content (Image or Icon)
                    if (item.image) {
                        if (!item._imgObj) {
                            item._imgObj = new Image();
                            item._imgObj.src = item.image;
                            item._imgObj.onload = () => node.setDirtyCanvas(true, true);
                        }

                        // Draw image if ready
                        if (item._imgObj.complete && item._imgObj.naturalWidth > 0) {
                            const imgSize = ICON_SIZE + 4;
                            ctx.drawImage(item._imgObj, centerX - (imgSize / 2), centerY - (imgSize / 2), imgSize, imgSize);
                        } else {
                            // While loading/broken, fallback to text if available or "..."
                            ctx.fillStyle = "#999";
                            ctx.fillText(item.icon || "...", centerX, centerY);
                        }
                    } else {
                        // Text Icon
                        ctx.fillStyle = "#fff";
                        ctx.fillText(item.icon, centerX, centerY);
                    }
                });

                ctx.restore();
            } catch (e) {
                console.error("[Shima] IconRow draw error:", e);
                ctx.restore(); // Ensure restore on error
            }
        },

        mouse: function (event, pos, node) {
            // Check bounds (Crucial to prevent stealing clicks from other widgets)
            if (pos[1] < this.last_y || pos[1] > (this.last_y + WIDGET_HEIGHT)) {
                return false;
            }

            if (event.type === "mousedown" || event.type === "pointerdown") {
                // Safety check for value
                // Safety check for value
                if (!this.value || !Array.isArray(this.value)) {
                    this.value = this.value || [];
                }

                const widgetWidth = node.size[0];
                const count = items.length;
                if (count === 0) return false;

                const PADDING = padding;
                const availableWidth = widgetWidth - (PADDING * 2);
                const step = availableWidth / count;

                // Determine clicked item index relative to padding
                const x = pos[0] - PADDING;
                const index = Math.floor(x / step);

                if (index >= 0 && index < count) {
                    const item = items[index];

                    // DEBUG: Alert on click
                    if ((item.id === "bear" || item.id === "img_test") && (event.type === "mousedown" || event.type === "pointerdown")) {
                        alert("Widget Clicked! Item: " + item.id);
                    }

                    // Toggle value

                    // Toggle value
                    const valIndex = this.value.indexOf(item.id);
                    if (valIndex === -1) {
                        this.value.push(item.id); // Add
                    } else {
                        this.value.splice(valIndex, 1); // Remove
                    }

                    // Trigger callback?
                    if (this.callback) {
                        this.callback(this.value);
                    }

                    node.setDirtyCanvas(true, true);
                    return true; // Handled
                }
            }
            return false;
        },

        computeSize: function (width) {
            return [width, WIDGET_HEIGHT];
        }
    };

    // Insert into widget list at specific position
    if (insertAfterName) {
        const idx = node.widgets.findIndex(w => w.name === insertAfterName);
        if (idx !== -1) {
            node.widgets.splice(idx + 1, 0, widget);
        } else {
            node.widgets.push(widget);
        }
    } else {
        node.widgets.push(widget);
    }

    return widget;
}

/**
 * Helper to preserve widget values during serialization (Fix for hidden toolbar widgets)
 */
function preserveWidgetValues(node, widgetNames) {
    const origSerialize = node.serialize;
    node.serialize = function () {
        const data = origSerialize ? origSerialize.call(this) : {};
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
        if (info._shima_preserved) {
            setTimeout(() => {
                Object.entries(info._shima_preserved).forEach(([widgetName, value]) => {
                    const widget = this.widgets?.find(w => w.name === widgetName);
                    if (widget) {
                        widget.value = value;
                        // Trigger callback to update UI/Internal state
                        if (widget.callback) widget.callback(widget.value);
                    }
                });
            }, 100);
        }
    };
}

/**
 * Create a grid of clickable icons (3x3 Prototype)
 * @param {LGraphNode} node - The node to add widget to
 * @param {string} name - Widget name
 * @param {Array} items - Array of items {id, image, icon}
 * @param {string} insertAfterName - Name of widget to insert after
 * @param {object} [options] - Configuration options
 */
function createIconGridWidget(node, name, items, insertAfterName, options = {}) {
    const {
        columns = 3,
        cellHeight = 80, // Enough for 64px icon + text/padding
        iconSize = 64
    } = options;

    const rows = Math.ceil(items.length / columns);
    const WIDGET_HEIGHT = rows * cellHeight;

    const widget = {
        name: name,
        type: "SHIMA_ICON_GRID",
        value: items.filter(i => i.default).map(i => i.id), // Initialize defaults
        options: { serialize: true }, // Enable serialization

        draw: function (ctx, node, widgetWidth, y, widgetHeight) {
            try {
                this.last_y = y; // Capture Y for mouse detection
                ctx.save();

                const cellWidth = widgetWidth / columns;

                // Ensure value is array
                if (!this.value || !Array.isArray(this.value)) this.value = [];

                items.forEach((item, index) => {
                    const col = index % columns;
                    const row = Math.floor(index / columns);

                    const cellX = col * cellWidth;
                    const cellY = y + (row * cellHeight);
                    const centerX = cellX + (cellWidth / 2);
                    const centerY = cellY + (cellHeight / 2);

                    const isActive = this.value.includes(item.id);

                    // Draw Selection Highlight (Green Glowing Rect)
                    if (isActive) {
                        ctx.save();
                        // Glow Effect
                        ctx.shadowColor = "#00ff00";
                        ctx.shadowBlur = 15; // Strong glow
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                        // Green Border
                        ctx.strokeStyle = "#00ff00";
                        ctx.lineWidth = 3;

                        // Draw rounded rect
                        ctx.beginPath();
                        ctx.roundRect(centerX - (cellWidth / 2) + 4, centerY - (cellHeight / 2) + 4, cellWidth - 8, cellHeight - 8, 8);
                        ctx.stroke();

                        // Optional: Subtle fill?
                        // ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
                        // ctx.fill();

                        ctx.restore();
                    } else {
                        // Inactive Hover or Default bg?
                        // Just keep clean dark
                    }

                    // Draw Icon/Image
                    if (item.image) {
                        if (!item._imgObj) {
                            item._imgObj = new Image();
                            // CACHE BUSTING: Append timestamp to force reload in Electron
                            item._imgObj.src = item.image + "?v=" + new Date().getTime();
                            item._imgObj.onload = () => node.setDirtyCanvas(true, true);
                            item._imgObj.onerror = (e) => {
                                console.error("[Shima] Grid Image Load Failed:", item.id, item.image, e);
                                item._imgError = true; // Mark as failed
                            };
                        }

                        if (item._imgError) {
                            // Explicit Error State
                            ctx.fillStyle = "#ff0000";
                            ctx.font = "10px Arial";
                            ctx.fillText("ERR", centerX, centerY);
                        } else if (item._imgObj.complete && item._imgObj.naturalWidth > 0) {
                            ctx.drawImage(item._imgObj, centerX - (iconSize / 2), centerY - (iconSize / 2), iconSize, iconSize);
                        } else {
                            // Fallback text
                            ctx.fillStyle = "#666";
                            ctx.font = "12px Arial";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText(item.id, centerX, centerY);
                        }
                    } else {
                        // Fallback (FX placeholder)
                        ctx.fillStyle = "#ccc";
                        ctx.font = "32px Arial";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(item.icon || "❓", centerX, centerY);
                    }
                });

                ctx.restore();
            } catch (e) {
                console.error("Grid Draw Error", e);
                ctx.restore();
            }
        },

        mouse: function (event, pos, node) {
            // Check bounds
            if (pos[1] < this.last_y || pos[1] > (this.last_y + WIDGET_HEIGHT)) {
                return false;
            }

            if (event.type === "mousedown" || event.type === "pointerdown") {
                const relY = pos[1] - this.last_y;
                const cellWidth = node.size[0] / columns;

                const col = Math.floor(pos[0] / cellWidth);
                const row = Math.floor(relY / cellHeight);
                const index = (row * columns) + col;

                if (index >= 0 && index < items.length) {
                    const item = items[index];

                    // Toggle Logic
                    const valIndex = this.value.indexOf(item.id);
                    if (valIndex === -1) {
                        this.value.push(item.id);
                    } else {
                        this.value.splice(valIndex, 1);
                    }

                    // Trigger Callback
                    if (this.callback) {
                        this.callback(this.value);
                    }

                    return true; // Handled
                }
            }
            return false;
        },

        computeSize: function (width) {
            return [width, WIDGET_HEIGHT];
        }
    };

    // Insert
    if (insertAfterName) {
        const idx = node.widgets.findIndex(w => w.name === insertAfterName);
        if (idx !== -1) {
            node.widgets.splice(idx + 1, 0, widget);
        } else {
            node.widgets.push(widget);
        }
    } else {
        node.widgets.push(widget);
    }

    return widget;
}

// Register the extension with ComfyUI
app.registerExtension({
    name: "Shima.DataPreviewTest",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.DataPreviewTest") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }
                setupDataPreviewTestNode(this);
            };
        }
    }
});
