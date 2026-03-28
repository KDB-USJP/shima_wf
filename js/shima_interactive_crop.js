import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Utility to extract ratio from standard string presets
function getTargetRatio(str, customRatio, orientation = "landscape") {
    if (str === "1:1 Square" || str === "IP-Adapter (224x224)") return 1.0;

    let baseRatio = 1.0;
    if (str === "16:9 Widescreen") baseRatio = 16 / 9;
    else if (str === "4:3 Standard") baseRatio = 4 / 3;
    else if (str === "21:9 Ultrawide") baseRatio = 21 / 9;
    else if (str === "3:2 Photo") baseRatio = 3 / 2;
    else if (str === "Custom" && customRatio != null) return customRatio;
    else return null; // Free or missing

    if (orientation === "portrait" && baseRatio > 1.0) {
        baseRatio = 1.0 / baseRatio;
    } else if (orientation === "landscape" && baseRatio < 1.0) {
        baseRatio = 1.0 / baseRatio;
    }

    return baseRatio;
}

app.registerExtension({
    name: "Shima.InteractiveCrop",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.BoundingBoxPicker") {

            // When the node is created
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                this.customRatio = null;
                this.previewImg = null;
                this.previewLoaded = false;
                this._lastImagePath = null;

                // Crop State (Normalized 0.0 - 1.0)
                this.cropRect = { x: 0, y: 0, w: 1, h: 1 };

                // UI Interaction State
                this.dragState = null; // 'move', 'nw', 'ne', 'sw', 'se'
                this.dragOrigin = { x: 0, y: 0 };
                this.dragStartRect = null;

                // Create minimal spacing to ensure Canvas has room
                this.size[1] = Math.max(this.size[1], 400);
                this.size[0] = Math.max(this.size[0], 400);

                // Wait for comfy to populate widgets, then hide raw crop maths
                setTimeout(() => {
                    const hideWidgets = ["crop_x", "crop_y", "crop_w", "crop_h"];
                    for (let w of this.widgets) {
                        if (hideWidgets.includes(w.name)) {
                            // Sneaky way to hide widgets in LiteGraph without breaking Comfy serialization
                            w.type = "hidden";
                            w.computeSize = () => [0, -4];
                            w.hidden = true;

                            // Initialize local cropRect with widget values
                            if (w.name === "crop_x") this.cropRect.x = w.value;
                            if (w.name === "crop_y") this.cropRect.y = w.value;
                            if (w.name === "crop_w") this.cropRect.w = w.value;
                            if (w.name === "crop_h") this.cropRect.h = w.value;
                        }
                    }

                    const arWidget = this.widgets.find(w => w.name === "aspect_ratio");
                    const oriWidget = this.widgets.find(w => w.name === "orientation");

                    const updateCallback = () => {
                        const arVal = arWidget ? arWidget.value : "Free";
                        const oriVal = oriWidget ? oriWidget.value : "landscape";
                        const r = getTargetRatio(arVal, this.customRatio, oriVal);
                        this.resetCropBox(r);
                    };

                    if (arWidget) arWidget.callback = updateCallback;
                    if (oriWidget) oriWidget.callback = updateCallback;

                    this.setDirtyCanvas(true, true);
                }, 100);

                // Add button for CommonParams syncing and resetting
                this.addWidget("button", "🔄 Sync from CommonParams", "sync", () => {
                    this.syncFromCommonParams();
                });
                this.addWidget("button", "📥 Import from Link", "import", () => {
                    this.importFromLink();
                });
                this.addWidget("button", "🔳 Reset bounds to preset", "reset", () => {
                    const arWidget = this.widgets.find(w => w.name === "aspect_ratio");
                    const oriWidget = this.widgets.find(w => w.name === "orientation");
                    const r = arWidget ? getTargetRatio(arWidget.value, this.customRatio, oriWidget ? oriWidget.value : "landscape") : null;
                    this.resetCropBox(r);
                });
            };

            // Capture the original onExecuted
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                if (onExecuted) onExecuted.apply(this, arguments);

                if (message && message.source_image && message.source_image.length > 0) {
                    const imgData = message.source_image[0];
                    const filename = imgData.filename;

                    // Update widget
                    const imgWidget = this.widgets.find(w => w.name === "image_path");
                    if (imgWidget) {
                        imgWidget.value = filename;
                    }

                    // Update preview
                    this.loadImage(filename);
                    console.log(`[Shima] Interactive Crop auto-synced source image: ${filename}`);
                }
            };

            // Trace link to source node and pull image selection
            nodeType.prototype.importFromLink = function () {
                const graph = this.graph;
                if (!graph) return;

                const linkId = this.inputs.find(i => i.name === "image")?.link;
                if (!linkId) {
                    alert("No image is currently connected to the input.");
                    return;
                }

                const link = graph.links[linkId];
                if (!link) return;

                const sourceNode = graph.getNodeById(link.origin_id);
                if (!sourceNode) return;

                // Try to find an image-holding widget in the source node
                // Common names: "image", "image_path", "filename"
                const imgWidget = sourceNode.widgets?.find(w =>
                    w.name === "image" ||
                    w.name === "image_path" ||
                    w.name === "filename" ||
                    (w.type === "combo" && (w.name.includes("image") || w.name.includes("filename")))
                );

                if (imgWidget && imgWidget.value) {
                    const filename = imgWidget.value;
                    const myImgWidget = this.widgets.find(w => w.name === "image_path");
                    if (myImgWidget) {
                        myImgWidget.value = filename;
                        this.loadImage(filename);
                        this.setDirtyCanvas(true, true);
                        console.log(`[Shima] Imported image from ${sourceNode.title || sourceNode.type}: ${filename}`);
                    }
                } else {
                    alert(`Could not find a compatible image widget on the source node (${sourceNode.title || sourceNode.type}).`);
                }
            };

            // Maximize Crop Box to Target Ratio
            nodeType.prototype.resetCropBox = function (targetRatio) {
                if (!this.previewImg) {
                    this.cropRect = { x: 0, y: 0, w: 1, h: 1 };
                    this.syncWidgets();
                    return;
                }

                if (!targetRatio) {
                    // Freeform
                    this.cropRect = { x: 0, y: 0, w: 1, h: 1 };
                } else {
                    const imgRatio = this.previewImg.width / this.previewImg.height;
                    if (imgRatio > targetRatio) {
                        // Image is relatively wider. Maximize height.
                        this.cropRect.h = 1.0;
                        this.cropRect.w = (this.previewImg.height * targetRatio) / this.previewImg.width;
                        this.cropRect.y = 0;
                        this.cropRect.x = (1.0 - this.cropRect.w) / 2;
                    } else {
                        // Image is relatively taller. Maximize width.
                        this.cropRect.w = 1.0;
                        this.cropRect.h = this.previewImg.width / (this.previewImg.height * targetRatio);
                        this.cropRect.x = 0;
                        this.cropRect.y = (1.0 - this.cropRect.h) / 2;
                    }
                }
                this.syncWidgets();
                this.setDirtyCanvas(true, true);
            };

            // Read CommonParams Input Node & Pull Math Ratio
            nodeType.prototype.syncFromCommonParams = function () {
                let sourceNode = null;
                const graph = this.graph;
                if (!graph) return;
                const linkId = this.inputs.find(i => i.name === "shima.commonparams")?.link;
                if (linkId) {
                    const link = graph.links[linkId];
                    if (link) sourceNode = graph.getNodeById(link.origin_id);
                } else {
                    // Fallback to find active Shima.Commons via "Use Everywhere" implicit virtual links
                    sourceNode = graph._nodes.find(n => n.comfyClass === "Shima.Commons");
                }

                if (!sourceNode) {
                    alert("No CommonParams bundle is explicitly connected, and a generic Shima.Commons override was not found.");
                    return;
                }

                let targetRatio = null;

                // Probe internal widgets
                const wWidget = sourceNode.widgets?.find(wid => wid.name === "width" || wid.name.includes("width"));
                const hWidget = sourceNode.widgets?.find(wid => wid.name === "height" || wid.name.includes("height"));
                const arWidget = sourceNode.widgets?.find(wid => wid.name === "aspect_ratio");
                const oriWidget = sourceNode.widgets?.find(wid => wid.name === "orientation");

                // If it's the Shima.Commons node, we calculate the ratio from aspect_ratio and orientation
                if (sourceNode.comfyClass === "Shima.Commons") {
                    const ar = arWidget ? arWidget.value : "1:1 Square";
                    const ori = oriWidget ? oriWidget.value : "landscape";

                    if (ar === "Custom") {
                        if (wWidget && hWidget) {
                            const w = parseFloat(wWidget.value);
                            const h = parseFloat(hWidget.value);
                            if (w > 0 && h > 0) targetRatio = w / h;
                        }
                    } else {
                        // Replicate Python literal math
                        const ratios = {
                            "1:1 Square": 1.0, "16:9 Widescreen": 16 / 9, "4:3 Standard": 4 / 3, "21:9 Ultrawide": 21 / 9, "3:2 Photo": 3 / 2
                        };
                        let baseRatio = ratios[ar] || 1.0;

                        if (ori === "portrait" && baseRatio > 1.0) {
                            baseRatio = 1.0 / baseRatio;
                        } else if (ori === "landscape" && baseRatio < 1.0) {
                            baseRatio = 1.0 / baseRatio;
                        }
                        targetRatio = baseRatio;
                    }
                } else {
                    // Fallback to literal width/height inputs if it's some other generic node
                    if (wWidget && hWidget) {
                        const w = parseFloat(wWidget.value);
                        const h = parseFloat(hWidget.value);
                        if (w > 0 && h > 0) targetRatio = w / h;
                    }
                }

                if (targetRatio > 0) {
                    this.customRatio = targetRatio;
                    const cropArWidget = this.widgets.find(wid => wid.name === "aspect_ratio");
                    if (cropArWidget) {
                        // Guarantee Custom is an option
                        if (!cropArWidget.options.values.includes("Custom")) cropArWidget.options.values.push("Custom");
                        cropArWidget.value = "Custom";
                    }

                    // Box should reset and snap to the new exact constraints
                    this.resetCropBox(this.customRatio);
                } else {
                    alert("CommonParams source has invalid dimensions. Could not ascertain aspect ratio.");
                }
            };

            // Image Loader
            nodeType.prototype.loadImage = function (filename) {
                if (filename && filename !== "none") {
                    const img = new Image();
                    img.onload = () => {
                        this.previewImg = img;
                        this.previewLoaded = true;
                        this.setDirtyCanvas(true, true);
                    };
                    img.src = api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=input`);
                } else {
                    this.previewImg = null;
                    this.previewLoaded = false;
                }
            };

            // Handle widget synchronization
            nodeType.prototype.syncWidgets = function () {
                // Bounds enforcement
                this.cropRect.x = Math.max(0, Math.min(this.cropRect.x, 1.0));
                this.cropRect.y = Math.max(0, Math.min(this.cropRect.y, 1.0));
                this.cropRect.w = Math.max(0.01, Math.min(this.cropRect.w, 1.0 - this.cropRect.x));
                this.cropRect.h = Math.max(0.01, Math.min(this.cropRect.h, 1.0 - this.cropRect.y));

                for (let w of this.widgets) {
                    if (w.name === "crop_x") w.value = this.cropRect.x;
                    if (w.name === "crop_y") w.value = this.cropRect.y;
                    if (w.name === "crop_w") w.value = this.cropRect.w;
                    if (w.name === "crop_h") w.value = this.cropRect.h;
                }
            };

            // Enforce aspect ratio strictly against the box's center
            nodeType.prototype.enforceRatio = function (targetRatio) {
                if (!targetRatio || !this.previewImg) return;

                // Current pixel dimensions of the crop box mapped to original image proportions
                // Instead of messy physical logic, we calculate mathematical ratio in image space
                const imgW = this.previewImg.width;
                const imgH = this.previewImg.height;

                let boxPxW = this.cropRect.w * imgW;
                let boxPxH = this.cropRect.h * imgH;

                const currentRatio = boxPxW / boxPxH;

                if (Math.abs(currentRatio - targetRatio) > 0.001) {
                    let newBoxPxW = boxPxW;
                    let newBoxPxH = boxPxH;

                    if (currentRatio > targetRatio) {
                        // Box is too wide, shrink width
                        newBoxPxW = newBoxPxH * targetRatio;
                    } else {
                        // Box is too tall, shrink height
                        newBoxPxH = newBoxPxW / targetRatio;
                    }

                    // Recenter
                    const cx = this.cropRect.x + this.cropRect.w / 2;
                    const cy = this.cropRect.y + this.cropRect.h / 2;

                    this.cropRect.w = newBoxPxW / imgW;
                    this.cropRect.h = newBoxPxH / imgH;
                    this.cropRect.x = cx - this.cropRect.w / 2;
                    this.cropRect.y = cy - this.cropRect.h / 2;
                }
            };

            // --- CANVAS DRAWING (LITEGRAPH FOREGROUND) ---
            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function (ctx) {
                if (onDrawForeground) onDrawForeground.apply(this, arguments);

                if (this.flags.collapsed) return;

                // Track Image widget
                const imgWidget = this.widgets.find(w => w.name === "image_path");
                if (imgWidget && imgWidget.value !== this._lastImagePath) {
                    this._lastImagePath = imgWidget.value;
                    this.loadImage(imgWidget.value);
                }

                // If image isn't loaded, don't draw canvas
                if (!this.previewLoaded || !this.previewImg) return;

                // Calculate drawing area bounds (Below widgets)
                let headerOffset = 150; // Approximating space for standard native widgets
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
                    // Fit horizontal
                    renderW = drawArea.w;
                    renderH = drawArea.w / imgRatio;
                    renderX = drawArea.x;
                    renderY = drawArea.y + (drawArea.h - renderH) / 2;
                } else {
                    // Fit vertical
                    renderH = drawArea.h;
                    renderW = drawArea.h * imgRatio;
                    renderY = drawArea.y;
                    renderX = drawArea.x + (drawArea.w - renderW) / 2;
                }

                // Save physical render matrix for Mouse Hit testing
                this.renderMatrix = { rx: renderX, ry: renderY, rw: renderW, rh: renderH };

                // 1. Draw Image
                ctx.drawImage(this.previewImg, renderX, renderY, renderW, renderH);

                // 2. Map Normalized Crop Rect to Physical Canvas Coords
                const boxX = renderX + (this.cropRect.x * renderW);
                const boxY = renderY + (this.cropRect.y * renderH);
                const boxW = this.cropRect.w * renderW;
                const boxH = this.cropRect.h * renderH;

                // 3. Draw Darkened Overlay manually around the box
                ctx.fillStyle = "rgba(0,0,0,0.6)";
                ctx.fillRect(renderX, renderY, renderW, boxY - renderY); // Top
                ctx.fillRect(renderX, boxY + boxH, renderW, (renderY + renderH) - (boxY + boxH)); // Bottom
                ctx.fillRect(renderX, boxY, boxX - renderX, boxH); // Left
                ctx.fillRect(boxX + boxW, boxY, (renderX + renderW) - (boxX + boxW), boxH); // Right

                // 4. Draw Crop Border
                ctx.strokeStyle = "#4a9eff"; // Shima blue
                ctx.lineWidth = 2;
                ctx.strokeRect(boxX, boxY, boxW, boxH);

                // 5. Draw Handles (Corners + Edges + Center)
                ctx.fillStyle = "#ffffff";
                const hs = 8; // handle size
                const drawHandle = (hx, hy) => ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);

                // Corners
                drawHandle(boxX, boxY); // NW
                drawHandle(boxX + boxW, boxY); // NE
                drawHandle(boxX, boxY + boxH); // SW
                drawHandle(boxX + boxW, boxY + boxH); // SE
            };

            // --- MOUSE INTERACTION SYSTEM ---

            nodeType.prototype.onMouseDown = function (e, pos, canvas) {
                if (!this.renderMatrix || !this.previewLoaded) return false;

                const mx = pos[0];
                const my = pos[1];
                const { rx, ry, rw, rh } = this.renderMatrix;

                // Is mouse within image bounds?
                if (mx < rx || mx > rx + rw || my < ry || my > ry + rh) return false;

                const boxX = rx + (this.cropRect.x * rw);
                const boxY = ry + (this.cropRect.y * rh);
                const boxW = this.cropRect.w * rw;
                const boxH = this.cropRect.h * rh;

                const hs = 10; // Hit detection padding

                // NW
                if (Math.abs(mx - boxX) < hs && Math.abs(my - boxY) < hs) this.dragState = "nw";
                else if (Math.abs(mx - (boxX + boxW)) < hs && Math.abs(my - boxY) < hs) this.dragState = "ne";
                else if (Math.abs(mx - boxX) < hs && Math.abs(my - (boxY + boxH)) < hs) this.dragState = "sw";
                else if (Math.abs(mx - (boxX + boxW)) < hs && Math.abs(my - (boxY + boxH)) < hs) this.dragState = "se";
                // Inside bounds (Move)
                else if (mx > boxX && mx < boxX + boxW && my > boxY && my < boxY + boxH) this.dragState = "move";

                if (this.dragState) {
                    this.dragOrigin = { x: mx, y: my };
                    this.dragStartRect = { ...this.cropRect };
                    app.canvas.canvas.style.cursor = "move";
                    return true; // We handled this click
                }
                return false;
            };

            nodeType.prototype.onMouseMove = function (e, pos, canvas) {
                if (!this.dragState || !this.renderMatrix || !this.dragStartRect) return false;

                const mx = pos[0];
                const my = pos[1];
                const { rx, ry, rw, rh } = this.renderMatrix;

                // Mouse delta mapped to normalized (0.0 -> 1.0)
                const dx = (mx - this.dragOrigin.x) / rw;
                const dy = (my - this.dragOrigin.y) / rh;

                // Get constraints
                const arWidget = this.widgets.find(w => w.name === "aspect_ratio");
                const oriWidget = this.widgets.find(w => w.name === "orientation");
                const targetRatio = arWidget ? getTargetRatio(arWidget.value, this.customRatio, oriWidget ? oriWidget.value : "landscape") : null;
                const realImgRatio = this.previewImg.width / this.previewImg.height;

                if (this.dragState === "move") {
                    let newX = this.dragStartRect.x + dx;
                    let newY = this.dragStartRect.y + dy;

                    // Hard bounding box checks - prevent over-dragging outside image space
                    newX = Math.max(0.0, Math.min(newX, 1.0 - this.cropRect.w));
                    newY = Math.max(0.0, Math.min(newY, 1.0 - this.cropRect.h));

                    this.cropRect.x = newX;
                    this.cropRect.y = newY;
                } else {
                    let newX = this.dragStartRect.x;
                    let newY = this.dragStartRect.y;
                    let newW = this.dragStartRect.w;
                    let newH = this.dragStartRect.h;

                    if (this.dragState.includes("w")) { newX += dx; newW -= dx; }
                    if (this.dragState.includes("e")) { newW += dx; }
                    if (this.dragState.includes("n")) { newY += dy; newH -= dy; }
                    if (this.dragState.includes("s")) { newH += dy; }

                    // Prevent crossover/collapse by enforcing minimum bounds manually
                    if (newW < 0.03) {
                        newW = 0.03;
                        if (this.dragState.includes("w")) newX = this.dragStartRect.x + this.dragStartRect.w - 0.03;
                    }
                    if (newH < 0.03) {
                        newH = 0.03;
                        if (this.dragState.includes("n")) newY = this.dragStartRect.y + this.dragStartRect.h - 0.03;
                    }

                    // Ratio enforcement logic during resize
                    if (targetRatio) {
                        // For corner drags with a locked ratio, we let Width control and solve for Height
                        // (Alternatively solving Width from Height—we'll use the dominant drag axis for smoothness)

                        if (this.dragState === "se" || this.dragState === "sw" || this.dragState === "ne" || this.dragState === "nw") {
                            // Calculate what height *should* be given the current dragged width
                            let targetH = (newW * this.previewImg.width) / (targetRatio * this.previewImg.height);

                            // Prevent ratio math from shrinking below minimums
                            if (targetH < 0.03) {
                                targetH = 0.03;
                                newW = (targetH * this.previewImg.height * targetRatio) / this.previewImg.width;
                                if (this.dragState.includes("w")) newX = this.dragStartRect.x + this.dragStartRect.w - newW;
                            }

                            newH = targetH;

                            // Anchor Top/Bottom dynamically
                            if (this.dragState.includes("n")) {
                                newY = (this.dragStartRect.y + this.dragStartRect.h) - newH;
                            }
                        }
                    }

                    // Prevent corner drag from forcing X/Y coordinates out-of-bounds (left and top)
                    newX = Math.max(0.0, newX);
                    newY = Math.max(0.0, newY);

                    // Prevent corner drag from forcing width/height out-of-bounds (right and bottom)
                    if (newX + newW > 1.0) newW = 1.0 - newX;
                    if (newY + newH > 1.0) newH = 1.0 - newY;

                    // If we bumped against a wall and ratio is locked, we must force the opposite dimension to comply
                    // to prevent aspect ratio distortion when hitting boundaries
                    if (targetRatio) {
                        const currentProposedRatio = (newW * this.previewImg.width) / (newH * this.previewImg.height);
                        if (Math.abs(currentProposedRatio - targetRatio) > 0.001) {
                            // Boundary ratio correction
                            if (currentProposedRatio > targetRatio) {
                                // Too wide -> squeeze width
                                newW = (newH * this.previewImg.height * targetRatio) / this.previewImg.width;
                                if (this.dragState.includes("w")) newX = (this.dragStartRect.x + this.dragStartRect.w) - newW;
                            } else {
                                // Too tall -> squeeze height
                                newH = (newW * this.previewImg.width) / (targetRatio * this.previewImg.height);
                                if (this.dragState.includes("n")) newY = (this.dragStartRect.y + this.dragStartRect.h) - newH;
                            }
                        }
                    }

                    this.cropRect.x = newX;
                    this.cropRect.y = newY;
                    this.cropRect.w = newW;
                    this.cropRect.h = newH;
                }

                // Bounds Guard
                this.syncWidgets();
                this.setDirtyCanvas(true, true);

                return true;
            };

            nodeType.prototype.onMouseUp = function (e, pos, canvas) {
                if (this.dragState) {
                    this.dragState = null;
                    app.canvas.canvas.style.cursor = "default";
                    this.syncWidgets(); // Sync final coordinates to hidden inputs
                    return true;
                }
                return false;
            };
        }
    }
});
