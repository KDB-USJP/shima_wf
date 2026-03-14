import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "Shima.SEGSelector",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.SEGSelector") {

            // When the node is created
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                this.previewImg = null;
                this.previewLoaded = false;
                this.segs = []; // Array of seg objects parsed from backend JSON

                // Create minimal spacing to ensure Canvas has room
                this.size[1] = Math.max(this.size[1], 400);
                this.size[0] = Math.max(this.size[0], 400);

                // Hide the raw string input for selected indices
                setTimeout(() => {
                    for (let w of this.widgets) {
                        if (w.name === "selected_indices") {
                            w.computeSize = () => [0, -4];
                            w.hidden = true;
                        }
                    }
                    this.setDirtyCanvas(true, true);
                }, 100);

                // Select/Deselect All buttons
                this.addWidget("button", "✅ Select All", "selectAll", () => {
                    this.segs.forEach(s => s.selected = true);
                    this.syncWidgets();
                    this.setDirtyCanvas(true, true);
                });
                this.addWidget("button", "❌ Deselect All", "deselectAll", () => {
                    this.segs.forEach(s => s.selected = false);
                    this.syncWidgets();
                    this.setDirtyCanvas(true, true);
                });
            };

            // Catch the UI payload returned by the Python node Execution
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                if (onExecuted) onExecuted.apply(this, arguments);

                // Load parsed SEG data and Image directly from our payload to avoid ComfyUI's native ImageWidget interceptor
                if (message && message.seg_data && message.seg_data.length > 0) {
                    try {
                        const data = JSON.parse(message.seg_data[0]);
                        this.segs = data.segs || [];

                        if (data.filename) {
                            const url = api.apiURL(`/view?filename=${encodeURIComponent(data.filename)}&type=temp`);
                            const img = new Image();
                            img.onload = () => {
                                this.previewImg = img;
                                this.previewLoaded = true;

                                // Automatically resize the node to fit the image aesthetically
                                const targetW = Math.max(this.size[0], 400);
                                const headerOffset = 100 + (this.widgets ? this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT : 0);
                                const imgRatio = img.height / img.width;
                                const targetH = (targetW * imgRatio) + headerOffset;

                                this.setSize([targetW, targetH]);
                                this.setDirtyCanvas(true, true);
                            };
                            img.src = url;
                        } else {
                            this.setDirtyCanvas(true, true);
                        }
                    } catch (e) {
                        console.error("Shima.SEGSelector failed to parse seg_data", e);
                        this.segs = [];
                        this.setDirtyCanvas(true, true);
                    }
                }
            };

            // Write the local Array state back to the hidden Comfy Widget
            nodeType.prototype.syncWidgets = function () {
                const widget = this.widgets.find(w => w.name === "selected_indices");
                const fallbackWidget = this.widgets.find(w => w.name === "fallback_behavior");

                if (widget) {
                    const selectedIds = this.segs.filter(s => s.selected).map(s => s.id);

                    // If everything is selected, and fallback behavior is "Output All", we can cleanly use "all"
                    const fallbackAll = fallbackWidget && fallbackWidget.value === "Output All";
                    if (selectedIds.length === this.segs.length && fallbackAll) {
                        widget.value = "all";
                    } else {
                        widget.value = selectedIds.join(",");
                    }
                }
            };

            // --- CANVAS DRAWING (LITEGRAPH FOREGROUND) ---
            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function (ctx) {
                if (onDrawForeground) onDrawForeground.apply(this, arguments);
                if (this.flags.collapsed) return;

                // If image isn't loaded, text fallback
                if (!this.previewLoaded || !this.previewImg) {
                    ctx.fillStyle = "#666";
                    ctx.font = "14px Arial";
                    ctx.textAlign = "center";
                    ctx.fillText("Waiting for execution...", this.size[0] / 2, this.size[1] / 2);
                    return;
                }

                // Calculate drawing area bounds (Below widgets)
                let headerOffset = 100; // Approximating space for standard native widgets
                if (this.widgets) {
                    headerOffset = 30 + (this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT);
                }

                const drawArea = {
                    x: 10,
                    y: headerOffset,
                    w: this.size[0] - 20,
                    h: this.size[1] - headerOffset - 10
                };

                if (drawArea.h < 50) return; // Too small

                // Aspect Ratio Fit (Object-fit: contain)
                const imgRatio = this.previewImg.width / this.previewImg.height;
                const areaRatio = drawArea.w / drawArea.h;

                let renderX, renderY, renderW, renderH;
                if (imgRatio > areaRatio) {
                    renderW = drawArea.w;
                    renderH = drawArea.w / imgRatio;
                    renderX = drawArea.x;
                    renderY = drawArea.y + (drawArea.h - renderH) / 2;
                } else {
                    renderH = drawArea.h;
                    renderW = drawArea.h * imgRatio;
                    renderY = drawArea.y;
                    renderX = drawArea.x + (drawArea.w - renderW) / 2;
                }

                // Save physical render matrix for Mouse Hit testing
                this.renderMatrix = { rx: renderX, ry: renderY, rw: renderW, rh: renderH };

                // 1. Draw Image
                ctx.drawImage(this.previewImg, renderX, renderY, renderW, renderH);

                // 2. Draw Dark Overlay (dimming ignored elements)
                ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
                ctx.fillRect(renderX, renderY, renderW, renderH);

                // 3. Draw Bounding Boxes
                if (this.segs && this.segs.length > 0) {
                    ctx.save();
                    for (let seg of this.segs) {
                        // Impact Pack bbox is [x1, y1, x2, y2]
                        const [px1, py1, px2, py2] = seg.bbox;

                        // Map original image coord space to render space
                        const boxX = renderX + (px1 / this.previewImg.width * renderW);
                        const boxY = renderY + (py1 / this.previewImg.height * renderH);
                        const boxW = ((px2 - px1) / this.previewImg.width) * renderW;
                        const boxH = ((py2 - py1) / this.previewImg.height) * renderH;

                        // Cache mapped metrics for click detection
                        seg._renderBox = { x: boxX, y: boxY, w: boxW, h: boxH };

                        if (seg.selected) {
                            // "Punch out" the dark overlay so the image is fully bright inside the box
                            ctx.save();
                            ctx.globalCompositeOperation = "destination-out";
                            ctx.fillStyle = "rgba(0,0,0,1)";
                            ctx.fillRect(boxX, boxY, boxW, boxH);
                            ctx.restore();

                            // Re-draw the bright image slice exactly within the punch-out hole
                            const sW = px2 - px1;
                            const sH = py2 - py1;
                            ctx.drawImage(this.previewImg, px1, py1, sW, sH, boxX, boxY, boxW, boxH);

                            // Glowing Cyan Selection Border
                            ctx.save();
                            ctx.shadowColor = "rgba(0, 255, 255, 0.8)";
                            ctx.shadowBlur = 10;
                            ctx.strokeStyle = "#00ffff";
                            ctx.lineWidth = 2;
                            ctx.strokeRect(boxX, boxY, boxW, boxH);
                            ctx.restore(); // reset

                            // Draw ID/Label Badge (Active)
                            ctx.save();
                            ctx.fillStyle = "#00ffff";
                            ctx.fillRect(boxX, Math.max(renderY, boxY - 20), Math.max(ctx.measureText(seg.label).width + 10 + 20, 60), 20);
                            ctx.fillStyle = "#000000";
                            ctx.font = "12px Arial";
                            ctx.textAlign = "left";
                            ctx.fillText(`[${seg.id}] ${seg.label}`, boxX + 5, Math.max(renderY, boxY - 20) + 14);
                            ctx.restore();

                        } else {
                            // Dimmed Red Ignored Border
                            ctx.save();
                            ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
                            ctx.lineWidth = 1;
                            ctx.strokeRect(boxX, boxY, boxW, boxH);
                            ctx.restore();

                            // Draw ID Badge (Ignored)
                            ctx.save();
                            ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
                            ctx.fillRect(boxX, Math.max(renderY, boxY - 20), Math.max(ctx.measureText(`[${seg.id}]`).width + 10, 30), 20);
                            ctx.fillStyle = "#ffffff";
                            ctx.font = "10px Arial";
                            ctx.textAlign = "left";
                            ctx.fillText(`[${seg.id}]`, boxX + 5, Math.max(renderY, boxY - 20) + 14);
                            ctx.restore();
                        }
                    }
                    ctx.restore();
                } else if (this.previewLoaded && this.previewImg) {
                    ctx.save();
                    ctx.fillStyle = "rgba(255, 0, 0, 0.7)";
                    ctx.fillRect(renderX, renderY + renderH / 2 - 30, renderW, 60);
                    ctx.fillStyle = "white";
                    ctx.font = "bold 20px Arial";
                    ctx.textAlign = "center";
                    ctx.fillText("NO SEGMENTS DETECTED", renderX + renderW / 2, renderY + renderH / 2 + 7);
                    ctx.restore();
                }
            };

            // --- MOUSE INTERACTION SYSTEM ---
            nodeType.prototype.onMouseDown = function (e, pos, canvas) {
                if (!this.renderMatrix || !this.previewLoaded || !this.segs) return false;

                const mx = pos[0];
                const my = pos[1];
                const { rx, ry, rw, rh } = this.renderMatrix;

                // Is mouse within image bounds?
                if (mx < rx || mx > rx + rw || my < ry || my > ry + rh) return false;

                // Detect click order: we'll toggle the *first* bounding box we hit.
                // Or maybe the smallest one/one on top. Reversing the array helps click "topmost" if drawn iteratively
                for (let i = this.segs.length - 1; i >= 0; i--) {
                    const seg = this.segs[i];
                    if (!seg._renderBox) continue;

                    const { x, y, w, h } = seg._renderBox;
                    if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
                        seg.selected = !seg.selected;
                        this.syncWidgets();
                        this.setDirtyCanvas(true, true);
                        return true; // Click handled
                    }
                }

                return false;
            };
        }
    }
});
