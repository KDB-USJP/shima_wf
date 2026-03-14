import { app } from "../../scripts/app.js";

/**
 * Shima Pilot Light - Frontend Extension
 * Volumetric status indicator with real-time glow.
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
    name: "Shima.PilotLight",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.PilotLight") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.PilotLight") {
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
                        i.color_on = "#aaaaaa";
                        i.color_off = "#888888";
                    });
                }
            };
            cleanupUI();
            setTimeout(cleanupUI, 50);

            node.onConnectionsChange = function () {
                cleanupUI();
            };

            node.updateState = function (state) {
                this._lit = !!state;
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

                // Base radius relative to 60x60 size
                const baseRad = (30 * 0.7) * scale;
                const baseColor = this.widgets?.find(w => w.name === "base_color")?.value || "#ff0000";

                let isLit = this._lit;
                const triggerType = this.widgets?.find(w => w.name === "trigger_type")?.value;

                // --- Hardware Sync (Real-time Link Traversal) ---
                if (triggerType === "Hardware Sync") {
                    isLit = false; // Default off
                    if (this.inputs?.[0]?.link) {
                        const link = app.graph.links[this.inputs[0].link];
                        if (link) {
                            const sourceNode = app.graph.getNodeById(link.origin_id);
                            if (sourceNode) {
                                // 1. Check if it's a Shima Switch
                                const sw = sourceNode.widgets?.find(w => w.name === "switch_state" || w.name === "breaker_state");
                                if (sw !== undefined) {
                                    isLit = (sw.value === 0); // Shima: 0 is ON, 1 is BYPASS/OFF
                                } else {
                                    // 2. Check standard ComfyUI Mode
                                    if (sourceNode.mode === 0) isLit = true; // Always
                                    else if (sourceNode.mode === 2 || sourceNode.mode === 4) isLit = false; // Never/Bypass
                                }
                            }
                        }
                    }
                }

                ctx.save();

                // 1. Housing (Industrial Ring)
                ctx.beginPath();
                ctx.arc(cx, cy, baseRad * 1.15, 0, Math.PI * 2);
                const ringGrad = ctx.createLinearGradient(cx - baseRad, cy - baseRad, cx + baseRad, cy + baseRad);
                ringGrad.addColorStop(0, "#555");
                ringGrad.addColorStop(1, "#111");
                ctx.fillStyle = ringGrad;
                ctx.fill();
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.stroke();

                // 2. The Bulb
                ctx.beginPath();
                ctx.arc(cx, cy, baseRad, 0, Math.PI * 2);

                if (isLit) {
                    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRad);
                    glowGrad.addColorStop(0, "#fff");
                    glowGrad.addColorStop(0.2, adjustColor(baseColor, 1.3));
                    glowGrad.addColorStop(0.8, baseColor);
                    glowGrad.addColorStop(1, adjustColor(baseColor, 0.4));
                    ctx.fillStyle = glowGrad;
                    ctx.shadowBlur = 25 * scale;
                    ctx.shadowColor = baseColor;
                } else {
                    const darkGrad = ctx.createRadialGradient(cx, cy - baseRad * 0.2, 0, cx, cy, baseRad);
                    darkGrad.addColorStop(0, adjustColor(baseColor, 0.4));
                    darkGrad.addColorStop(1, adjustColor(baseColor, 0.1));
                    ctx.fillStyle = darkGrad;
                    ctx.shadowBlur = 0;
                }
                ctx.fill();

                if (!isLit) {
                    ctx.beginPath();
                    ctx.arc(cx - baseRad * 0.3, cy - baseRad * 0.3, baseRad * 0.15, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(255,255,255,0.1)";
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(cx, cy, baseRad * 0.85, 0, Math.PI * 2);
                ctx.strokeStyle = isLit ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.3)";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.restore();
            };

            node.onDblClick = function () {
                showLightModal(this);
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Shima: Configure Light...",
                    callback: () => showLightModal(this)
                });
            };
        }
    }
});

function showLightModal(node) {
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000;";

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: #111; color: #eee; padding: 30px; border-radius: 12px;
        z-index: 10001; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        border: 1px solid #333; min-width: 320px; font-family: sans-serif;
    `;

    panel.innerHTML = `<h2 style='margin-top:0'>Pilot Light Config</h2>`;

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

    // Color & Scale Row
    const csRow = document.createElement("div");
    csRow.style.display = "flex"; csRow.style.gap = "15px"; csRow.style.marginBottom = "15px";

    const cBox = document.createElement("div"); cBox.style.flex = "2";
    cBox.innerHTML = "<b style='font-size:12px; color:#aaa; display:block; margin-bottom:5px;'>Base Light Color</b>";
    const colorInput = document.createElement("input"); colorInput.type = "color";
    const baseW = node.widgets?.find(w => w.name === "base_color");
    colorInput.value = baseW?.value || "#ff0000";
    colorInput.style.cssText = "width:100%; height:40px; border:none; background:none; cursor:pointer;";
    cBox.appendChild(colorInput);

    const sBox = document.createElement("div"); sBox.style.flex = "1";
    sBox.innerHTML = "<b style='font-size:12px; color:#aaa; display:block; margin-bottom:5px;'>Scale</b>";
    const scaleInput = document.createElement("input"); scaleInput.type = "number"; scaleInput.step = "0.1"; scaleInput.min = "0.1"; scaleInput.max = "10";
    const scaleW = node.widgets?.find(w => w.name === "scale");
    scaleInput.value = scaleW?.value || 1.0;
    scaleInput.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444; box-sizing:border-box;";
    sBox.appendChild(scaleInput);

    csRow.appendChild(cBox); csRow.appendChild(sBox);
    panel.appendChild(csRow);

    // Trigger Type
    const tRow = createRow("Trigger Type");
    const tSel = document.createElement("select");
    tSel.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444;";
    const triggerW = node.widgets?.find(w => w.name === "trigger_type");
    ["Boolean", "String Match", "Number Match", "Tensor Detect", "Hardware Sync", "Always On"].forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.innerText = t;
        if (t === triggerW?.value) opt.selected = true;
        tSel.appendChild(opt);
    });
    tRow.appendChild(tSel);

    // Comparison Value
    const vRow = createRow("Comparison Value (e.g. >9, =err)");
    const vInput = document.createElement("input");
    vInput.type = "text";
    const compW = node.widgets?.find(w => w.name === "comparison_value");
    vInput.value = compW?.value || "";
    vInput.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444; box-sizing:border-box;";
    vRow.appendChild(vInput);

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:30px;";

    const apply = document.createElement("button");
    apply.innerText = "Save Changes";
    apply.style.cssText = "background:#0084ff; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:bold;";
    apply.onclick = () => {
        if (baseW) baseW.value = colorInput.value;
        if (triggerW) triggerW.value = tSel.value;
        if (compW) compW.value = vInput.value;
        if (scaleW) {
            const sc = parseFloat(scaleInput.value) || 1.0;
            scaleW.value = sc;
            node.size = [60 * sc, 60 * sc];
            if (node.inputs) node.inputs.forEach(i => i.pos = [0, node.size[1] / 2]);
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
