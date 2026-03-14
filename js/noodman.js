import { app } from "../../scripts/app.js";

/**
 * Noodman Sprite Mascot - Frontend Extension
 * Handles sprite sheet loading, frame sequence parsing with repeats, and animated playback.
 */

/**
 * Parse a coordinate string like "A1" into {col, row} (0-indexed).
 */
function parseCoord(coord) {
    coord = coord.trim().toUpperCase();
    const match = coord.match(/^([A-Z])(\d+)$/);
    if (!match) return null;
    const row = match[1].charCodeAt(0) - 65;
    const col = parseInt(match[2]) - 1;
    return { col: Math.max(0, col), row: Math.max(0, row) };
}

/**
 * Expand a range segment like "A1-A10" or "A1-10" or "F8-F1" into frame array.
 */
function expandRange(startStr, endStr, columns) {
    const startCoord = parseCoord(startStr);
    if (!startCoord) return [];

    let endCoord;
    if (/^\d+$/.test(endStr)) {
        endCoord = { col: parseInt(endStr) - 1, row: startCoord.row };
    } else {
        endCoord = parseCoord(endStr);
    }
    if (!endCoord) return [];

    const frames = [];
    const startLinear = startCoord.row * columns + startCoord.col;
    const endLinear = endCoord.row * columns + endCoord.col;

    if (endLinear < startLinear) {
        for (let i = startLinear; i >= endLinear; i--) {
            frames.push({ col: i % columns, row: Math.floor(i / columns) });
        }
    } else {
        for (let i = startLinear; i <= endLinear; i++) {
            frames.push({ col: i % columns, row: Math.floor(i / columns) });
        }
    }
    return frames;
}

/**
 * Parse a frame sequence with repeat notation.
 *
 * Syntax:
 *   A1,A2,A3        -> specific frames (play once per loop)
 *   A1-A10           -> range
 *   A1-A10*3         -> repeat segment 3 times
 *   F8-F1**          -> play once and STOP (hold last frame)
 *   A1-A10*3,C2-C7*1,F8-F1** -> combined timeline
 *
 * Returns { frames: [{col, row}], stopAtEnd: bool }
 *   - If stopAtEnd is true, animation plays once and holds the last frame.
 *   - If stopAtEnd is false, animation loops.
 */
function parseFrameSequence(seqStr, columns) {
    if (!seqStr || !seqStr.trim()) return { frames: [{ col: 0, row: 0 }], stopAtEnd: false };

    const allFrames = [];
    let stopAtEnd = false;

    // Split on commas, but be careful: commas separate segments
    const segments = seqStr.split(",").map(s => s.trim()).filter(Boolean);

    for (const segment of segments) {
        let body = segment;
        let repeats = 1;
        let pingPong = false;

        // Parse modifiers from the end, in order: ** (stop), *< (ping-pong), *N (repeat)
        // Example combos: A1-A10*3*<**  |  A1-A10*<  |  A1-A10*3*<  |  A1-A10**

        // 1. Check for ** (stop) — must check first
        if (body.endsWith("**")) {
            stopAtEnd = true;
            body = body.slice(0, -2);
        }

        // 2. Check for *< (ping-pong)
        if (body.endsWith("*<")) {
            pingPong = true;
            body = body.slice(0, -2);
        }

        // 3. Check for *N (repeat count)
        const repeatMatch = body.match(/^(.+)\*(\d+)$/);
        if (repeatMatch) {
            body = repeatMatch[1];
            repeats = Math.max(1, parseInt(repeatMatch[2]));
        }

        // Parse the body into frames
        let segFrames = [];
        if (body.includes("-")) {
            const dashIdx = body.indexOf("-");
            const startStr = body.substring(0, dashIdx).trim();
            const endStr = body.substring(dashIdx + 1).trim();
            segFrames = expandRange(startStr, endStr, columns);
        } else {
            const coord = parseCoord(body);
            if (coord) segFrames = [coord];
        }

        // Apply ping-pong: append reversed frames (minus endpoints to avoid doubles)
        if (pingPong && segFrames.length > 2) {
            const reversed = segFrames.slice(1, -1).reverse();
            segFrames = [...segFrames, ...reversed];
        }

        // Repeat the segment
        for (let r = 0; r < repeats; r++) {
            allFrames.push(...segFrames);
        }
    }

    return {
        frames: allFrames.length > 0 ? allFrames : [{ col: 0, row: 0 }],
        stopAtEnd
    };
}


app.registerExtension({
    name: "Shima.Noodman",
    async setup() {
        // Listen for execution end to stop animations with stop_after_run
        const onStatus = (e) => {
            const detail = e?.detail;
            if (detail && detail.exec_info && detail.exec_info.queue_remaining === 0) {
                // Execution finished — stop Noodman animations with stop_after_run
                if (app.graph) {
                    for (const node of app.graph._nodes) {
                        if (node.comfyClass === "Shima.NoodmanSticker" && !node._noodmanStopped) {
                            // Skip nodes that have a watch_node_id set (they stop via executed event)
                            const watchW = node.widgets?.find(w => w.name === "watch_node_id");
                            const hasWatch = (watchW?.value || "").trim().length > 0;
                            if (hasWatch) continue;

                            const stopW = node.widgets?.find(w => w.name === "stop_after_run");
                            if (stopW?.value !== false) {
                                node._noodmanStopped = true;
                                node.setDirtyCanvas(true);
                            }
                        }
                    }
                }
            }
        };

        // Listen for individual node execution to stop mascots watching that node
        const onExecuted = (e) => {
            const executedNodeId = e?.detail?.node;
            if (!executedNodeId || !app.graph) return;
            for (const node of app.graph._nodes) {
                if (node.comfyClass === "Shima.NoodmanSticker" && !node._noodmanStopped) {
                    const watchW = node.widgets?.find(w => w.name === "watch_node_id");
                    const watchId = (watchW?.value || "").trim();
                    if (watchId && String(executedNodeId) === watchId) {
                        node._noodmanStopped = true;
                        node.setDirtyCanvas(true);
                    }
                }
            }
        };

        try {
            const { api } = await import("../../scripts/api.js");
            api.addEventListener("status", onStatus);
            api.addEventListener("executed", onExecuted);
        } catch (e) {
            // Fallback: no auto-stop
        }
    },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.NoodmanSticker") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.NoodmanSticker") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = true;

            // Animation state
            node._noodmanState = 0;
            node._noodmanFrameIdx = 0;
            node._noodmanLastTick = 0;
            node._noodmanStopped = false;
            node._noodmanImg = null;
            node._noodmanImgSrc = "";

            const getScale = () => node.widgets?.find(w => w.name === "scale")?.value || 1.0;

            node.size = [80 * getScale(), 80 * getScale()];

            node.computeSize = function () {
                const sc = getScale();
                return [80 * sc, 80 * sc];
            };

            const centerPorts = () => {
                const [w, h] = node.size;
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

            const cleanupUI = () => {
                if (node.widgets) {
                    node.widgets.forEach(w => {
                        w.type = "hidden";
                        w.computeSize = () => [0, -4];
                        w.hidden = true;
                    });
                }
                centerPorts();
            };
            cleanupUI();
            setTimeout(cleanupUI, 50);

            node.onConnectionsChange = function () {
                cleanupUI();
            };

            node.onResize = function () {
                centerPorts();
            };

            node.onExecuted = function (message) {
                if (message && message.state !== undefined) {
                    this._noodmanState = parseInt(message.state[0]) || 0;
                    // Always reset animation on every execution
                    this._noodmanFrameIdx = 0;
                    this._noodmanStopped = false;
                    this._noodmanLastTick = 0;
                    this.setDirtyCanvas(true);
                }
            };

            const ensureImage = (node) => {
                const sheetWidget = node.widgets?.find(w => w.name === "sprite_sheet");
                const sheetName = sheetWidget?.value || "sprite_sheet_test.png";
                const url = `/shima/sprite/${sheetName}`;

                if (node._noodmanImgSrc !== url) {
                    node._noodmanImgSrc = url;
                    node._noodmanImg = null;
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                        node._noodmanImg = img;
                        node.setDirtyCanvas(true);
                    };
                    img.src = url;
                }
                return node._noodmanImg;
            };

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const img = ensureImage(this);
                if (!img || !img.width || !img.height) return;

                const [w, h] = this.size;
                const columns = this.widgets?.find(w => w.name === "columns")?.value || 10;
                const rows = this.widgets?.find(w => w.name === "rows")?.value || 10;
                const fps = this.widgets?.find(w => w.name === "fps")?.value || 8;

                const state = this._noodmanState || 0;
                let animStr;
                if (state === 1) {
                    animStr = this.widgets?.find(w => w.name === "anim_state1")?.value || "A1-A10";
                } else if (state === 2) {
                    animStr = this.widgets?.find(w => w.name === "anim_state2")?.value || "B1-B10";
                } else {
                    animStr = this.widgets?.find(w => w.name === "anim_idle")?.value || "A1";
                }

                const { frames, stopAtEnd } = parseFrameSequence(animStr, columns);

                // Advance frame based on FPS
                const now = performance.now();
                if (fps > 0 && frames.length > 1 && !this._noodmanStopped) {
                    const interval = 1000 / fps;
                    if (now - this._noodmanLastTick >= interval) {
                        const nextIdx = this._noodmanFrameIdx + 1;
                        if (nextIdx >= frames.length) {
                            if (stopAtEnd) {
                                // Hold on last frame
                                this._noodmanFrameIdx = frames.length - 1;
                                this._noodmanStopped = true;
                            } else {
                                // Loop
                                this._noodmanFrameIdx = 0;
                            }
                        } else {
                            this._noodmanFrameIdx = nextIdx;
                        }
                        this._noodmanLastTick = now;
                    }
                }

                const frameIdx = Math.min(this._noodmanFrameIdx, frames.length - 1);
                const frame = frames[frameIdx];

                const sw = img.width / columns;
                const sh = img.height / rows;
                const sx = frame.col * sw;
                const sy = frame.row * sh;

                ctx.save();
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
                ctx.restore();

                // Keep redrawing if animating
                if (fps > 0 && frames.length > 1 && !this._noodmanStopped) {
                    this.setDirtyCanvas(true, true);
                }
            };

            node.onDblClick = function () {
                showNoodmanModal(this);
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Shima: Configure Noodman...",
                    callback: () => showNoodmanModal(this)
                });
            };
        }
    }
});


function showNoodmanModal(node) {
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000;";

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: #111; color: #eee; padding: 30px; border-radius: 12px;
        z-index: 10001; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        border: 1px solid #333; min-width: 420px; max-height: 85vh; overflow-y: auto;
        font-family: sans-serif;
    `;

    panel.innerHTML = `<h2 style='margin-top:0'>🍜 Noodman Config</h2>`;

    const createRow = (labelStr, hint) => {
        const row = document.createElement("div");
        row.style.marginBottom = "15px";
        const l = document.createElement("b");
        l.style.cssText = "font-size:12px; color:#aaa; display:block; margin-bottom:5px;";
        l.innerText = labelStr;
        row.appendChild(l);
        if (hint) {
            const h = document.createElement("div");
            h.style.cssText = "font-size:10px; color:#555; margin-bottom:5px; font-style:italic;";
            h.innerText = hint;
            row.appendChild(h);
        }
        panel.appendChild(row);
        return row;
    };

    const createTextInput = (widgetName, placeholder) => {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = placeholder || "";
        const w = node.widgets?.find(w => w.name === widgetName);
        input.value = w?.value || "";
        input.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444; box-sizing:border-box; font-family:monospace;";
        return { input, widget: w };
    };

    // Sprite Sheet — file chooser dropdown
    const sheetW = node.widgets?.find(w => w.name === "sprite_sheet");
    const sheetRow = createRow("Sprite Sheet");
    const sheetSelect = document.createElement("select");
    sheetSelect.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444;";

    // Populate from widget options (ComfyUI COMBO widget stores options)
    const sheetOptions = sheetW?.options?.values || [];
    if (sheetOptions.length > 0) {
        sheetOptions.forEach(opt => {
            const o = document.createElement("option");
            o.value = opt;
            o.innerText = opt;
            if (opt === sheetW?.value) o.selected = true;
            sheetSelect.appendChild(o);
        });
    } else {
        // Fallback: just show current value
        const o = document.createElement("option");
        o.value = sheetW?.value || "";
        o.innerText = sheetW?.value || "(none)";
        o.selected = true;
        sheetSelect.appendChild(o);
    }
    sheetRow.appendChild(sheetSelect);

    // Grid Size
    const gridRow = createRow("Grid Size");
    const gridContainer = document.createElement("div");
    gridContainer.style.display = "flex";
    gridContainer.style.gap = "10px";

    const colInput = document.createElement("input");
    colInput.type = "number"; colInput.min = "1"; colInput.max = "64";
    const colW = node.widgets?.find(w => w.name === "columns");
    colInput.value = colW?.value || 10;
    colInput.style.cssText = "flex:1; padding:10px; background:#222; color:white; border:1px solid #444; box-sizing:border-box;";
    const colLabel = document.createElement("span");
    colLabel.innerText = "Cols";
    colLabel.style.cssText = "color:#666; align-self:center; font-size:11px;";

    const rowInput = document.createElement("input");
    rowInput.type = "number"; rowInput.min = "1"; rowInput.max = "64";
    const rowW = node.widgets?.find(w => w.name === "rows");
    rowInput.value = rowW?.value || 10;
    rowInput.style.cssText = "flex:1; padding:10px; background:#222; color:white; border:1px solid #444; box-sizing:border-box;";
    const rowLabel = document.createElement("span");
    rowLabel.innerText = "Rows";
    rowLabel.style.cssText = "color:#666; align-self:center; font-size:11px;";

    gridContainer.appendChild(colInput);
    gridContainer.appendChild(colLabel);
    gridContainer.appendChild(rowInput);
    gridContainer.appendChild(rowLabel);
    gridRow.appendChild(gridContainer);

    // Animation Sequences
    const animHint = "A1,A2 (specific) | A1-A10 (range) | *3 (repeat 3×) | *< (ping-pong) | ** (stop)";

    const idleRow = createRow("Idle Animation (Off State)", animHint);
    const idleField = createTextInput("anim_idle", "A1");
    idleRow.appendChild(idleField.input);

    const s1Row = createRow("State 1 Animation");
    const s1Field = createTextInput("anim_state1", "A1-A10*3,C1-C5**");
    s1Row.appendChild(s1Field.input);

    const s2Row = createRow("State 2 Animation");
    const s2Field = createTextInput("anim_state2", "B1-B10");
    s2Row.appendChild(s2Field.input);

    // Trigger Type
    const tRow = createRow("Trigger Type");
    const tSel = document.createElement("select");
    tSel.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444;";
    const triggerW = node.widgets?.find(w => w.name === "trigger_type");
    ["Hardware Sync", "Number Match", "Math", "String", "Regex", "Boolean"].forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.innerText = t;
        if (t === triggerW?.value) opt.selected = true;
        tSel.appendChild(opt);
    });
    tRow.appendChild(tSel);

    // State Values (conditional)
    const valContainer = document.createElement("div");
    panel.appendChild(valContainer);
    const state1W = node.widgets?.find(w => w.name === "state_1_value");
    const state2W = node.widgets?.find(w => w.name === "state_2_value");

    let val1Input, val2Input;
    const placeholders = {
        "Number Match": ["1.0", "2.0"],
        "Math": [">1.0", ">2.0"],
        "String": ["hello", "goodbye"],
        "Regex": ["^error", "^warn"],
    };

    const updateValueFields = () => {
        valContainer.innerHTML = "";
        const mode = tSel.value;
        if (mode === "Hardware Sync" || mode === "Boolean") return;

        const ph = placeholders[mode] || ["", ""];

        const v1Row = document.createElement("div");
        v1Row.style.marginBottom = "15px";
        const v1Label = document.createElement("b");
        v1Label.style.cssText = "font-size:12px; color:#aaa; display:block; margin-bottom:5px;";
        v1Label.innerText = "State 1 Trigger Value";
        v1Row.appendChild(v1Label);
        val1Input = document.createElement("input"); val1Input.type = "text";
        val1Input.placeholder = ph[0];
        val1Input.value = state1W?.value || "";
        val1Input.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444; box-sizing:border-box;";
        v1Row.appendChild(val1Input);
        valContainer.appendChild(v1Row);

        const v2Row = document.createElement("div");
        v2Row.style.marginBottom = "15px";
        const v2Label = document.createElement("b");
        v2Label.style.cssText = "font-size:12px; color:#aaa; display:block; margin-bottom:5px;";
        v2Label.innerText = "State 2 Trigger Value";
        v2Row.appendChild(v2Label);
        val2Input = document.createElement("input"); val2Input.type = "text";
        val2Input.placeholder = ph[1];
        val2Input.value = state2W?.value || "";
        val2Input.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444; box-sizing:border-box;";
        v2Row.appendChild(val2Input);
        valContainer.appendChild(v2Row);
    };

    tSel.addEventListener("change", updateValueFields);
    updateValueFields();

    // FPS
    const fpsRow = createRow("Playback Speed (FPS)");
    const fpsInput = document.createElement("input");
    fpsInput.type = "range"; fpsInput.min = "0"; fpsInput.max = "30"; fpsInput.step = "1";
    const fpsW = node.widgets?.find(w => w.name === "fps");
    fpsInput.value = fpsW?.value || 8;
    fpsInput.style.cssText = "width:calc(100% - 50px); vertical-align:middle;";
    const fpsDisplay = document.createElement("span");
    fpsDisplay.style.cssText = "color:#0af; font-family:monospace; margin-left:10px; font-size:14px;";
    fpsDisplay.innerText = `${fpsInput.value} fps`;
    fpsInput.addEventListener("input", () => { fpsDisplay.innerText = `${fpsInput.value} fps`; });
    fpsRow.appendChild(fpsInput);
    fpsRow.appendChild(fpsDisplay);

    // Stop After Run checkbox
    const stopRow = createRow("Stop After Run", "Freeze animation when workflow execution finishes (unless sequence uses **)");
    const stopLabel = document.createElement("label");
    stopLabel.style.cssText = "display:flex; align-items:center; gap:10px; cursor:pointer;";
    const stopCheck = document.createElement("input");
    stopCheck.type = "checkbox";
    const stopW = node.widgets?.find(w => w.name === "stop_after_run");
    stopCheck.checked = stopW?.value !== false;
    stopCheck.style.cssText = "width:18px; height:18px; accent-color:#0af; cursor:pointer;";
    const stopText = document.createElement("span");
    stopText.innerText = "Enabled";
    stopText.style.cssText = "color:#888; font-size:12px;";
    stopLabel.appendChild(stopCheck);
    stopLabel.appendChild(stopText);
    stopRow.appendChild(stopLabel);

    // Watch Node ID
    const watchRow = createRow("Watch Node ID", "Stop animation when this specific node finishes execution (overrides Stop After Run)");
    const watchInput = document.createElement("input");
    watchInput.type = "text";
    watchInput.placeholder = "e.g. 42";
    const watchW = node.widgets?.find(w => w.name === "watch_node_id");
    watchInput.value = watchW?.value || "";
    watchInput.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444; box-sizing:border-box; font-family:monospace;";
    watchRow.appendChild(watchInput);

    // Scale
    const scaleRow = createRow("Display Scale");
    const scaleInput = document.createElement("input");
    scaleInput.type = "number"; scaleInput.step = "0.1"; scaleInput.min = "0.1"; scaleInput.max = "10";
    const scaleW = node.widgets?.find(w => w.name === "scale");
    scaleInput.value = scaleW?.value || 1.0;
    scaleInput.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444; box-sizing:border-box;";
    scaleRow.appendChild(scaleInput);

    // Footer
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:30px;";

    const apply = document.createElement("button");
    apply.innerText = "Save Changes";
    apply.style.cssText = "background:#0084ff; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:bold;";
    apply.onclick = () => {
        // Save sprite sheet
        if (sheetW) sheetW.value = sheetSelect.value;
        // Force image reload
        node._noodmanImgSrc = "";

        if (colW) colW.value = parseInt(colInput.value) || 10;
        if (rowW) rowW.value = parseInt(rowInput.value) || 10;
        if (idleField.widget) idleField.widget.value = idleField.input.value;
        if (s1Field.widget) s1Field.widget.value = s1Field.input.value;
        if (s2Field.widget) s2Field.widget.value = s2Field.input.value;
        if (triggerW) triggerW.value = tSel.value;
        if (val1Input && state1W) state1W.value = val1Input.value;
        if (val2Input && state2W) state2W.value = val2Input.value;
        if (fpsW) fpsW.value = parseInt(fpsInput.value) || 8;
        if (stopW) stopW.value = stopCheck.checked;
        if (watchW) watchW.value = watchInput.value.trim();
        if (scaleW) {
            const sc = parseFloat(scaleInput.value) || 1.0;
            scaleW.value = sc;
            node.size = [80 * sc, 80 * sc];
        }

        node._noodmanFrameIdx = 0;
        node._noodmanLastTick = 0;
        node._noodmanStopped = false;
        node.setDirtyCanvas(true);
        cleanup();
    };

    const cancel = document.createElement("button");
    cancel.innerText = "Cancel";
    cancel.style.cssText = "background:#333; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer;";
    const cleanup = () => { document.body.removeChild(shade); document.body.removeChild(panel); };
    cancel.onclick = cleanup;
    shade.onclick = cleanup;

    footer.appendChild(cancel);
    footer.appendChild(apply);
    panel.appendChild(footer);
    document.body.appendChild(shade);
    document.body.appendChild(panel);
}
