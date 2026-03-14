import { app } from "../../scripts/app.js";

/**
 * Shima Switch System - Frontend Extension
 * Implements Breaker controllers and Panel switches with master-slave sync.
 * Refined with "Smart Reroute" patterns for a nuclear minimalist look.
 */

const ASSET_PATH = "/shima/assets/switches/";
const SWITCH_COLORS = ["green", "blue", "orange", "grey", "pink", "yellow"];
const ImageCache = new Map();

function getSwitchImage(color, state) {
    const key = `${color}_${state}`;
    if (ImageCache.has(key)) return ImageCache.get(key);
    const img = new Image();
    img.src = `${ASSET_PATH}${color}_${state}.svg`;
    ImageCache.set(key, img);
    return img;
}

function getBreakerImage(state) {
    const key = `breaker_${state}`;
    if (ImageCache.has(key)) return ImageCache.get(key);
    const img = new Image();
    img.src = `${ASSET_PATH}breaker_${state}.svg`;
    ImageCache.set(key, img);
    return img;
}

// --- Traversal Logic (shared with Bypass) ---
const updateDownstreamBypass = (startNode, isPassing) => {
    const visited = new Set();
    const queue = [];
    if (startNode.outputs && startNode.outputs[0]) {
        const output = startNode.outputs[0];
        if (output.links) {
            for (const linkId of output.links) {
                const link = app.graph.links[linkId];
                if (link) {
                    const targetNode = app.graph.getNodeById(link.target_id);
                    if (targetNode) queue.push(targetNode);
                }
            }
        }
    }
    while (queue.length > 0) {
        const node = queue.shift();
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        if (node.comfyClass === "Shima.PanelSwitch" ||
            node.comfyClass === "Shima.HighwayBypass" ||
            node.comfyClass === "Shima.HighwayBypassTerminator" ||
            node.comfyClass === "Shima.PilotLight" ||
            node.comfyClass === "Shima.MultiStateIndicator" ||
            node.comfyClass === "Shima.RGBIndicator") continue;

        const targetMode = isPassing ? 0 : 4;
        if (node.mode !== targetMode) node.mode = targetMode;

        if (node.outputs) {
            for (const output of node.outputs) {
                if (output.type !== "INT" && output.links) {
                    for (const linkId of output.links) {
                        const link = app.graph.links[linkId];
                        if (link) {
                            const nextNode = app.graph.getNodeById(link.target_id);
                            if (nextNode) queue.push(nextNode);
                        }
                    }
                }
            }
        }
    }
};

app.registerExtension({
    name: "Shima.Switches",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.Breaker" || nodeData.name === "Shima.PanelSwitch") {
            // Apply Nuclear UI Flags
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
            nodeType.layout_slot_offset = 6;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.Breaker" || node.comfyClass === "Shima.PanelSwitch") {
            const isBreaker = node.comfyClass === "Shima.Breaker";

            // --- Styling & Properties ---
            node.properties = node.properties || {};
            node.bgcolor = "#1a1a1a";
            node.boxcolor = "#333";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;

            if (isBreaker) {
                if (node.properties.sync_mode === undefined) node.properties.sync_mode = "B";
                if (node.properties.scale === undefined) node.properties.scale = 1.0;
                const sc = node.properties.scale;
                node.size = [100 * sc, 180 * sc]; // Base size for 75x150 image area
            } else {
                if (!node.properties.color) node.properties.color = "green";
                if (node.properties.scale === undefined) node.properties.scale = 1.0;
                node.size = [90, 170]; // Initial stable size for 60x140 image
            }

            const getW = (name) => node.widgets?.find(w => w.name === name);

            // Nuclear Widget/Label Erasure
            const cleanupUI = () => {
                if (node.widgets) {
                    node.widgets.forEach(w => {
                        w.type = "hidden";
                        w.computeSize = () => [0, -4];
                        w.hidden = true;
                    });
                }
                if (node.inputs) node.inputs.forEach(i => i.label = " ");
                if (node.outputs) node.outputs.forEach(o => o.label = " ");
            };
            cleanupUI();
            setTimeout(cleanupUI, 50);

            // --- Tooltip & Hover ---
            node.onMouseEnter = function () {
                this.is_mouse_over = true;
                this.setDirtyCanvas(true);
            };
            node.onMouseLeave = function () {
                this.is_mouse_over = false;
                this.setDirtyCanvas(true);
            };
            node.onMouseMove = function (e, localPos) {
                if (!this.is_mouse_over) {
                    this.is_mouse_over = true;
                    this.setDirtyCanvas(true);
                }
            };

            // --- Port Positioning ---
            node.onConnectionsChange = function () {
                cleanupUI();
                const pad = node.layout_slot_offset || 6;
                if (isBreaker) {
                    if (this.inputs?.[0]) {
                        this.inputs[0].pos = [this.size[0] / 2, pad];
                        this.inputs[0].color_on = "#aaaaaa";
                        this.inputs[0].color_off = "#888888";
                    }
                    if (this.outputs?.[0]) {
                        this.outputs[0].pos = [this.size[0] / 2, this.size[1] - pad];
                        this.outputs[0].color_on = "#aaaaaa";
                        this.outputs[0].color_off = "#888888";
                    }
                } else {
                    if (this.inputs?.[0]) this.inputs[0].pos = [this.size[0] / 2, pad]; // Top
                    if (this.outputs?.[0]) {
                        // Passthrough port (Bottom-Centerish)
                        this.outputs[0].pos = [this.size[0] / 2, this.size[1] - pad * 3];
                    }
                    if (this.outputs?.[1]) {
                        // Boolean output port (Bottom Right corner)
                        this.outputs[1].pos = [this.size[0] - pad, this.size[1] - pad * 3];
                        this.outputs[1].color_on = "#a05cd6";
                        this.outputs[1].color_off = "#4d2b6b";
                    }
                }
            };

            // --- Synchronization & State ---
            const syncSlaves = (state) => {
                if (!isBreaker) return;
                const output = node.outputs?.[0];
                if (!output || !output.links) return;
                const mode = node.properties.sync_mode;
                output.links.forEach(linkId => {
                    const link = app.graph.links[linkId];
                    if (!link) return;
                    const targetNode = app.graph.getNodeById(link.target_id);
                    if (targetNode && targetNode.comfyClass === "Shima.PanelSwitch") {
                        const targetW = targetNode.widgets?.find(w => w.name === "switch_state");
                        if (targetW) {
                            let newState = (mode === "B") ? state : (targetW.value === 0 ? 1 : 0);
                            targetW.value = newState;
                            if (targetNode.updateState) targetNode.updateState(newState);
                        }
                    }
                });
            };

            node.updateState = function (state) {
                const w = getW(isBreaker ? "breaker_state" : "switch_state");
                if (w) w.value = state;
                if (!isBreaker) {
                    updateDownstreamBypass(this, state === 0);
                } else {
                    syncSlaves(state);
                }
                this.setDirtyCanvas(true, true);
            };

            // --- Rendering ---
            node.onDrawForeground = function (ctx) {
                if (this.flags.collapsed) return;
                const state = getW(isBreaker ? "breaker_state" : "switch_state")?.value || 0;
                const img = isBreaker ? getBreakerImage(state === 0 ? "on" : "off") : getSwitchImage(this.properties.color, state === 0 ? "on" : "off");

                ctx.save();
                if (!isBreaker) {
                    const scale = this.properties.scale || 1.0;
                    const baseW = 60;
                    const baseH = 140; // 1:2.33 ratio
                    const drawW = baseW * scale;
                    const drawH = baseH * scale;

                    this.size = [drawW + 30, drawH + 30];

                    const ox = (this.size[0] - drawW) / 2;
                    const oy = (this.size[1] - drawH) / 2;
                    ctx.drawImage(img, Math.floor(ox), Math.floor(oy), drawW, drawH);

                    // Tooltip Logic
                    if (this.properties.tooltip && this.is_mouse_over) {
                        ctx.font = "12px sans-serif";
                        const tw = ctx.measureText(this.properties.tooltip).width + 20;
                        ctx.fillStyle = "rgba(0,0,0,0.9)";
                        ctx.fillRect(this.size[0] + 5, 10, Math.max(80, tw), 30);
                        ctx.fillStyle = "white";
                        ctx.fillText(this.properties.tooltip, this.size[0] + 15, 30);
                    }
                } else {
                    const scale = this.properties.scale || 1.0;
                    const baseW = 75;
                    const baseH = 150; // 1:2 ratio
                    const drawW = baseW * scale;
                    const drawH = baseH * scale;

                    this.size = [drawW + 55, drawH + 40]; // Increased width for indicator margin

                    const bx = (this.size[0] - drawW) / 2 + (10 * scale); // Shift image slightly right to give indicator room
                    const by = (this.size[1] - drawH) / 2;

                    // Fixed centering with Math.floor to stop toggle jitter
                    ctx.drawImage(img, Math.floor(bx), Math.floor(by), drawW, drawH);

                    // Mode Indicator - Moved to the far left side
                    ctx.fillStyle = "#ffcc00";
                    const fontSize = Math.max(12, Math.floor(28 * scale));
                    ctx.font = `bold ${fontSize}px Arial`;
                    ctx.textAlign = "left";
                    ctx.fillText(this.properties.sync_mode, 12, this.size[1] / 2 + fontSize / 3);
                }
                ctx.restore();
                this.onConnectionsChange();
            };

            // --- Interaction ---
            node.onMouseDown = function (e, localPos) {
                if (e.button !== 0) return; // Only left-click
                const [x, y] = localPos;
                // Hit threshold roughly bounds the main switch plate, adjusting for scale
                let hitYTop = 20;
                let hitYBot = this.size[1] - 20;
                if (isBreaker) {
                    const sc = this.properties.scale || 1.0;
                    hitYTop = 30 * sc;
                    hitYBot = this.size[1] - (30 * sc);
                }
                const hit = (y > hitYTop && y < hitYBot);
                if (hit) {
                    const w = getW(isBreaker ? "breaker_state" : "switch_state");
                    if (w) {
                        this.updateState(w.value === 0 ? 1 : 0);
                        if (w.callback) w.callback(w.value);
                    }
                    return true;
                }
            };

            // Handle Execution Sync (for automated inputs)
            node.onExecuted = function (message) {
                if (message && message.state !== undefined) {
                    const newState = message.state[0];
                    const w = getW(isBreaker ? "breaker_state" : "switch_state");
                    if (w && w.value !== newState) {
                        this.updateState(newState);
                    }
                }
            };

            node.onDblClick = function () {
                showSwitchModal(this);
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Shima: Configure...",
                    callback: () => showSwitchModal(this)
                });
            };
        }
    }
});

function showSwitchModal(node) {
    const isBreaker = node.comfyClass === "Shima.Breaker";
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000;";

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: #111; color: #eee; padding: 30px; border-radius: 12px;
        z-index: 10001; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        border: 1px solid #333; min-width: 320px; font-family: sans-serif;
    `;

    panel.innerHTML = `<h2 style='margin-top:0'>${isBreaker ? "Breaker" : "Switch"} Config</h2>`;
    const controls = [];

    if (!isBreaker) {
        // Color
        const cRow = document.createElement("div");
        cRow.innerHTML = "<b>Color:</b><br>";
        const cSel = document.createElement("select");
        cSel.style.cssText = "width:100%; padding:10px; margin:5px 0 20px 0; background:#222; color:white; border: 1px solid #444;";
        SWITCH_COLORS.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c; opt.innerText = c.charAt(0).toUpperCase() + c.slice(1);
            if (c === node.properties.color) opt.selected = true;
            cSel.appendChild(opt);
        });
        cRow.appendChild(cSel); panel.appendChild(cRow);
        controls.push(() => node.properties.color = cSel.value);

        // Scale
        const sRow = document.createElement("div");
        sRow.innerHTML = "<b>Scale:</b><br>";
        const sInput = document.createElement("input");
        sInput.type = "number"; sInput.min = "0.1"; sInput.max = "20.0"; sInput.step = "0.1";
        sInput.value = node.properties.scale;
        sInput.style.cssText = "width:100%; padding:10px; margin-top:5px; background:#222; color:white; border: 1px solid #444;";
        sRow.appendChild(sInput); panel.appendChild(sRow);
        controls.push(() => node.properties.scale = parseFloat(sInput.value) || 1.0);

        // Tooltip
        const tRow = document.createElement("div");
        tRow.style.marginTop = "20px";
        tRow.innerHTML = "<b>Tooltip Note:</b><br>";
        const tInput = document.createElement("input");
        tInput.type = "text"; tInput.value = node.properties.tooltip || "";
        tInput.style.cssText = "width:100%; padding:10px; margin-top:5px; background:#222; color:white; border:1px solid #444;";
        tRow.appendChild(tInput); panel.appendChild(tRow);
        controls.push(() => node.properties.tooltip = tInput.value);
    } else {
        // Sync Mode
        const mRow = document.createElement("div");
        mRow.innerHTML = "<b>Master Sync Mode:</b><br>";
        const mSel = document.createElement("select");
        mSel.style.cssText = "width:100%; padding:10px; margin:5px 0 25px 0; background:#222; color:white; border: 1px solid #444;";
        [{ k: "B", v: "Breaker (Force Match)" }, { k: "T", v: "Toggle (Invert)" }].forEach(m => {
            const opt = document.createElement("option");
            opt.value = m.k; opt.innerText = m.v;
            if (m.k === node.properties.sync_mode) opt.selected = true;
            mSel.appendChild(opt);
        });
        mRow.appendChild(mSel); panel.appendChild(mRow);
        controls.push(() => node.properties.sync_mode = mSel.value);

        // Scale (Breaker)
        const sRow = document.createElement("div");
        sRow.innerHTML = "<b>Scale:</b><br>";
        const sInput = document.createElement("input");
        sInput.type = "number"; sInput.min = "0.1"; sInput.max = "20.0"; sInput.step = "0.1";
        sInput.value = node.properties.scale || 1.0;
        sInput.style.cssText = "width:100%; padding:10px; margin-top:5px; background:#222; color:white; border: 1px solid #444;";
        sRow.appendChild(sInput); panel.appendChild(sRow);
        controls.push(() => {
            const sc = parseFloat(sInput.value) || 1.0;
            node.properties.scale = sc;
            node.size = [100 * sc, 180 * sc]; // Reset base dimensions
        });
    }

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:30px;";

    const apply = document.createElement("button");
    apply.innerText = "Save Changes";
    apply.style.cssText = "background:#0084ff; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:bold;";
    apply.onclick = () => { controls.forEach(c => c()); node.setDirtyCanvas(true); cleanup(); };

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
