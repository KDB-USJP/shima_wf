import { app } from "../../scripts/app.js";

/**
 * Shima Multi-State Indicator - Frontend Extension
 * 3-State status indicator with rounded-square housing.
 * Supports 6 trigger modes with configurable evaluation values.
 */

function adjustColor(hex, factor) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    r = Math.min(255, Math.max(0, Math.floor(r * factor)));
    g = Math.min(255, Math.max(0, Math.floor(g * factor)));
    b = Math.min(255, Math.max(0, Math.floor(b * factor)));

    return `rgb(${r},${g},${b})`;
}

app.registerExtension({
    name: "Shima.MultiStateIndicator",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.MultiStateIndicator") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.MultiStateIndicator") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;

            const initialScale = node.widgets?.find(w => w.name === "scale")?.value || 1.0;
            node.size = [60 * initialScale, 60 * initialScale];

            node.computeSize = function () {
                const sc = node.widgets?.find(w => w.name === "scale")?.value || 1.0;
                return [60 * sc, 60 * sc];
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
                    node.inputs.forEach(i => {
                        i.label = " ";
                        i.pos = [0, h / 2];
                    });
                }
                if (node.outputs) {
                    node.outputs.forEach(o => {
                        o.label = " ";
                        o.pos = [w, h / 2];
                    });
                }
            };
            cleanupUI();
            setTimeout(cleanupUI, 50);

            node.onConnectionsChange = function () {
                cleanupUI();
            };

            node.updateState = function (state) {
                this._litState = parseInt(state) || 0; // 0, 1, 2
                this.setDirtyCanvas(true);
            };

            node.onExecuted = function (message) {
                if (message && message.state !== undefined) {
                    this.updateState(message.state[0]);
                }
            };

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;
                const [w, h] = this.size;
                const cx = w / 2;
                const cy = h / 2;
                const scale = this.widgets?.find(w => w.name === "scale")?.value || 1.0;

                const baseRad = (30 * 0.7) * scale;
                const cornerRadius = baseRad * 0.3;
                const color1 = this.widgets?.find(w => w.name === "color_1")?.value || "#00ff00";
                const color2 = this.widgets?.find(w => w.name === "color_2")?.value || "#ff0000";
                const colorOff = this.widgets?.find(w => w.name === "color_off")?.value || "#222222";

                let isLitState = this._litState || 0;
                const triggerType = this.widgets?.find(w => w.name === "trigger_type")?.value;

                // --- Hardware Sync (Real-time Link Traversal) ---
                if (triggerType === "Hardware Sync") {
                    isLitState = 0;
                    if (this.inputs?.[0]?.link) {
                        const link = app.graph.links[this.inputs[0].link];
                        if (link) {
                            const sourceNode = app.graph.getNodeById(link.origin_id);
                            if (sourceNode) {
                                const sw = sourceNode.widgets?.find(w => w.name === "switch_state" || w.name === "breaker_state");
                                if (sw !== undefined) {
                                    isLitState = (sw.value === 0) ? 1 : 2;
                                } else {
                                    if (sourceNode.mode === 0) isLitState = 1;
                                    else if (sourceNode.mode === 2 || sourceNode.mode === 4) isLitState = 0;
                                }
                            }
                        }
                    }
                }

                ctx.save();

                // Helper: draw rounded rectangle path
                const drawRoundedRect = (x, y, rw, rh, cr) => {
                    ctx.beginPath();
                    ctx.moveTo(x + cr, y);
                    ctx.lineTo(x + rw - cr, y);
                    ctx.quadraticCurveTo(x + rw, y, x + rw, y + cr);
                    ctx.lineTo(x + rw, y + rh - cr);
                    ctx.quadraticCurveTo(x + rw, y + rh, x + rw - cr, y + rh);
                    ctx.lineTo(x + cr, y + rh);
                    ctx.quadraticCurveTo(x, y + rh, x, y + rh - cr);
                    ctx.lineTo(x, y + cr);
                    ctx.quadraticCurveTo(x, y, x + cr, y);
                    ctx.closePath();
                };

                // 1. Housing (Industrial Ring) — rounded square
                const housingSize = baseRad * 2.3;
                const hx = cx - housingSize / 2;
                const hy = cy - housingSize / 2;
                const housingCorner = cornerRadius * 1.5;

                drawRoundedRect(hx, hy, housingSize, housingSize, housingCorner);
                const ringGrad = ctx.createLinearGradient(hx, hy, hx + housingSize, hy + housingSize);
                ringGrad.addColorStop(0, "#666");
                ringGrad.addColorStop(1, "#222");
                ctx.fillStyle = ringGrad;
                ctx.fill();
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.stroke();

                // 2. The Lens — rounded square
                const lensSize = baseRad * 2;
                const lx = cx - lensSize / 2;
                const ly = cy - lensSize / 2;

                let activeColor = colorOff;
                if (isLitState === 1) activeColor = color1;
                else if (isLitState === 2) activeColor = color2;

                drawRoundedRect(lx, ly, lensSize, lensSize, cornerRadius);

                if (isLitState > 0) {
                    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, lensSize * 0.7);
                    glowGrad.addColorStop(0, "#fff");
                    glowGrad.addColorStop(0.2, adjustColor(activeColor, 1.3));
                    glowGrad.addColorStop(0.8, activeColor);
                    glowGrad.addColorStop(1, adjustColor(activeColor, 0.4));
                    ctx.fillStyle = glowGrad;
                    ctx.shadowBlur = 25 * scale;
                    ctx.shadowColor = activeColor;
                } else {
                    const darkGrad = ctx.createRadialGradient(cx, cy - lensSize * 0.1, 0, cx, cy, lensSize * 0.7);
                    darkGrad.addColorStop(0, adjustColor(activeColor, 1.2));
                    darkGrad.addColorStop(1, activeColor);
                    ctx.fillStyle = darkGrad;
                    ctx.shadowBlur = 0;
                }
                ctx.fill();

                // Specular highlight (top-left)
                if (isLitState === 0) {
                    const hlSize = lensSize * 0.15;
                    const hlX = lx + lensSize * 0.2;
                    const hlY = ly + lensSize * 0.2;
                    ctx.beginPath();
                    ctx.arc(hlX, hlY, hlSize, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(255,255,255,0.1)";
                    ctx.fill();
                }

                // Inner bevel
                drawRoundedRect(lx + lensSize * 0.08, ly + lensSize * 0.08, lensSize * 0.84, lensSize * 0.84, cornerRadius * 0.7);
                ctx.strokeStyle = (isLitState > 0) ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.4)";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.restore();
            };

            node.onDblClick = function () {
                showMultiLightModal(this);
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Shima: Configure Indicator...",
                    callback: () => showMultiLightModal(this)
                });
            };
        }
    }
});

function showMultiLightModal(node) {
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000;";

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: #111; color: #eee; padding: 30px; border-radius: 12px;
        z-index: 10001; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        border: 1px solid #333; min-width: 380px; font-family: sans-serif;
    `;

    panel.innerHTML = `<h2 style='margin-top:0'>Multi-State Indicator Config</h2>`;

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

    const colorNames = ["State 1 (ON)", "State 2 (OFF)", "Disabled/Off"];
    const tNames = ["color_1", "color_2", "color_off"];
    const cInputs = [];

    tNames.forEach((tName, i) => {
        const cBox = document.createElement("div"); cBox.style.flex = "1";
        cBox.innerHTML = `<b style='font-size:10px; color:#aaa; display:block; margin-bottom:5px; text-align:center;'>${colorNames[i]}</b>`;
        const cInput = document.createElement("input"); cInput.type = "color";
        const w = node.widgets?.find(w => w.name === tName);
        cInput.value = w?.value || (i === 0 ? "#00ff00" : (i === 1 ? "#ff0000" : "#222222"));
        cInput.style.cssText = "width:100%; height:30px; border:none; background:none; cursor:pointer;";
        cBox.appendChild(cInput);
        cRow.appendChild(cBox);
        cInputs.push({ input: cInput, widget: w });
    });
    panel.appendChild(cRow);

    // Scale
    const sRow = createRow("Scale (Size)");
    const scaleInput = document.createElement("input"); scaleInput.type = "number"; scaleInput.step = "0.1"; scaleInput.min = "0.1"; scaleInput.max = "10";
    const scaleW = node.widgets?.find(w => w.name === "scale");
    scaleInput.value = scaleW?.value || 1.0;
    scaleInput.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444; box-sizing:border-box;";
    sRow.appendChild(scaleInput);

    // Trigger Type
    const tRow = createRow("Trigger Type");
    const tSel = document.createElement("select");
    tSel.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444;";
    const triggerW = node.widgets?.find(w => w.name === "trigger_type");
    const allModes = ["Hardware Sync", "Number Match", "Math", "String", "Regex", "Boolean"];
    allModes.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.innerText = t;
        if (t === triggerW?.value) opt.selected = true;
        tSel.appendChild(opt);
    });
    tRow.appendChild(tSel);

    // State Value Fields
    const valContainer = document.createElement("div");
    valContainer.style.marginTop = "15px";
    panel.appendChild(valContainer);

    const state1W = node.widgets?.find(w => w.name === "state_1_value");
    const state2W = node.widgets?.find(w => w.name === "state_2_value");

    const placeholders = {
        "Number Match": ["1.0", "2.0"],
        "Math": [">1.0", ">2.0"],
        "String": ["hello", "goodbye"],
        "Regex": ["^error", "^warn"],
    };

    let val1Input, val2Input;

    const updateValueFields = () => {
        valContainer.innerHTML = "";
        const mode = tSel.value;

        // No value fields for Hardware Sync or Boolean
        if (mode === "Hardware Sync" || mode === "Boolean") return;

        const ph = placeholders[mode] || ["", ""];

        const v1Row = document.createElement("div");
        v1Row.style.marginBottom = "15px";
        const v1Label = document.createElement("b");
        v1Label.style.cssText = "font-size:12px; color:#aaa; display:block; margin-bottom:5px;";
        v1Label.innerText = "State 1 Value";
        v1Row.appendChild(v1Label);
        val1Input = document.createElement("input"); val1Input.type = "text";
        val1Input.placeholder = ph[0];
        val1Input.value = state1W?.value || "";
        val1Input.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444; box-sizing:border-box;";
        v1Row.appendChild(val1Input);
        valContainer.appendChild(v1Row);

        const v2Row = document.createElement("div");
        v2Row.style.marginBottom = "15px";
        const v2Label = document.createElement("b");
        v2Label.style.cssText = "font-size:12px; color:#aaa; display:block; margin-bottom:5px;";
        v2Label.innerText = "State 2 Value";
        v2Row.appendChild(v2Label);
        val2Input = document.createElement("input"); val2Input.type = "text";
        val2Input.placeholder = ph[1];
        val2Input.value = state2W?.value || "";
        val2Input.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444; box-sizing:border-box;";
        v2Row.appendChild(val2Input);
        valContainer.appendChild(v2Row);

        // Mode hint
        const hintMap = {
            "Number Match": "Exact numeric equality check.",
            "Math": "Comparison: >, <, >=, <=, ==, != followed by a number.",
            "String": "Exact string match against the input.",
            "Regex": "Regular expression pattern match (re.search).",
        };
        if (hintMap[mode]) {
            const hint = document.createElement("div");
            hint.style.cssText = "font-size:11px; color:#666; font-style:italic; margin-top:-5px;";
            hint.innerText = hintMap[mode];
            valContainer.appendChild(hint);
        }
    };

    tSel.addEventListener("change", updateValueFields);
    updateValueFields();

    // Footer
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:30px;";

    const apply = document.createElement("button");
    apply.innerText = "Save Changes";
    apply.style.cssText = "background:#0084ff; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:bold;";
    apply.onclick = () => {
        cInputs.forEach(c => {
            if (c.widget) c.widget.value = c.input.value;
        });
        if (triggerW) triggerW.value = tSel.value;
        if (scaleW) {
            const sc = parseFloat(scaleInput.value) || 1.0;
            scaleW.value = sc;
            node.size = [60 * sc, 60 * sc];
            if (node.inputs) node.inputs.forEach(i => i.pos = [0, node.size[1] / 2]);
            if (node.outputs) node.outputs.forEach(o => o.pos = [node.size[0], node.size[1] / 2]);
        }
        // Save state values
        if (val1Input && state1W) state1W.value = val1Input.value;
        if (val2Input && state2W) state2W.value = val2Input.value;

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
