import { app } from "../../scripts/app.js";

/**
 * Shima RGB Indicator - Frontend Extension
 * 3-channel additive color blending logic array.
 */

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}

function adjustColorObj(c, factor) {
    return {
        r: Math.min(255, Math.max(0, Math.floor(c.r * factor))),
        g: Math.min(255, Math.max(0, Math.floor(c.g * factor))),
        b: Math.min(255, Math.max(0, Math.floor(c.b * factor)))
    };
}

function objToRgbString(c) {
    return `rgb(${c.r},${c.g},${c.b})`;
}

app.registerExtension({
    name: "Shima.RGBIndicator",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.RGBIndicator") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.RGBIndicator") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;

            const initialScale = node.widgets?.find(w => w.name === "scale")?.value || 1.0;
            node.size = [110 * initialScale, 80 * initialScale];

            node.computeSize = function () {
                const sc = node.widgets?.find(w => w.name === "scale")?.value || 1.0;
                return [110 * sc, 80 * sc];
            };

            const cleanupUI = () => {
                if (node.widgets) {
                    node.widgets.forEach(w => {
                        w.type = "hidden";
                        w.computeSize = () => [0, -4];
                        w.hidden = true;
                    });
                }
                const [w, h] = node.computeSize();
                if (node.inputs) {
                    const colorsOn = ["#ff3333", "#33ff33", "#4488ff"];
                    const colorsOff = ["#551111", "#115511", "#112255"];
                    node.inputs.forEach((i, idx) => {
                        i.label = ["R", "G", "B"][idx] || " ";
                        const spacing = h / 4;
                        i.pos = [0, spacing * (idx + 1)];
                        i.color_on = colorsOn[idx] || "#aaa";
                        i.color_off = colorsOff[idx] || "#666";
                    });
                }
                if (node.outputs) {
                    node.outputs.forEach((o, idx) => {
                        o.label = [",", "B"][idx] || ",";
                        o.pos = [w, (h / 3) * (idx + 1)];
                        if (o.name === "eval_bool" || idx === 1) {
                            o.color_on = "#a05cd6";
                            o.color_off = "#4d2b6b";
                        }
                    });
                }
            };
            cleanupUI();
            setTimeout(cleanupUI, 50);

            node.onConnectionsChange = function () {
                cleanupUI();
            }

            node.updateState = function (stateObj) {
                this._rgbState = stateObj || { r: false, g: false, b: false };
                this.setDirtyCanvas(true);
            };

            node.onExecuted = function (message) {
                if (message && message.state !== undefined) {
                    const s = message.state[0];
                    if (typeof s === "object") {
                        this.updateState({ r: !!s.r, g: !!s.g, b: !!s.b });
                    } else {
                        // Fallback
                        this.updateState(s);
                    }
                }
            };

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;
                const [w, h] = this.size;
                const cx = w / 2;
                const cy = h / 2;
                const scale = this.widgets?.find(w => w.name === "scale")?.value || 1.0;

                const cR = this.widgets?.find(w => w.name === "r_color")?.value || "#ff0000";
                const cG = this.widgets?.find(w => w.name === "g_color")?.value || "#00ff00";
                const cB = this.widgets?.find(w => w.name === "b_color")?.value || "#0000ff";

                let state = this._rgbState || { r: false, g: false, b: false };
                const triggerType = this.widgets?.find(w => w.name === "trigger_type")?.value;

                // --- Hardware Sync (Real-time Link Traversal) ---
                if (triggerType === "Hardware Sync") {
                    state = { r: false, g: false, b: false };

                    const checkLink = (inputIdx) => {
                        if (this.inputs?.[inputIdx]?.link) {
                            const link = app.graph.links[this.inputs[inputIdx].link];
                            if (link) {
                                const sourceNode = app.graph.getNodeById(link.origin_id);
                                if (sourceNode) {
                                    const sw = sourceNode.widgets?.find(w => w.name === "switch_state" || w.name === "breaker_state");
                                    if (sw !== undefined) return (sw.value === 0);

                                    // For standard ComfyUI nodes, in "Hardware Sync" we want to know if it's 
                                    // outputting a "True" signal, REGARDLESS of whether the user bypassed it.
                                    // But since we can't read execution output here, if it's not a Shima switch,
                                    // we fall back to seeing if it has a boolean widget that is true, or just assume active.
                                    const boolWidget = sourceNode.widgets?.find(w => w.type === "toggle" || w.type === "boolean");
                                    if (boolWidget !== undefined) return !!boolWidget.value;

                                    // If we really can't tell, we just return true if it's connected
                                    return true;
                                }
                            }
                        }
                        return false;
                    };

                    state.r = checkLink(0);
                    state.g = checkLink(1);
                    state.b = checkLink(2);

                    // Push the truth state to the hidden widget so Python can execute it
                    const hwWidget = this.widgets?.find(w => w.name === "hw_sync_state");
                    if (hwWidget) {
                        hwWidget.value = `${state.r},${state.g},${state.b}`;
                    }
                }

                // Additive Color Blending
                let mixedColor = { r: 0, g: 0, b: 0 };
                let activeCount = 0;

                if (state.r) { const c = hexToRgb(cR); mixedColor.r += c.r; mixedColor.g += c.g; mixedColor.b += c.b; activeCount++; }
                if (state.g) { const c = hexToRgb(cG); mixedColor.r += c.r; mixedColor.g += c.g; mixedColor.b += c.b; activeCount++; }
                if (state.b) { const c = hexToRgb(cB); mixedColor.r += c.r; mixedColor.g += c.g; mixedColor.b += c.b; activeCount++; }

                const isLit = activeCount > 0;
                let finalHex = "#222222";
                let finalColorObj = { r: 34, g: 34, b: 34 };

                if (isLit) {
                    // Clamp additive colors
                    finalColorObj = {
                        r: Math.min(255, mixedColor.r),
                        g: Math.min(255, mixedColor.g),
                        b: Math.min(255, mixedColor.b)
                    };
                    finalHex = objToRgbString(finalColorObj);
                }

                const rectSize = (50 * 0.8) * scale;
                const rx = cx - rectSize / 2;
                const ry = cy - rectSize / 2;
                const radius = 8 * scale; // Rounded corners

                ctx.save();

                // 1. Housing (Industrial Rounded Square)
                ctx.beginPath();
                const hrx = rx - 6 * scale;
                const hry = ry - 6 * scale;
                const hw = rectSize + 12 * scale;
                const hh = rectSize + 12 * scale;
                const hrad = radius + 2 * scale;

                ctx.moveTo(hrx + hrad, hry);
                ctx.arcTo(hrx + hw, hry, hrx + hw, hry + hh, hrad);
                ctx.arcTo(hrx + hw, hry + hh, hrx, hry + hh, hrad);
                ctx.arcTo(hrx, hry + hh, hrx, hry, hrad);
                ctx.arcTo(hrx, hry, hrx + hw, hry, hrad);
                ctx.closePath();

                const ringGrad = ctx.createLinearGradient(hrx, hry, hrx + hw, hry + hh);
                ringGrad.addColorStop(0, "#444");
                ringGrad.addColorStop(1, "#111");
                ctx.fillStyle = ringGrad;
                ctx.fill();
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.stroke();

                // 2. The Lens (Rounded Square)
                ctx.beginPath();
                ctx.moveTo(rx + radius, ry);
                ctx.arcTo(rx + rectSize, ry, rx + rectSize, ry + rectSize, radius);
                ctx.arcTo(rx + rectSize, ry + rectSize, rx, ry + rectSize, radius);
                ctx.arcTo(rx, ry + rectSize, rx, ry, radius);
                ctx.arcTo(rx, ry, rx + rectSize, ry, radius);
                ctx.closePath();

                if (isLit) {
                    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rectSize);
                    glowGrad.addColorStop(0, "#fff");
                    glowGrad.addColorStop(0.2, objToRgbString(adjustColorObj(finalColorObj, 1.3)));
                    glowGrad.addColorStop(0.8, finalHex);
                    glowGrad.addColorStop(1, objToRgbString(adjustColorObj(finalColorObj, 0.4)));
                    ctx.fillStyle = glowGrad;
                    ctx.shadowBlur = 30 * scale;
                    ctx.shadowColor = finalHex;
                } else {
                    const darkGrad = ctx.createRadialGradient(cx, cy - rectSize * 0.2, 0, cx, cy, rectSize);
                    darkGrad.addColorStop(0, objToRgbString(adjustColorObj(finalColorObj, 1.2)));
                    darkGrad.addColorStop(1, finalHex);
                    ctx.fillStyle = darkGrad;
                    ctx.shadowBlur = 0;
                }
                ctx.fill();

                // 3. Highlight/Reflection
                if (!isLit) {
                    ctx.beginPath();
                    ctx.arc(cx - rectSize * 0.2, cy - rectSize * 0.2, rectSize * 0.1, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(255,255,255,0.05)";
                    ctx.fill();
                }

                // 4. Fine inner bevel
                ctx.beginPath();
                ctx.moveTo(rx + radius, ry);
                ctx.arcTo(rx + rectSize, ry, rx + rectSize, ry + rectSize, radius);
                ctx.arcTo(rx + rectSize, ry + rectSize, rx, ry + rectSize, radius);
                ctx.arcTo(rx, ry + rectSize, rx, ry, radius);
                ctx.arcTo(rx, ry, rx + rectSize, ry, radius);
                ctx.closePath();
                ctx.strokeStyle = isLit ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.5)";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.restore();

                // 4.5 Mode Designator
                const modeMap = {
                    "Boolean": "TF",
                    "Number (>0)": ">0",
                    "Hardware Sync": "HS",
                    "Shima Eval (eval|||val)": "SE"
                };
                const modeText = modeMap[triggerType] || "TF";

                ctx.save();
                ctx.fillStyle = isLit ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.2)";
                ctx.font = `bold ${Math.max(10, Math.floor(12 * (scale || 1)))}px sans-serif`;
                ctx.textAlign = "right";
                // Position at the bottom right of the inner lens
                ctx.fillText(modeText, cx + rectSize / 2 - 8, cy + rectSize / 2 - 8);
                ctx.restore();

                // 5. Ensure output ports remain visible across all modes
                if (this.outputs) {
                    this.outputs.forEach(o => {
                        // Restore type if it was previously hidden (-1)
                        if (o.type === -1) {
                            o.type = (o.name === "eval_bool" || o.label === "B") ? "TUPLE" : "STRING";
                        }
                    });
                }
            };


            node.onDblClick = function () {
                showRGBModal(this);
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Shima: Configure Array...",
                    callback: () => showRGBModal(this)
                });
            };
        }
    }
});

function showRGBModal(node) {
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000;";

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: #111; color: #eee; padding: 30px; border-radius: 12px;
        z-index: 10001; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        border: 1px solid #333; min-width: 350px; font-family: sans-serif;
    `;

    panel.innerHTML = `<h2 style='margin-top:0'>RGB Array Config</h2>`;

    const createRow = (labelStr) => {
        const row = document.createElement("div");
        row.style.marginBottom = "15px";
        const l = document.createElement("b");
        l.style.cssText = "font-size:12px; color:#aaa; display:block; margin-bottom:5px;";
        l.innerText = labelStr;
        row.appendChild(l);
        panel.appendChild(row);
        return row;
    };

    // Colors Row
    const cRow = document.createElement("div");
    cRow.style.display = "flex"; cRow.style.gap = "10px"; cRow.style.marginBottom = "20px";

    const colorNames = ["Channel 1 (R)", "Channel 2 (G)", "Channel 3 (B)"];
    const tNames = ["r_color", "g_color", "b_color"];
    const cInputs = [];

    tNames.forEach((tName, i) => {
        const cBox = document.createElement("div"); cBox.style.flex = "1";
        cBox.innerHTML = `<b style='font-size:10px; color:#aaa; display:block; margin-bottom:5px; text-align:center;'>${colorNames[i]}</b>`;

        // Color Picker
        const cInput = document.createElement("input"); cInput.type = "color";
        const w = node.widgets?.find(w => w.name === tName);
        cInput.value = w?.value || (i === 0 ? "#ff0000" : (i === 1 ? "#00ff00" : "#0000ff"));
        cInput.style.cssText = "width:100%; height:30px; border:none; background:none; cursor:pointer; margin-bottom:5px;";
        cBox.appendChild(cInput);

        // Eval Label Input
        const eNames = ["r_eval", "g_eval", "b_eval"];
        const eName = eNames[i];
        const eLabel = document.createElement("input"); eLabel.type = "text";
        const ew = node.widgets?.find(w => w.name === eName);
        eLabel.value = ew?.value || "";
        eLabel.style.cssText = "width:100%; padding:5px; background:#222; color:white; border: 1px solid #444; box-sizing:border-box; font-size:11px; text-align:center; margin-top:5px;";
        eLabel.placeholder = `opt. ch${i + 1} value`;

        // Always show the eval input box
        eLabel.style.display = "block";

        cBox.appendChild(eLabel);

        cRow.appendChild(cBox);
        cInputs.push({ input: cInput, widget: w, evalInput: eLabel, evalWidget: ew });
    });
    panel.appendChild(cRow);

    // Scale
    const sRow = createRow("Scale (Size)");
    const scaleInput = document.createElement("input"); scaleInput.type = "number"; scaleInput.step = "0.1"; scaleInput.min = "0.1"; scaleInput.max = "10";
    const scaleW = node.widgets?.find(w => w.name === "scale");
    scaleInput.value = scaleW?.value || 1.0;
    scaleInput.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444; box-sizing:border-box;";
    sRow.appendChild(scaleInput);

    const tRow = createRow("Trigger Type");
    const tSel = document.createElement("select");
    tSel.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444;";
    const triggerW = node.widgets?.find(w => w.name === "trigger_type");
    ["Boolean", "Number (>0)", "Hardware Sync", "Shima Eval (eval|||val)"].forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.innerText = t;
        if (t === triggerW?.value) opt.selected = true;
        tSel.appendChild(opt);
    });

    // Dynamic logic to show/hide eval boxes is removed per user request
    tSel.onchange = () => {
        // Nothing to hide anymore
    };

    tRow.appendChild(tSel);

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:30px;";

    const apply = document.createElement("button");
    apply.innerText = "Save Changes";
    apply.style.cssText = "background:#0084ff; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:bold;";
    apply.onclick = () => {
        cInputs.forEach(c => {
            if (c.widget) c.widget.value = c.input.value;
            if (c.evalWidget) c.evalWidget.value = c.evalInput.value;
        });
        if (triggerW) triggerW.value = tSel.value;
        if (scaleW) {
            const sc = parseFloat(scaleInput.value) || 1.0;
            scaleW.value = sc;
            node.size = [80 * sc, 80 * sc];
            if (node.inputs) node.inputs.forEach((i, idx) => {
                const spacing = node.size[1] / 4;
                i.pos = [0, spacing * (idx + 1)];
            });
        }
        node.setDirtyCanvas(true);
        cleanup();
    };

    const cancel = document.createElement("button");
    cancel.innerText = "Cancel";
    cancel.style.cssText = "background:#333; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer;";
    const cleanup = () => { document.body.removeChild(shade); document.body.removeChild(panel); };
    cancel.onclick = cleanup;
    shade.onclick = cleanup;

    footer.appendChild(cancel); footer.appendChild(apply);
    panel.appendChild(footer);
    document.body.appendChild(shade);
    document.body.appendChild(panel);
}
