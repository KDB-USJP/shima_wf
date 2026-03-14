/**
 * Shima Grid Widget - Reusable Component
 * 
 * Creates a graphical grid of icons that can be used as a replacement for boolean toggles.
 */

/**
 * Create a robust Grid Widget
 * @param {LGraphNode} node - The node instance
 * @param {string} name - unique name for the widget
 * @param {Array} items - Array of item objects { id, image/icon, default, tooltip }
 * @param {Object} options - { columns, cellHeight, iconSize }
 */
export function createIconGridWidget(node, name, items, options = {}) {
    const {
        columns = 3, // Default if minWidth not set
        minColumnWidth = 0, // If set, columns will be calculated dynamically
        cellHeight = 80,
        iconSize = 64,
        padding = 0, // External padding (left/right)
        maxHeight = 0, // If > 0, enables scrolling
        multi = true // If false, only one item can be selected
    } = options;

    // Internal State for Scrolling
    let scrollY = 0;
    let isDraggingScrollbar = false;
    let dragStartMouseY = 0;
    let dragStartScrollY = 0;

    // Helper to get layout
    const getLayout = (totalWidth) => {
        const usableWidth = totalWidth - (padding * 2);
        let numCols = columns;
        if (minColumnWidth > 0 && usableWidth > 0) {
            numCols = Math.max(1, Math.floor(usableWidth / minColumnWidth));
        }
        numCols = Math.round(numCols); // Ensure integer for hit testing
        const cellWidth = usableWidth / numCols;
        return { numCols, cellWidth };
    };

    // Helper to get total content height
    const getContentHeight = (totalWidth) => {
        const { numCols } = getLayout(totalWidth || 600); // Improved fallback width
        const currentRows = Math.ceil(items.length / numCols);
        return Math.max(1, currentRows) * cellHeight;
    };

    // Helper to get widget display height
    const getWidgetHeight = (totalWidth) => {
        const contentH = getContentHeight(totalWidth);
        if (maxHeight > 0) {
            return Math.min(contentH, maxHeight);
        }
        return contentH;
    };

    return {
        name: name,
        type: "SHIMA_ICON_GRID",
        value: [],
        multi: multi, // Exposed for dynamic toggling
        options: { serialize: false },

        draw: function (ctx, node, widgetWidth, y, widgetHeight) {
            this.last_y = y;
            this._lastWidth = widgetWidth; // Store for hit testing sync
            const contentHeight = getContentHeight(widgetWidth);
            const viewHeight = getWidgetHeight(widgetWidth);

            // Draw Background (for scroll area)
            // ctx.fillStyle = "#111";
            // ctx.fillRect(0, y, widgetWidth, viewHeight);

            ctx.save();
            try {
                // Clipping Region for Scroll
                ctx.beginPath();
                ctx.rect(0, y, widgetWidth, viewHeight);
                ctx.clip();

                const { numCols, cellWidth } = getLayout(widgetWidth);

                // LATCH layout for hit-testing sync
                this._latchedLayout = {
                    numCols,
                    cellWidth,
                    widgetWidth,
                    padding,
                    cellHeight,
                    scrollY
                };

                // Ensure value is array
                if (!this.value || !Array.isArray(this.value)) this.value = [];

                items.forEach((item, index) => {
                    const col = index % numCols;
                    const row = Math.floor(index / numCols);

                    const cellX = padding + (col * cellWidth);
                    const absY = row * cellHeight; // Y relative to top of content
                    const cellY = y + absY - scrollY;  // Y relative to screen (with scroll)

                    // Skip if out of view (Optimization)
                    if (cellY + cellHeight < y || cellY > y + viewHeight) return;

                    const centerX = cellX + (cellWidth / 2);
                    const centerY = cellY + (cellHeight / 2);

                    const isActive = this.value.includes(String(item.id)); // Force string compare

                    // Draw Selection Highlight (Green Glowing Rect)
                    if (isActive) {
                        ctx.save();
                        try {
                            ctx.shadowColor = "#00ff00";
                            ctx.shadowBlur = 15;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                            ctx.strokeStyle = "#00ff00";
                            ctx.lineWidth = 3;

                            ctx.beginPath();
                            if (ctx.roundRect) {
                                ctx.roundRect(centerX - (cellWidth / 2) + 4, centerY - (cellHeight / 2) + 4, cellWidth - 8, cellHeight - 8, 8);
                            } else {
                                ctx.rect(centerX - (cellWidth / 2) + 4, centerY - (cellHeight / 2) + 4, cellWidth - 8, cellHeight - 8);
                            }
                            ctx.stroke();
                        } finally {
                            ctx.restore();
                        }
                    }

                    // Draw Icon/Image
                    if (item.image) {
                        if (!item._imgObj) {
                            item._imgObj = new Image();
                            item._imgObj.src = item.image + "?v=" + new Date().getTime();
                            item._imgObj.onload = () => node.setDirtyCanvas(true, true);
                            item._imgObj.onerror = () => { item._imgError = true; };
                        }

                        if (item._imgError) {
                            // Fallback to "Color Chip" style if image fails
                            const label = item.tooltip || item.id;

                            // Deterministic Background Color from Hash
                            const getHashColor = (str) => {
                                let hash = 0;
                                for (let i = 0; i < str.length; i++) {
                                    hash = str.charCodeAt(i) + ((hash << 5) - hash);
                                }
                                const h = Math.abs(hash) % 360;
                                return `hsl(${h}, 40%, 35%)`; // Muted premium tones
                            };

                            ctx.save();
                            try {
                                ctx.fillStyle = getHashColor(label);
                                ctx.beginPath();
                                if (ctx.roundRect) {
                                    ctx.roundRect(centerX - (iconSize / 2), centerY - (iconSize / 2), iconSize, iconSize, 8);
                                } else {
                                    ctx.rect(centerX - (iconSize / 2), centerY - (iconSize / 2), iconSize, iconSize);
                                }
                                ctx.fill();

                                ctx.fillStyle = "#fff";
                                ctx.font = "bold 11px Arial";
                                ctx.textAlign = "center";
                                ctx.textBaseline = "middle";
                                // Truncate to fit
                                const safeLabel = label.length > 12 ? label.substring(0, 10) + "..." : label;
                                ctx.fillText(safeLabel, centerX, centerY);
                            } finally {
                                ctx.restore();
                            }
                        } else if (item._imgObj.complete && item._imgObj.naturalWidth > 0) {
                            ctx.drawImage(item._imgObj, centerX - (iconSize / 2), centerY - (iconSize / 2), iconSize, iconSize);
                        }
                    } else {
                        // Fallback (e.g. for user styles if ID-only)
                        const label = item.id || "❓";
                        ctx.fillStyle = "#222";
                        ctx.fillRect(centerX - (iconSize / 2), centerY - (iconSize / 2), iconSize, iconSize);
                        ctx.fillStyle = "#ccc";
                        ctx.font = "12px Arial";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(label, centerX, centerY);
                    }
                });


                // Draw Scrollbar if needed
                if (maxHeight > 0 && contentHeight > viewHeight) {
                    const scrollBarWidth = 8; // Slightly Wider for easier hitting
                    const scrollX = widgetWidth - scrollBarWidth - 2;

                    const ratio = viewHeight / contentHeight;
                    const barHeight = Math.max(20, viewHeight * ratio); // Min height 20px
                    const barY = y + (scrollY * ratio);

                    // Track
                    ctx.fillStyle = "#222";
                    ctx.fillRect(scrollX, y, scrollBarWidth, viewHeight);

                    // Handle
                    ctx.fillStyle = (isDraggingScrollbar) ? "#ccc" : (this.hoveringScrollbar ? "#aaa" : "#666");
                    ctx.fillRect(scrollX, barY, scrollBarWidth, barHeight);
                }

            } catch (e) {
                console.error("Grid Draw Error", e);
            } finally {
                ctx.restore();
            }

            // Draw Tooltip (Overlay) - OUTSIDE CLIP
            if (this.hoveredItem) {
                const ctxTip = ctx;
                const text = this.hoveredItem.tooltip || this.hoveredItem.id;

                ctxTip.save();
                ctxTip.font = "12px Arial";
                const textWidth = ctxTip.measureText(text).width;
                const tipW = textWidth + 20;
                const tipH = 26;

                const tipX = Math.min(this.mouseX + 10, widgetWidth - tipW - 5);
                const tipY = this.mouseY - 30;

                ctxTip.fillStyle = "rgba(0,0,0,0.95)";
                ctxTip.strokeStyle = "#555";
                ctxTip.lineWidth = 1;
                if (ctxTip.roundRect) {
                    ctxTip.beginPath();
                    ctxTip.roundRect(tipX, tipY, tipW, tipH, 4);
                    ctxTip.fill();
                    ctxTip.stroke();
                } else {
                    ctxTip.fillRect(tipX, tipY, tipW, tipH);
                }

                ctxTip.fillStyle = "#fff";
                ctxTip.textAlign = "left";
                ctxTip.textBaseline = "middle";
                ctxTip.fillText(text, tipX + 10, tipY + (tipH / 2));
                ctxTip.restore();
            }
        },

        mouse: function (event, pos, node) {
            // Use latched layout if available for perfect sync with visuals
            const layout = this._latchedLayout || {
                numCols: Math.round(columns),
                cellWidth: (node.size[0] - 20 - (padding * 2)) / Math.round(columns),
                widgetWidth: node.size[0] - 20,
                padding: padding,
                cellHeight: cellHeight,
                scrollY: scrollY
            };

            const widgetWidth = layout.widgetWidth;
            const viewHeight = getWidgetHeight(widgetWidth);
            const contentHeight = getContentHeight(widgetWidth);

            // Relaxed bounds: as long as we are below the start of the widget, allow hit-testing
            // Hit testing is mostly handled by the index check below.
            if (!isDraggingScrollbar && (pos[1] < this.last_y - 10)) {
                if (this.hoveredItem) {
                    this.hoveredItem = null;
                    node.setDirtyCanvas(true, true);
                }
                return false;
            }

            // Detect Mouse Wheel for Scroll
            if (event.type === "wheel" && maxHeight > 0 && contentHeight > viewHeight) {
                const delta = event.deltaY;
                scrollY += delta;
                scrollY = Math.max(0, Math.min(scrollY, contentHeight - viewHeight));
                node.setDirtyCanvas(true, true);
                return true; // Consume wheel
            }

            const scrollBarWidth = 12; // Hit area wider than visual bar
            const isOverScrollBar = maxHeight > 0 && contentHeight > viewHeight && pos[0] > (widgetWidth - scrollBarWidth - 5);

            if (event.type === "mousemove") {
                this.mouseX = pos[0];
                this.mouseY = pos[1];
                this.hoveringScrollbar = isOverScrollBar;

                if (isDraggingScrollbar) {
                    const deltaY = pos[1] - dragStartMouseY;
                    const contentToViewRatio = contentHeight / viewHeight;

                    scrollY = dragStartScrollY + (deltaY * contentToViewRatio);
                    scrollY = Math.max(0, Math.min(scrollY, contentHeight - viewHeight));
                    node.setDirtyCanvas(true, true);
                    return true;
                }

                const relX = pos[0];
                const relY = pos[1] - this.last_y + scrollY;

                const { numCols, cellWidth, padding: pad, cellHeight, scrollY: scrollVal } = layout; // Avoid name clash
                // Math.floor + clamping + epsilon offset
                const col = Math.max(0, Math.min(numCols - 1, Math.floor((relX - pad - 0.2) / cellWidth)));
                const row = Math.floor(relY / cellHeight);
                const index = Math.floor((row * numCols) + col);

                const oldHover = this.hoveredItem;
                if (!isOverScrollBar && index >= 0 && index < items.length && relX >= padding && relX <= widgetWidth - padding) {
                    this.hoveredItem = items[index];
                } else {
                    this.hoveredItem = null;
                }

                if (this.hoveredItem !== oldHover || this.hoveredItem || isOverScrollBar) {
                    node.setDirtyCanvas(true, true);
                }
                return isOverScrollBar; // Block node drag if hovering scrollbar area
            }

            if (event.type === "mousedown" || event.type === "pointerdown") {
                if (isOverScrollBar) {
                    isDraggingScrollbar = true;
                    dragStartMouseY = pos[1];
                    dragStartScrollY = scrollY;
                    node.setDirtyCanvas(true, true);
                    return true; // CAPTURE
                }

                const relX = pos[0];
                const relY = pos[1] - this.last_y + scrollY; // Account for scroll

                // Padding Check
                if (relX < padding || relX > widgetWidth - padding) return false;

                const { numCols, cellWidth, padding: pad, cellHeight, scrollY: scrollVal } = layout;

                // Math.floor + clamping + epsilon offset
                const col = Math.max(0, Math.min(numCols - 1, Math.floor((relX - pad - 0.2) / cellWidth)));
                const row = Math.floor(relY / cellHeight);
                const index = Math.floor((row * numCols) + col);

                if (index >= 0 && index < items.length) {
                    const item = items[index];
                    const idStr = String(item.id);

                    // Toggle Value
                    const valIndex = this.value.indexOf(idStr);
                    if (valIndex === -1) {
                        if (this.multi) {
                            this.value.push(idStr);
                        } else {
                            this.value = [idStr];
                        }
                    } else {
                        if (this.multi) {
                            this.value.splice(valIndex, 1);
                        }
                        // Note: In single mode, we allow deselecting for now.
                    }

                    // Callback
                    if (this.callback) this.callback(this.value);

                    node.setDirtyCanvas(true, true);
                    return true; // CAPTURED
                }
            }

            if (event.type === "mouseup" || event.type === "pointerup") {
                if (isDraggingScrollbar) {
                    isDraggingScrollbar = false;
                    node.setDirtyCanvas(true, true);
                    return true;
                }
            }
            return false;
        },

        computeSize: function (width) {
            return [width, getWidgetHeight(width)];
        }
    };
}
