import { app } from "../../scripts/app.js";

// Helper to darken hex colors for gradients
function _darkenHexString(hexStr, amount) {
    if (!hexStr || !hexStr.startsWith("#")) return "#000000";
    let hex = hexStr.substring(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    r = Math.max(0, r - amount);
    g = Math.max(0, g - amount);
    b = Math.max(0, b - amount);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Global Font Loader registry
const LOADED_FONTS = new Set();
async function loadFont(fontName) {
    if (fontName === "default" || fontName === "sans-serif" || LOADED_FONTS.has(fontName)) return true;
    try {
        const fontUrl = `/shima/assets/fonts/${fontName}`;
        const face = new FontFace(fontName, `url(${fontUrl})`);
        await face.load();
        document.fonts.add(face);
        LOADED_FONTS.add(fontName);
        return true;
    } catch (e) {
        console.error(`[Shima Control Panel] Failed to load font: ${fontName}`, e);
        return false;
    }
}

// Initialize the global registry for pinned widgets
window.ShimaPinnedWidgets = window.ShimaPinnedWidgets || [];

function spawnHTMLDialog(titleText, initialValue, isNumber, isMultiline, isFileUpload, comboOptions, callback) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0"; overlay.style.left = "0"; overlay.style.width = "100vw"; overlay.style.height = "100vh";
    overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
    overlay.style.zIndex = 10000;
    overlay.style.display = "flex"; overlay.style.justifyContent = "center"; overlay.style.alignItems = "center";
    overlay.style.backdropFilter = "blur(2px)";

    const box = document.createElement("div");
    box.style.backgroundColor = "#222";
    box.style.border = "2px solid #444";
    box.style.borderRadius = "8px";
    box.style.padding = "20px";
    box.style.width = "400px";
    box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.8)";
    box.style.fontFamily = "sans-serif";

    const header = document.createElement("div");
    header.textContent = titleText;
    header.style.color = "#aaa"; header.style.marginBottom = "15px"; header.style.fontSize = "14px";
    box.appendChild(header);

    let input;
    if (isFileUpload) {
        input = document.createElement("input");
        input.type = "file";
        input.accept = "image/png,image/jpeg,image/webp,image/gif";
        // Also show a hint of the current value
        const currentLabel = document.createElement("div");
        currentLabel.textContent = "Current: " + initialValue;
        currentLabel.style.color = "#777"; currentLabel.style.fontSize = "11px"; currentLabel.style.marginBottom = "8px";
        box.appendChild(currentLabel);
    } else if (comboOptions && Array.isArray(comboOptions)) {
        input = document.createElement("select");
        input.style.cursor = "pointer";
        comboOptions.forEach(optVal => {
            const opt = document.createElement("option");
            opt.value = optVal;
            opt.text = optVal;
            if (optVal === initialValue) opt.selected = true;
            input.appendChild(opt);
        });
    } else if (isMultiline) {
        input = document.createElement("textarea");
        input.rows = 6;
        input.style.resize = "vertical";
    } else {
        input = document.createElement("input");
        input.type = isNumber ? "number" : "text";
        if (isNumber) input.step = "any";
    }
    input.value = isFileUpload ? "" : initialValue;
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.backgroundColor = "#111";
    input.style.color = "#fff";
    input.style.border = "1px solid #555";
    input.style.borderRadius = "4px";
    input.style.padding = "10px";
    input.style.fontSize = "14px";
    input.style.fontFamily = "monospace";
    box.appendChild(input);

    // Custom Font Selection Injection specifically for Rename
    let fontSelect = null;
    if (titleText === "Rename Control Panel") {
        fontSelect = document.createElement("select");
        fontSelect.style.width = "100%";
        fontSelect.style.marginTop = "10px";
        fontSelect.style.backgroundColor = "#111";
        fontSelect.style.color = "#fff";
        fontSelect.style.border = "1px solid #555";
        fontSelect.style.borderRadius = "4px";
        fontSelect.style.padding = "8px";
        box.appendChild(fontSelect);

        // Fetch fonts from API
        fetch('/shima/fonts')
            .then(res => res.json())
            .then(fonts => {
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "sans-serif";
                defaultOpt.text = "Default (sans-serif)";
                fontSelect.appendChild(defaultOpt);

                fonts.forEach(fontFile => {
                    const fontName = fontFile.replace(/\.[^/.]+$/, "").replace(/^\d-/, "");
                    const opt = document.createElement("option");
                    opt.value = fontFile;
                    opt.text = fontName;

                    // Because initialValue is just the string, we hackily store the font selection globally or pass it in a tuple
                    // To avoid refactoring all calls, we just pre-select based on a custom property injection
                    if (window.ShimaDialogInjectFont === fontFile || window.ShimaDialogInjectFont === fontName) {
                        opt.selected = true;
                    }

                    fontSelect.appendChild(opt);
                });
            })
            .catch(err => console.error("Failed to load Shima fonts", err));
    }

    input.onkeydown = function (ev) {
        if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            commitAndClose();
        }
    };

    const handleEsc = function (ev) {
        if (ev.key === "Escape") {
            ev.preventDefault();
            close();
        }
    };
    document.addEventListener("keydown", handleEsc);

    const footer = document.createElement("div");
    footer.textContent = "Press Enter to save, Shift+Enter for newline, Esc to cancel.";
    footer.style.color = "#777"; footer.style.fontSize = "11px"; footer.style.marginTop = "10px";
    box.appendChild(footer);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    input.select();
    input.focus();

    function commitAndClose() {
        if (isFileUpload && input.files.length > 0) {
            // Perform actual ComfyUI File Upload pipeline
            const file = input.files[0];
            const body = new FormData();
            body.append("image", file);
            body.append("subfolder", "");
            body.append("type", "input");

            // Standard ComfyUI API Fetch
            fetch('/upload/image', {
                method: "POST",
                body: body
            })
                .then(res => res.json())
                .then(data => {
                    if (data.name) {
                        callback(data.name); // returns the assigned filename back to the widget value
                    }
                    window.ShimaDialogInjectFont = null;
                    close();
                })
                .catch(err => {
                    console.error("[Shima] Failed to proxy image upload:", err);
                    window.ShimaDialogInjectFont = null;
                    close();
                });
            return; // Wait for async fetch
        }

        let v = input.value;
        if (isFileUpload && input.files.length === 0) {
            // Keep original if they didn't upload a new one
            v = initialValue;
        } else if (isNumber) {
            v = parseFloat(v) || parseFloat(initialValue);
        }

        let fontV = null;
        if (fontSelect) fontV = fontSelect.value;

        // Pass both back if font exists, else just value
        if (fontSelect) callback(v, fontV);
        else callback(v);

        window.ShimaDialogInjectFont = null; // Clean up
        close();
    }
    function close() {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
        document.removeEventListener("keydown", handleEsc);
        app.canvas.setDirty(true, true);
    }

    overlay.onmousedown = function (ev) {
        if (ev.target === overlay) close();
    };
}

app.registerExtension({
    name: "Shima.ControlPanel",

    setup() {
        const originalGetCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
        LGraphCanvas.prototype.getCanvasMenuOptions = function () {
            const options = originalGetCanvasMenuOptions ? originalGetCanvasMenuOptions.apply(this, arguments) : [];
            return options;
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.ControlPanel") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }

        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            if (origGetExtraMenuOptions) {
                origGetExtraMenuOptions.apply(this, arguments);
            }

            if (this.widgets && this.widgets.length > 0) {
                const pinOptions = [];
                for (let i = 0; i < this.widgets.length; i++) {
                    const w = this.widgets[i];
                    pinOptions.push({
                        content: `📌 Pin '${w.name || w.type}'`,
                        callback: () => {
                            const isPinned = window.ShimaPinnedWidgets.some(
                                p => p.nodeId === this.id && p.widgetName === w.name
                            );

                            if (!isPinned) {
                                window.ShimaPinnedWidgets.push({
                                    nodeId: this.id,
                                    widgetName: w.name || w.type,
                                    widgetIndex: i,
                                    type: w.type,
                                    label: `${this.title || this.type} | ${w.name}` // Pipe format requested
                                });

                                const panels = app.graph._nodes.filter(n => n.comfyClass === "Shima.ControlPanel");
                                panels.forEach(p => {
                                    p.size[1] += 34 * (p.properties?.scale || 1.0); // Expand for new row
                                    if (p.onResize) p.onResize(p.size);
                                    p.setDirtyCanvas(true, true);
                                });

                                app.canvas.setDirty(true, true);
                            }
                        }
                    });
                }

                if (pinOptions.length > 0) {
                    options.push(null);
                    options.push({
                        content: "Shima Control Panel",
                        has_submenu: true,
                        callback: () => { },
                        submenu: {
                            options: pinOptions
                        }
                    });
                }
            }
        };
    },

    async nodeCreated(node) {
        if (node.comfyClass === "Shima.ControlPanel") {
            node.properties = node.properties || {};
            node.properties.panel_title = node.properties.panel_title || "SHIMA CONTROL PANEL";
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;

            node.updatePayload = function () {
                if (!window.ShimaPinnedWidgets) return;

                let payloadWidget = this.widgets?.find(w => w.name === "payload");
                // Failsafe: if ComfyUI skipped widget generation because of the 'optional' python flag, force-spawn it
                if (!payloadWidget) {
                    payloadWidget = this.addWidget("string", "payload", "{}");
                    payloadWidget.type = "hidden";
                    payloadWidget.hidden = true;
                    payloadWidget.computeSize = () => [0, -4];
                }

                const data = {};
                window.ShimaPinnedWidgets.forEach(p => {
                    const tn = app.graph.getNodeById(p.nodeId);
                    if (tn) {
                        const tw = tn.widgets?.find(w => w.name === p.widgetName);
                        if (tw) data[p.label] = tw.value;
                    }
                });
                payloadWidget.value = JSON.stringify(data);
            };

            const BASE_W = 340;
            const ROW_H = 34;
            const PADDING = 12;

            node.size = [BASE_W, 200];
            node.resizable = true;

            node.onResize = function (size) {
                const sc = this.properties?.scale || 1.0;
                const widgetCount = window.ShimaPinnedWidgets.length;
                const HEADER_SPACE = (PADDING * 2 * sc) + (45 * sc);
                const minH = HEADER_SPACE + (widgetCount * ROW_H * sc) + (20 * sc);
                const minW = BASE_W * sc;
                size[0] = Math.max(size[0], minW);
                size[1] = Math.max(size[1], minH);
            };

            const cleanupUI = () => {
                if (node.widgets) {
                    node.widgets.forEach(w => {
                        w.type = "hidden";
                        w.computeSize = () => [0, -4];
                        w.hidden = true;
                    });
                }
            };
            cleanupUI();
            setTimeout(cleanupUI, 50);

            // Fallback for older saved nodes before outputs were added to the API
            setTimeout(() => {
                if (!node.outputs || node.outputs.length === 0) {
                    node.addOutput("JSON  ", "STRING");
                    node.addOutput("DICT  ", "DICT");
                } else {
                    if (node.outputs[0]) node.outputs[0].name = "JSON  ";
                    if (node.outputs[1]) node.outputs[1].name = "DICT  ";
                }
            }, 100);

            // Define the strictly native port coordinates locally
            const syncNativePorts = () => {
                if (node.outputs) {
                    const sc = node.properties?.scale || 1.0;
                    node.outputs.forEach((out, i) => {
                        if (!out) return;
                        out.label = " "; // Hide default text

                        // Place tightly inside the silver metal bezel border via 10px negative offset 
                        const dotX = node.size[0] - (10 * sc);
                        // Center vertically in the B measure (black screen area, which spans Y=20 to Y=64, center is Y=42)
                        const dotY = (33 * sc) + (i * 18 * sc);

                        out.pos = [dotX, dotY]; // Hijacks Litegraph's native socket drawing coordinates physically
                    });
                }
            };

            // Queue port alignments
            setTimeout(syncNativePorts, 50);
            setTimeout(syncNativePorts, 200);

            node.onConnectionsChange = function () {
                syncNativePorts();
            };

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const sc = this.properties?.scale || 1.0;
                const W = this.size[0];
                const H = this.size[1];

                ctx.save();

                // Outer Metallic Chassis (Lighter base)
                ctx.fillStyle = "#c0c0c0";
                ctx.beginPath();
                ctx.roundRect(0, 0, W, H, 16 * sc);
                ctx.fill();

                // 1. Far Background (Top Light -> Bottom Dark gradient) giving base curve
                const gradOuter = ctx.createLinearGradient(0, 0, 0, H);
                gradOuter.addColorStop(0, "#eeeeee");
                gradOuter.addColorStop(1, "#888888");
                ctx.fillStyle = gradOuter;
                ctx.fill();

                // Outer bezel stroke
                ctx.strokeStyle = "#555";
                ctx.lineWidth = 1 * sc;
                ctx.stroke();

                // 2. Inner Bevel Cutout (Top Dark -> Bottom Light) giving inset depth
                const PADDING = 20; // Increased padding to push screws out
                const SCR_X = PADDING * sc;
                const SCR_Y = PADDING * sc;
                const SCR_W = W - (PADDING * 2 * sc);
                const SCR_H = H - (PADDING * 2 * sc);

                const gradInner = ctx.createLinearGradient(0, SCR_Y - 5 * sc, 0, SCR_Y + SCR_H + 5 * sc);
                gradInner.addColorStop(0, "#666666");   // Dark at top interior edge
                gradInner.addColorStop(1, "#dddddd");   // Light at bottom interior edge

                ctx.fillStyle = gradInner;
                ctx.beginPath();
                ctx.roundRect(SCR_X - 3 * sc, SCR_Y - 3 * sc, SCR_W + 6 * sc, SCR_H + 6 * sc, 6 * sc);
                ctx.fill();

                // 4 Corner Screws 
                // The user requested them pushed in further to perfectly align with their mockup
                const screwIn = 14 * sc;
                ctx.fillStyle = "#666"; // Darker screw base
                for (let pos of [[screwIn, screwIn], [W - screwIn, screwIn], [screwIn, H - screwIn], [W - screwIn, H - screwIn]]) {
                    // Screw hole drop shadow (slight offset)
                    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.arc(pos[0], pos[1] + 1 * sc, 6 * sc, 0, Math.PI * 2); ctx.fill();
                    // Screw head
                    ctx.fillStyle = "#888"; ctx.beginPath(); ctx.arc(pos[0], pos[1], 5 * sc, 0, Math.PI * 2); ctx.fill();
                    // Crosshead
                    ctx.strokeStyle = "#444"; ctx.lineWidth = 1.5 * sc; ctx.beginPath();
                    ctx.moveTo(pos[0] - 2.5 * sc, pos[1] - 2.5 * sc); ctx.lineTo(pos[0] + 2.5 * sc, pos[1] + 2.5 * sc); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(pos[0] - 2.5 * sc, pos[1] + 2.5 * sc); ctx.lineTo(pos[0] + 2.5 * sc, pos[1] - 2.5 * sc); ctx.stroke();
                }

                // Inner Screen (The actual black plate)
                ctx.fillStyle = "#111111";
                ctx.beginPath();
                ctx.roundRect(SCR_X, SCR_Y, SCR_W, SCR_H, 4 * sc);
                ctx.fill();

                // Screen inner drop shadow (drawn by stroking interior)
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                // Title Area
                const titleStr = this.properties?.panel_title || "Renamable Title";
                const titleFont = this.properties?.panel_font || "sans-serif";

                // Ensure custom font is injected into the DOM before drawing
                if (titleFont !== "sans-serif" && !LOADED_FONTS.has(titleFont)) {
                    loadFont(titleFont).then(() => this.setDirtyCanvas(true, true));
                }

                ctx.fillStyle = "#fdfdfd";
                // If it's a custom font (not sans-serif), we don't force '300' font weight as it breaks custom OTFs
                if (titleFont === "sans-serif") {
                    ctx.font = `300 ${18 * sc}px sans-serif`;
                } else {
                    ctx.font = `${20 * sc}px "${titleFont}"`;
                }

                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(titleStr, SCR_X + 15 * sc, SCR_Y + 22 * sc);

                // Title Divider
                ctx.strokeStyle = "#2a2a2a";
                ctx.beginPath(); ctx.moveTo(SCR_X, SCR_Y + 44 * sc); ctx.lineTo(SCR_X + SCR_W, SCR_Y + 44 * sc); ctx.stroke();

                // --- Draw Pinned Widgets ---
                let currentY = SCR_Y + 45 * sc;

                if (window.ShimaPinnedWidgets.length === 0) {
                    ctx.fillStyle = "#555";
                    ctx.font = `italic ${12 * sc}px sans-serif`;
                    ctx.fillText("Right-click a node to pin widgets here...", W / 2, currentY + 30 * sc);
                } else {
                    window.ShimaPinnedWidgets.forEach((pinned, idx) => {
                        const targetNode = app.graph.getNodeById(pinned.nodeId);

                        // Node Title (Left aligned)
                        ctx.fillStyle = "#ccc";
                        ctx.font = `14px "Segoe UI", Arial, sans-serif`; // Cleaner font selection
                        ctx.textAlign = "left";
                        ctx.textBaseline = "middle";

                        let displayLabel = pinned.label;

                        // Dynamically calculate how many characters fit in the wider name box based on panel width
                        const controlX = SCR_X + SCR_W - 55 * sc; // Space for X and Button/Toggle
                        const availableTextWidth = controlX - (SCR_X + 15 * sc);

                        // Rough char width estimation to prevent overlap
                        const maxChars = Math.floor(availableTextWidth / (7.5 * sc));
                        if (displayLabel.length > maxChars) displayLabel = displayLabel.substring(0, maxChars - 3) + "...";

                        const rowCenter = currentY + (ROW_H * sc) / 2;
                        ctx.fillText(displayLabel, SCR_X + 15 * sc, rowCenter);

                        // Divider line (Subtle)
                        ctx.strokeStyle = "#1a1a1a";
                        ctx.beginPath(); ctx.moveTo(SCR_X + 10 * sc, currentY + (ROW_H * sc)); ctx.lineTo(SCR_X + SCR_W - 10 * sc, currentY + (ROW_H * sc)); ctx.stroke();

                        // Unpin X (Right aligned)
                        const xHitStart = SCR_X + SCR_W - 20 * sc;
                        ctx.fillStyle = "#ff5555";
                        ctx.textAlign = "center";
                        ctx.font = `14px sans-serif`;
                        ctx.fillText("✕", xHitStart + 10 * sc, rowCenter);

                        if (!targetNode) { ctx.fillStyle = "#ff0000"; ctx.fillText("MISSING", xHitStart - 30 * sc, rowCenter); currentY += ROW_H * sc; return; }
                        const w = targetNode.widgets?.find(w => w.name === pinned.widgetName);
                        if (!w) { ctx.fillStyle = "#ff0000"; ctx.fillText("MISSING", xHitStart - 30 * sc, rowCenter); currentY += ROW_H * sc; return; }

                        const val = w.value;

                        // Booleans => Toggle Switch
                        if (typeof val === "boolean" || w.type === "toggle" || w.type === "BOOLEAN") {
                            const tW = 38 * sc, tH = 20 * sc;
                            const tX = controlX - tW;
                            const tY = rowCenter - tH / 2;

                            // Try to get Color from Comfy graph if boolean node, else magenta
                            let tColor = "#e91e63";
                            if (targetNode.color) tColor = targetNode.color;

                            // 1. Draw Toggle Surround (Metal Base reflecting outer bezel frame)
                            const surrGrad = ctx.createLinearGradient(0, tY - 2 * sc, 0, tY + tH + 2 * sc);
                            surrGrad.addColorStop(0, "#eeeeee");
                            surrGrad.addColorStop(1, "#888888");
                            ctx.fillStyle = surrGrad;
                            ctx.beginPath(); ctx.roundRect(tX - 2 * sc, tY - 2 * sc, tW + 4 * sc, tH + 4 * sc, (tH + 4 * sc) / 2); ctx.fill();

                            // 2. Draw Gradient Bevel (Inner gap, matching metal)
                            const bevelGrad = ctx.createLinearGradient(0, tY, 0, tY + tH);
                            bevelGrad.addColorStop(0, "#666666");
                            bevelGrad.addColorStop(1, "#dddddd");
                            ctx.fillStyle = bevelGrad;
                            ctx.beginPath(); ctx.roundRect(tX, tY, tW, tH, tH / 2); ctx.fill();

                            // 3. Draw Inner Track (Dark cutout)
                            const trW = tW - 4 * sc;
                            const trH = tH - 4 * sc;
                            const trX = tX + 2 * sc;
                            const trY = tY + 2 * sc;

                            ctx.fillStyle = "#111111"; // Inner dark track
                            ctx.beginPath(); ctx.roundRect(trX, trY, trW, trH, trH / 2); ctx.fill();

                            ctx.strokeStyle = "rgba(0,0,0,0.6)";
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            // 4. Draw Toggle Thumb (Solid Color Top)
                            ctx.fillStyle = tColor;
                            ctx.globalAlpha = val ? 1.0 : 0.35;
                            ctx.beginPath();
                            const thumbR = (trH / 2) - 1 * sc; // Radius slightly smaller than inner track
                            ctx.arc(val ? (trX + trW - trH / 2) : (trX + trH / 2), trY + trH / 2, thumbR, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.globalAlpha = 1.0;
                        } else {
                            // Pill Buttons for Inputs (Width widened to match toggle track tW=38)
                            const bW = 38 * sc, bH = 20 * sc;
                            const bX = controlX - bW;
                            const bY = rowCenter - bH / 2;

                            // Try to get primary color from Comfy graph node color
                            // Map standard ComfyUI types first if possible
                            let cBase = "#f1c40f"; // Default yellow for random

                            if (w.type === "INT" || w.type === "int") cBase = "#63b5bb"; // Comfy INT Cyan
                            else if (w.type === "FLOAT" || w.type === "number" || w.type === "float") cBase = "#63c5a2"; // Comfy FLOAT Green
                            else if (w.type === "STRING" || w.type === "string") cBase = "#a1c13d"; // Comfy STRING Yellow-Green
                            else if (w.type === "combo") cBase = "#a663cc"; // Comfy custom purple-ish
                            else if (targetNode.color) {
                                cBase = targetNode.color; // Fallback to node color
                            } else if (w.name.toLowerCase().includes("load") || w.name.toLowerCase().includes("file")) {
                                cBase = "#a663cc";
                            }

                            // 1. Draw Button Surround (Metal Base reflecting outer bezel frame)
                            const surrGrad = ctx.createLinearGradient(0, bY - 2 * sc, 0, bY + bH + 2 * sc);
                            surrGrad.addColorStop(0, "#eeeeee");
                            surrGrad.addColorStop(1, "#888888");
                            ctx.fillStyle = surrGrad;
                            ctx.beginPath(); ctx.roundRect(bX - 2 * sc, bY - 2 * sc, bW + 4 * sc, bH + 4 * sc, (bH + 4 * sc) / 2); ctx.fill();

                            // 2. Draw Gradient Bevel (Inner gap, matching metal)
                            const bevelGrad = ctx.createLinearGradient(0, bY, 0, bY + bH);
                            bevelGrad.addColorStop(0, "#666666");
                            bevelGrad.addColorStop(1, "#dddddd");
                            ctx.fillStyle = bevelGrad;
                            ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, bH / 2); ctx.fill();

                            // 3. Draw Solid Color Top (The actual pill)
                            const pW = bW - 4 * sc;
                            const pH = bH - 4 * sc;
                            const pX = bX + 2 * sc;
                            const pY = bY + 2 * sc;

                            ctx.fillStyle = cBase;
                            ctx.beginPath(); ctx.roundRect(pX, pY, pW, pH, pH / 2); ctx.fill();

                            // Optional tiny shadow inner stroke for depth definition
                            ctx.strokeStyle = "rgba(0,0,0,0.4)";
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }

                        currentY += ROW_H * sc;
                    });
                }

                ctx.restore();
            };

            // --- Sync Native Ports ---
            node.syncNativePorts = function () {
                if (this.flags.collapsed) return;

                const sc = this.properties?.scale || 1.0;
                const dotX = this.size[0] - (10 * sc); // Moved 10px left from exterior bounds

                if (this.outputs) {
                    this.outputs.forEach((out, i) => {
                        if (!out) return;
                        // Center vertically in the B measure (black screen area, which spans Y=20 to Y=64, center is Y=42)
                        const dotY = (33 * sc) + (i * 18 * sc);
                        out.pos = [dotX, dotY];
                    });
                }
            };

            // --- Custom Output Drawer ---
            node.onDrawForeground = function (ctx) {
                if (this.flags.collapsed) return;

                // Ensure native ports are aligned when drawn, acting as a failsafe
                this.syncNativePorts();

                // Hide LiteGraph default text labels visually (but KEEP the native dots visible!)
                if (this.outputs) {
                    this.outputs.forEach((out, i) => {
                        out.label = " ";
                        // Restore visible port socket colors so they appear normally on the metal ring
                        out.color_on = i === 1 ? "#a663cc" : "#63c5a2";
                        out.color_off = "#888888";
                    });
                }

                const sc = this.properties?.scale || 1.0;
                ctx.save();
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.font = `300 ${14 * sc}px sans-serif`;

                if (this.outputs) {
                    this.outputs.forEach((out, i) => {
                        if (!out) return;

                        const textStr = out.name.trim();

                        // Text is placed fully inside the screen with padded spacing (Offset an extra 10px to follow dot migration)
                        const textEndX = this.size[0] - (24 * sc);

                        // Center vertically in the B measure (black screen area, which spans Y=20 to Y=64, center is Y=42)
                        const dotY = (33 * sc) + (i * 18 * sc);

                        // Port Text
                        ctx.fillStyle = "#dddddd";
                        ctx.fillText(textStr, textEndX, dotY);
                    });
                }
                ctx.restore();
            };

            // --- Interactive Control Hooks ---
            node.onMouseDown = function (e, localPos, canvas) {
                if (window.ShimaPinnedWidgets.length === 0) return false;

                const sc = this.properties?.scale || 1.0;
                const [x, y] = localPos;
                const W = this.size[0];
                const PADDING = 12;
                const SCR_X = PADDING * sc;
                const SCR_Y = PADDING * sc;
                const SCR_W = W - (PADDING * 2 * sc);
                const ROW_H = 34 * sc;
                const TITLE_H = 44 * sc;

                // Check title rename (Limit width to avoid stealing clicks from the output ports area)
                const TITLE_HITBOX_W = SCR_W - (70 * sc);
                if (y >= SCR_Y && y <= SCR_Y + TITLE_H && x >= SCR_X && x <= SCR_X + TITLE_HITBOX_W) {
                    window.ShimaDialogInjectFont = this.properties?.panel_font || "sans-serif";
                    spawnHTMLDialog("Rename Control Panel", this.properties?.panel_title || "Renamable Title", false, false, false, null, (newStr, newFont) => {
                        this.properties.panel_title = newStr;
                        if (newFont) this.properties.panel_font = newFont;
                        this.setDirtyCanvas(true, true);
                    });
                    return true;
                }

                if (y < SCR_Y + TITLE_H) return false;

                let currentY = SCR_Y + TITLE_H + 1 * sc;

                for (let i = 0; i < window.ShimaPinnedWidgets.length; i++) {
                    const pinned = window.ShimaPinnedWidgets[i];
                    const rowTop = currentY;
                    const rowBottom = currentY + ROW_H;

                    if (y >= rowTop && y <= rowBottom) {
                        const targetNode = app.graph.getNodeById(pinned.nodeId);

                        // We pushed the X button hit start over to match the new width spacing
                        const controlX = SCR_X + SCR_W - 55 * sc;
                        const xHitStart = SCR_X + SCR_W - 20 * sc;

                        // Unpin X Button
                        if (x >= xHitStart && x <= xHitStart + 20 * sc && y >= rowTop && y <= rowBottom) {
                            window.ShimaPinnedWidgets.splice(i, 1);
                            const panels = app.graph._nodes.filter(n => n.comfyClass === "Shima.ControlPanel");
                            panels.forEach(p => {
                                p.size[1] = Math.max(200, p.size[1] - ROW_H * sc);
                                if (p.onResize) p.onResize(p.size);
                                p.setDirtyCanvas(true, true);
                            });
                            app.canvas.setDirty(true, true);
                            return true;
                        }

                        if (!targetNode) return true;
                        const w = targetNode.widgets?.find(w => w.name === pinned.widgetName);
                        if (!w) return true;

                        // Booleans
                        if (typeof w.value === "boolean" || w.type === "toggle" || w.type === "BOOLEAN") {
                            const tW = 38 * sc;
                            if (x >= controlX - tW && x <= controlX) {
                                w.value = !w.value;
                                if (w.callback) w.callback(w.value);
                                targetNode.setDirtyCanvas(true, true);
                                this.updatePayload();
                                this.setDirtyCanvas(true, true);
                                return true;
                            }
                        } else {
                            // Pill Buttons
                            const bW = 38 * sc;
                            if (x >= controlX - bW && x <= controlX) {
                                const isNumber = (typeof w.value === "number" || w.type === "number" || w.type === "FLOAT" || w.type === "INT");
                                const isMultiline = (w.type === "customtext" || w.name === "text" || (w.type === "STRING" && w.options && w.options.multiline));
                                const isFileUpload = (w.name === "upload" || w.type === "upload");

                                let comboOptions = null;
                                if (w.type === "combo" && Array.isArray(w.options)) {
                                    comboOptions = w.options;
                                } else if (w.options && Array.isArray(w.options.values)) {
                                    comboOptions = w.options.values;
                                } else if (Array.isArray(w.options)) {
                                    comboOptions = w.options;
                                }

                                spawnHTMLDialog("Set " + pinned.label, w.value, isNumber, isMultiline, isFileUpload, comboOptions, (newVal) => {
                                    let v = newVal;
                                    if (isNumber && w.type === "INT") v = Math.round(v);
                                    w.value = v;
                                    if (w.callback) w.callback(v);
                                    targetNode.setDirtyCanvas(true, true);
                                    this.updatePayload();
                                    this.setDirtyCanvas(true, true);
                                });
                                return true;
                            }
                        }

                        return true;
                    }

                    currentY += ROW_H;
                }

                return false;
            };

            // --- Persistence Hooks ---
            const onSerializeBackup = node.onSerialize;
            node.onSerialize = function (o) {
                if (onSerializeBackup) onSerializeBackup.call(this, o);
                o.properties = o.properties || {};
                o.properties.pinned_widgets = window.ShimaPinnedWidgets ? JSON.parse(JSON.stringify(window.ShimaPinnedWidgets)) : [];

                // CRITICAL: Ensure the latest values are scooped up into the JSON string the moment before 'Queue Prompt' sends the graph!
                if (this.updatePayload) this.updatePayload();
            };

            const onConfigureBackup = node.onConfigure;
            node.onConfigure = function (o) {
                if (onConfigureBackup) onConfigureBackup.call(this, o);
                if (o.properties && o.properties.pinned_widgets) {
                    window.ShimaPinnedWidgets = o.properties.pinned_widgets;
                }

                // Recover payload tracking after load
                if (this.updatePayload) this.updatePayload();

                // Force a recalculation of sizes after a tiny delay to ensure nodes are loaded
                setTimeout(() => {
                    const sc = this.properties?.scale || 1.0;
                    const ROW_H = 34;
                    const PADDING = 12;
                    const HEADER_SPACE = (PADDING * 2 * sc) + (45 * sc);
                    const minH = HEADER_SPACE + (window.ShimaPinnedWidgets.length * ROW_H * sc) + (20 * sc);
                    this.size[1] = Math.max(this.size[1], minH);
                    if (this.onResize) this.onResize(this.size);
                    this.setDirtyCanvas(true, true);
                }, 100);
            };
        }
    }
});
