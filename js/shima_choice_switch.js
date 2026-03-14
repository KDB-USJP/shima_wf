import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Shima ChoiceSwitch - Frontend Extension
 * Stylized toggle buttons for Boolean/Integer/String choices.
 */

// Helper: Calculate contrast-aware text color (White or Black)
function getContrastYIQ(hexcolor) {
    if (!hexcolor) return "white";
    const r = parseInt(hexcolor.slice(1, 3), 16);
    const g = parseInt(hexcolor.slice(3, 5), 16);
    const b = parseInt(hexcolor.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? "black" : "white";
}

app.registerExtension({
    name: "Shima.ChoiceSwitch",
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.ChoiceSwitch") {

            // --- Sticker-Style Overrides ---
            node.bgcolor = "#222";
            node.boxcolor = "#333";
            node.shima_ignore_color = true;

            // --- Initialization ---
            node.properties = node.properties || {};
            // Don't overwrite if it already exists (from a save)
            if (node.properties.userResized === undefined) {
                node.properties.userResized = false;
            }

            // --- Widget Utility ---
            const getW = (name) => node.widgets?.find(w => w.name === name);

            // --- Widget Hiding ---
            function hideWidgets() {
                const toHide = ["mode", "value", "option_1_str", "option_2_str", "option_1_color", "option_2_color", "layout", "font_size"];
                toHide.forEach(name => {
                    const w = getW(name);
                    if (w) {
                        w.type = "hidden";
                        w.computeSize = () => [0, 0];
                        w.hidden = true;
                        if (w.label) w.label = "";
                    }
                });
            }
            setTimeout(hideWidgets, 50); // Faster hide

            // Sizing logic
            node.computeSize = function () {
                if (this.properties.userResized && this.size) return this.size;

                const layout = getW("layout")?.value || "Wide";
                const fontSize = getW("font_size")?.value || 18;
                const padding = 15;
                const topPadding = 50;
                const gap = 10;

                const mode = getW("mode")?.value || "Boolean";
                const opt1Str = getW("option_1_str")?.value || "TRUE";
                const opt2Str = getW("option_2_str")?.value || "FALSE";

                let d1 = opt1Str;
                let d2 = opt2Str;
                if (mode === "Boolean") { d1 = "TRUE"; d2 = "FALSE"; }
                if (mode === "Integer") { d1 = "1"; d2 = "2"; }

                // Estimate text width (bold sans-serif factor ~0.7)
                const textWidth = (str) => (str.length * fontSize * 0.65);
                const w1 = textWidth(d1);
                const w2 = textWidth(d2);

                const isWide = layout === "Wide";
                const minHeight = isWide ? (fontSize * 2.2) + (padding + topPadding) : (fontSize * 4.4) + (padding + topPadding) + gap;

                // For Wide: 2 buttons side-by-side + gap + paddings
                // For Stacked: Width of widest button + paddings
                const estimatedWidth = isWide ? (Math.max(w1, w2) * 2) + gap + (padding * 3) : Math.max(w1, w2) + (padding * 4);
                const minWidth = isWide ? Math.max(260, estimatedWidth) : Math.max(180, estimatedWidth);

                return [minWidth, minHeight];
            };

            node.updateSize = function () {
                const size = this.computeSize();
                this._isSystemResizing = true;
                this.setSize(size);
                this._isSystemResizing = false;
            };

            node.onResize = function (size) {
                if (this._isSystemResizing) return;
                // Only flag as user-resized if we are actively dragging/changing size manually
                if (app.canvas.node_being_resized === this) {
                    this.properties.userResized = true;
                }
            };

            // Run once on load/creation to ensure smart default size
            setTimeout(() => {
                if (!node.properties.userResized) node.updateSize();
            }, 100);

            // --- Rendering Logic ---
            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const mode = getW("mode")?.value || "Boolean";
                const value = getW("value")?.value ?? 1; // 0=Opt1, 1=Opt2
                const layout = getW("layout")?.value || "Wide";
                const fontSize = getW("font_size")?.value || 18;

                const opt1Str = getW("option_1_str")?.value || "TRUE";
                const opt2Str = getW("option_2_str")?.value || "FALSE";
                const opt1Col = getW("option_1_color")?.value || "#3a5a7c";
                const opt2Col = getW("option_2_color")?.value || "#571a1a";

                // Resolve Display Names
                let display1 = opt1Str;
                let display2 = opt2Str;
                if (mode === "Boolean") { display1 = "TRUE"; display2 = "FALSE"; }
                if (mode === "Integer") { display1 = "1"; display2 = "2"; }

                const padding = 15;
                const topPadding = 50; // Increased to 50px for dual output pins
                const gap = 10;
                const cornerRadius = 8;

                // Calculate dimensions
                const isWide = layout === "Wide";
                const availableW = this.size[0] - (padding * 2);
                const availableH = this.size[1] - (padding + topPadding);

                let b1 = { x: padding, y: topPadding, w: 0, h: 0 };
                let b2 = { x: padding, y: topPadding, w: 0, h: 0 };

                if (isWide) {
                    const btnW = (availableW - gap) / 2;
                    b1.w = b2.w = btnW;
                    b1.h = b2.h = availableH;
                    b2.x = padding + btnW + gap;
                } else {
                    const btnH = (availableH - gap) / 2;
                    b1.w = b2.w = availableW;
                    b1.h = b2.h = btnH;
                    b2.y = topPadding + btnH + gap;
                }

                // Store hitboxes
                this._hitboxes = [
                    { ...b1, targetValue: 1 },
                    { ...b2, targetValue: 0 }
                ];

                // Draw Buttons
                const drawButton = (box, color, text, active) => {
                    ctx.save();

                    // Background
                    ctx.globalAlpha = active ? 1.0 : 0.25;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.roundRect(box.x, box.y, box.w, box.h, cornerRadius);
                    ctx.fill();

                    // Inner Glow / Highlight Logic for active state
                    if (active) {
                        // Thick Outer Edge Glow
                        ctx.strokeStyle = "rgba(255,255,255,0.8)";
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        // Inner Thick Stroke (Glow)
                        ctx.save();
                        ctx.beginPath();
                        ctx.roundRect(box.x, box.y, box.w, box.h, cornerRadius);
                        ctx.clip();
                        ctx.strokeStyle = "rgba(255,255,255,0.4)";
                        ctx.lineWidth = 10;
                        ctx.stroke();
                        ctx.restore();

                        // Radial Center Glow
                        const grad = ctx.createRadialGradient(
                            box.x + box.w / 2, box.y + box.h / 2, 0,
                            box.x + box.w / 2, box.y + box.h / 2, Math.max(box.w, box.h) * 0.6
                        );
                        grad.addColorStop(0, "rgba(255,255,255,0.2)");
                        grad.addColorStop(1, "transparent");
                        ctx.fillStyle = grad;
                        ctx.fill();
                    }

                    // Text
                    ctx.globalAlpha = active ? 1.0 : 0.5;
                    ctx.fillStyle = getContrastYIQ(color);
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    if (active) {
                        ctx.shadowColor = "rgba(0,0,0,0.4)";
                        ctx.shadowBlur = 4;
                    }

                    ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2);

                    ctx.restore();
                };

                drawButton(this._hitboxes[0], opt2Col, display2, value === 1);
                drawButton(this._hitboxes[1], opt1Col, display1, value === 0);
            };

            // --- Interaction ---
            node.onMouseDown = function (e, localPos) {
                if (this.flags.collapsed) return;

                const [x, y] = localPos;
                if (this._hitboxes) {
                    for (const box of this._hitboxes) {
                        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
                            const wValue = getW("value");
                            if (wValue) {
                                wValue.value = box.targetValue;
                                if (wValue.callback) wValue.callback(wValue.value);
                                this.setDirtyCanvas(true, true);
                            }
                            return true; // Click consumed
                        }
                    }
                }
            };

            node.onDblClick = function () {
                showChoiceSwitchPicker(node);
            };

            // --- Synchronization with Highway nodes ---
            const wValue = getW("value");
            if (wValue) {
                const origCallback = wValue.callback;
                wValue.callback = function (v) {
                    if (origCallback) origCallback.apply(this, arguments);

                    // Map ChoiceSwitch value: 0 is Choice 1 (True), 1 is Choice 2 (False)
                    const activeRoute = (v === 0) ? 0 : 1;

                    // Search both outputs for connected Highway nodes
                    [0, 1].forEach(slot => {
                        const links = node.outputs?.[slot]?.links;
                        if (!links) return;

                        links.forEach(linkId => {
                            const link = app.graph.links[linkId];
                            if (!link) return;
                            const targetNode = app.graph.getNodeById(link.target_id);
                            if (!targetNode) return;

                            if (targetNode.comfyClass === "Shima.HighwayDetour") {
                                const input = targetNode.inputs[link.target_slot];
                                if (input && input.name === "route_automate") {
                                    const w = targetNode.widgets?.find(w => w.name === "active_route");
                                    if (w) {
                                        w.value = activeRoute;
                                        if (targetNode.updateHighwayPaths) {
                                            targetNode.updateHighwayPaths(activeRoute);
                                        }
                                        targetNode.setDirtyCanvas(true, true);
                                    }
                                }
                            }
                        });
                    });
                };
            }

        }
    }
});

/**
 * Custom Picker Modal for ChoiceSwitch
 */
async function showChoiceSwitchPicker(node) {
    const getW = (name) => node.widgets.find(w => w.name === name);
    const wMode = getW("mode");
    const wOpt1Str = getW("option_1_str");
    const wOpt2Str = getW("option_2_str");
    const wOpt1Col = getW("option_1_color");
    const wOpt2Col = getW("option_2_color");
    const wLayout = getW("layout");
    const wFontSize = getW("font_size");

    const palette = window.SHIMA_THEME?.palette || {};

    const dialog = document.createElement("dialog");
    dialog.style.cssText = `
        padding: 20px; background: #1e1e1e; color: #eee;
        border: 1px solid #444; border-radius: 12px; width: 450px;
        display: flex; flex-direction: column; gap: 15px;
        z-index: 10001; box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        font-family: sans-serif;
    `;

    dialog.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px;">
            <h3 style="margin:0; font-size:18px; color: #61be64;">🏝️ Choice Switch Setup</h3>
            <button id="close" style="background:none; border:none; color:#888; cursor:pointer; font-size:20px;">✕</button>
        </div>

        <div>
            <label style="display:block; font-size:11px; color:#888; margin-bottom:4px;">Switch Mode</label>
            <select id="s-mode" style="width:100%; padding:8px; background:#2a2a2a; border:1px solid #444; color:#fff; border-radius:4px;">
                ${["Boolean", "Integer", "String"].map(m => `<option value="${m}" ${wMode.value === m ? 'selected' : ''}>${m}</option>`).join("")}
            </select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
                <label style="display:block; font-size:11px; color:#888; margin-bottom:4px;">Layout Orientation</label>
                <select id="s-layout" style="width:100%; padding:8px; background:#2a2a2a; border:1px solid #444; color:#fff; border-radius:4px;">
                    <option value="Wide" ${wLayout.value === "Wide" ? 'selected' : ''}>Wide (Side-by-Side)</option>
                    <option value="Stacked" ${wLayout.value === "Stacked" ? 'selected' : ''}>Stacked (Vertical)</option>
                </select>
            </div>
            <div>
                <label style="display:block; font-size:11px; color:#888; margin-bottom:4px;">Font Size (${wFontSize.value}px)</label>
                <input type="range" id="s-fsize" min="8" max="24" step="1" value="${wFontSize.value}" style="width:100%;">
            </div>
        </div>

        <div id="string-inputs" style="display: ${wMode.value === 'String' ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
                <label style="display:block; font-size:11px; color:#888; margin-bottom:4px;">Option 1 (True) String</label>
                <input type="text" id="s-opt1-str" value="${wOpt1Str.value}" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
            </div>
            <div>
                <label style="display:block; font-size:11px; color:#888; margin-bottom:4px;">Option 2 (False) String</label>
                <input type="text" id="s-opt2-str" value="${wOpt2Str.value}" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px;">
            </div>
        </div>

        <!-- Color Pickers -->
        <div>
            <label style="display:block; font-size:11px; color:#888; margin-bottom:8px;">Switch 1 Color (TRUE/1/STR1)</label>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${Object.entries(palette).map(([n, c]) => `<div class="s-color-1" data-color="${c}" title="${n}" style="width:20px; height:20px; background:${c}; border-radius:3px; cursor:pointer; border:1px solid ${wOpt1Col.value === c ? '#fff' : 'transparent'};"></div>`).join("")}
                <input type="color" id="s-col1-custom" value="${wOpt1Col.value}" style="width:20px; height:20px; padding:0; border:none; background:none; cursor:pointer;">
            </div>
        </div>
        <div>
            <label style="display:block; font-size:11px; color:#888; margin-bottom:8px;">Switch 2 Color (FALSE/2/STR2)</label>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${Object.entries(palette).map(([n, c]) => `<div class="s-color-2" data-color="${c}" title="${n}" style="width:20px; height:20px; background:${c}; border-radius:3px; cursor:pointer; border:1px solid ${wOpt2Col.value === c ? '#fff' : 'transparent'};"></div>`).join("")}
                <input type="color" id="s-col2-custom" value="${wOpt2Col.value}" style="width:20px; height:20px; padding:0; border:none; background:none; cursor:pointer;">
            </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:5px;">
            <button id="cancel" style="padding:10px 20px; background:transparent; border:1px solid #444; color:#aaa; border-radius:6px; cursor:pointer;">Cancel</button>
            <button id="save" style="padding:10px 25px; background:#3a5a7c; border:none; color:white; border-radius:6px; cursor:pointer; font-weight:bold;">Apply Changes</button>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    // Mode Toggle Logic
    const sMode = dialog.querySelector("#s-mode");
    const sStrings = dialog.querySelector("#string-inputs");
    sMode.onchange = () => sStrings.style.display = sMode.value === "String" ? "grid" : "none";

    // Color Pickers
    const setupColor = (selector, customId) => {
        const swatches = dialog.querySelectorAll(selector);
        const custom = dialog.querySelector(customId);
        swatches.forEach(s => {
            s.onclick = () => {
                swatches.forEach(sw => sw.style.borderColor = "transparent");
                s.style.borderColor = "#fff";
                custom.value = s.dataset.color;
            };
        });
    };
    setupColor(".s-color-1", "#s-col1-custom");
    setupColor(".s-color-2", "#s-col2-custom");

    const close = () => { dialog.close(); dialog.remove(); };
    dialog.querySelector("#close").onclick = close;
    dialog.querySelector("#cancel").onclick = close;

    dialog.querySelector("#save").onclick = () => {
        wMode.value = sMode.value;
        wOpt1Str.value = dialog.querySelector("#s-opt1-str").value;
        wOpt2Str.value = dialog.querySelector("#s-opt2-str").value;
        wOpt1Col.value = dialog.querySelector("#s-col1-custom").value;
        wOpt2Col.value = dialog.querySelector("#s-col2-custom").value;
        wLayout.value = dialog.querySelector("#s-layout").value;
        wFontSize.value = parseInt(dialog.querySelector("#s-fsize").value);

        node.properties.userResized = false;
        if (node.updateSize) node.updateSize();
        node.setDirtyCanvas(true, true);
        close();
    };
}
