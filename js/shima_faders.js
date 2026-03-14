import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Shima.Fader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.Fader") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.Fader") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;

            // Fader Base Definition
            const BASE_W = 90;
            const BASE_H = 300;

            node.size = [BASE_W, BASE_H];
            node.computeSize = function () {
                const sc = this.properties?.scale || 1.0;
                return [BASE_W * sc, BASE_H * sc];
            };

            // Hide native widgets
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

            const configurePorts = () => {
                const pad = node.layout_slot_offset || 6;
                const sc = node.properties?.scale || 1.0;
                // Move outputs to the top edge
                if (node.outputs) {
                    node.outputs.forEach((o, i) => {
                        o.label = " ";
                        o.pos = [(BASE_W * sc) - (30 * sc) + (i * 15 * sc), pad];
                    });
                }
            };

            // Call immediately and queue to override LG default placement
            if (node.outputs) configurePorts();
            setTimeout(configurePorts, 50);

            node.onConnectionsChange = function () {
                cleanupUI();
                configurePorts();
            };

            // Render details
            const BASE_T_Y_START = 40;
            const BASE_T_Y_END = 240; // Base H(300) - 60

            function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const sc = this.properties?.scale || 1.0;
                const W = 90 * sc;
                const H = 300 * sc;

                const T_Y_START = BASE_T_Y_START * sc;
                const T_Y_END = BASE_T_Y_END * sc;
                const T_LEN = T_Y_END - T_Y_START;

                // Get values
                const wInput = node.widgets?.find(w => w.name === "value");
                if (!wInput) return;

                let val = parseFloat(wInput.value) || 0.0;
                const minV = parseFloat(node.widgets?.find(w => w.name === "min_val")?.value) || 0;
                const maxV = parseFloat(node.widgets?.find(w => w.name === "max_val")?.value) || 1;

                // Colors
                const rColor = node.widgets?.find(w => w.name === "readout_color")?.value || "#ffaa00";
                const l1Color = node.widgets?.find(w => w.name === "led_1_color")?.value || "#00ff00"; // bottom
                const l1Max = parseFloat(node.widgets?.find(w => w.name === "led_1_max")?.value) || 0.6;
                const l2Color = node.widgets?.find(w => w.name === "led_2_color")?.value || "#ffff00"; // middle
                const l2Max = parseFloat(node.widgets?.find(w => w.name === "led_2_max")?.value) || 0.8;
                const l3Color = node.widgets?.find(w => w.name === "led_3_color")?.value || "#ff0000"; // top

                // Normalization
                let pct = 0;
                if (maxV > minV) {
                    pct = clamp((val - minV) / (maxV - minV), 0, 1);
                }

                ctx.save();

                // 1. Chassis Background
                ctx.fillStyle = "#1e1e1e";
                ctx.beginPath();
                ctx.roundRect(0, 0, W, H, 8 * sc);
                ctx.fill();
                ctx.strokeStyle = "#111";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                // 2. Fader Track
                const trackX = W / 2;
                ctx.fillStyle = "#000";
                ctx.beginPath();
                ctx.roundRect(trackX - (6 * sc), T_Y_START - (10 * sc), 12 * sc, T_LEN + (20 * sc), 6 * sc);
                ctx.fill();
                ctx.strokeStyle = "#444";
                ctx.lineWidth = 1 * sc;
                ctx.stroke();

                // inner shadow emulation on track
                ctx.strokeStyle = "#080808";
                ctx.beginPath();
                ctx.moveTo(trackX - (5 * sc), T_Y_START - (9 * sc));
                ctx.lineTo(trackX - (5 * sc), T_Y_END + (9 * sc));
                ctx.stroke();

                // 3. LED Array (Left side)
                const numLeds = 20;
                const ledH = (T_LEN) / numLeds - 2;

                // Draw bottom up
                for (let i = 0; i < numLeds; i++) {
                    const ledPct = (i + 1) / numLeds;
                    const isLit = pct >= ledPct || (i === 0 && pct > 0); // Always light bottom one if slightly more than 0

                    // Determine color
                    let ledColor = l1Color;
                    if (ledPct > l2Max) {
                        ledColor = l3Color;
                    } else if (ledPct > l1Max) {
                        ledColor = l2Color;
                    }

                    const fillStyle = isLit ? ledColor : "#111";

                    ctx.fillStyle = fillStyle;
                    if (isLit) {
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = ledColor;
                    } else {
                        ctx.shadowBlur = 0;
                    }

                    // Calculate Y, inverted so bottom is 0
                    const yPos = T_Y_END - ((i + 1) * (T_LEN / numLeds));

                    // Only draw if lit to prevent dark crescent artifacts
                    if (isLit) {
                        ctx.beginPath();
                        ctx.arc(trackX - 16, yPos + ledH / 2, ledH / 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // IMPORTANT: Reset shadow blur to prevent leaking to chassis details
                ctx.shadowBlur = 0;
                ctx.shadowColor = "transparent";

                // 4. Tick Marks (Right side)
                ctx.strokeStyle = "#888";
                ctx.lineWidth = 1.5 * sc;
                ctx.fillStyle = "#888";

                const tickCount = 20;
                for (let i = 0; i <= tickCount; i++) {
                    const yPos = T_Y_START + (i * T_LEN / tickCount);
                    ctx.beginPath();
                    ctx.moveTo(trackX + (12 * sc), yPos);

                    if (i % 2 === 0) { // Major tick
                        ctx.lineTo(trackX + (22 * sc), yPos);
                    } else { // Minor tick
                        ctx.lineTo(trackX + (16 * sc), yPos);
                    }
                    ctx.stroke();
                }

                // 5. LED Readout Screen (bottom)
                const showReadout = node.widgets?.find(w => w.name === "show_readout")?.value ?? true;
                if (showReadout) {
                    // draw digital box
                    ctx.fillStyle = "#0c0c0c";
                    ctx.beginPath();
                    ctx.roundRect(15 * sc, H - (45 * sc), W - (30 * sc), 30 * sc, 4 * sc);
                    ctx.fill();
                    ctx.strokeStyle = "#333";
                    ctx.lineWidth = 1 * sc;
                    ctx.stroke();

                    ctx.fillStyle = rColor;
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = rColor;
                    const fontSize = Math.max(8, Math.floor(16 * sc));
                    ctx.font = `bold ${fontSize}px monospace`;
                    ctx.textAlign = "right";

                    // Format value (int or float)
                    let valStr = val.toString();
                    if (valStr.includes('.') && valStr.split('.')[1].length > 2) {
                        valStr = val.toFixed(2);
                    }

                    ctx.fillText(valStr, W - (22 * sc), H - (25 * sc));
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "transparent";
                }

                // 6. The Fader Cap
                // Calculate actual cap Y
                const capY = T_Y_END - (pct * T_LEN);
                const capW = 38 * sc;
                const capH = 30 * sc;

                // Main cap shape
                ctx.fillStyle = "#333";
                ctx.beginPath();
                ctx.roundRect(trackX - capW / 2, capY - capH / 2, capW, capH, 2 * sc);
                ctx.fill();
                ctx.strokeStyle = "#111";
                ctx.lineWidth = 1 * sc;
                ctx.stroke();

                // Cap gradient/highlight (3D effect)
                const grad = ctx.createLinearGradient(0, capY - capH / 2, 0, capY + capH / 2);
                grad.addColorStop(0, "#777");
                grad.addColorStop(0.2, "#444");
                grad.addColorStop(0.8, "#333");
                grad.addColorStop(1, "#111");
                ctx.fillStyle = grad;
                ctx.fill();

                // Cap grip lines
                ctx.strokeStyle = "#111";
                ctx.beginPath();
                ctx.moveTo(trackX - capW / 2 + (4 * sc), capY - (8 * sc)); ctx.lineTo(trackX + capW / 2 - (4 * sc), capY - (8 * sc));
                ctx.moveTo(trackX - capW / 2 + (4 * sc), capY - (5 * sc)); ctx.lineTo(trackX + capW / 2 - (4 * sc), capY - (5 * sc));
                ctx.moveTo(trackX - capW / 2 + (4 * sc), capY + (5 * sc)); ctx.lineTo(trackX + capW / 2 - (4 * sc), capY + (5 * sc));
                ctx.moveTo(trackX - capW / 2 + (4 * sc), capY + (8 * sc)); ctx.lineTo(trackX + capW / 2 - (4 * sc), capY + (8 * sc));
                ctx.stroke();

                // Cap center line indicator
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2 * sc;
                ctx.beginPath();
                ctx.moveTo(trackX - capW / 2 + (2 * sc), capY);
                ctx.lineTo(trackX + capW / 2 - (2 * sc), capY);
                ctx.stroke();

                // 7. Output Labels (F, I) below the top edge ports
                ctx.fillStyle = "#888";
                const labelSize = Math.max(8, Math.floor(10 * sc));
                ctx.font = `bold ${labelSize}px sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText("F", W - (30 * sc), 20 * sc);
                ctx.fillText("I", W - (15 * sc), 20 * sc);

                ctx.restore();
            };

            // Hit test logic
            const isInsideTrack = (x, y) => {
                const sc = node.properties?.scale || 1.0;
                const W = 90 * sc;
                const T_Y_START = 40 * sc;
                const T_Y_END = 240 * sc;
                const trackX = W / 2;
                return (x >= trackX - (30 * sc) && x <= trackX + (30 * sc) && y >= T_Y_START - (20 * sc) && y <= T_Y_END + (20 * sc));
            };

            node.onMouseDown = function (e, localPos) {
                if (e.button !== 0) return; // Only left click
                const [x, y] = localPos;

                // Track area + some margin
                if (isInsideTrack(x, y)) {
                    this._dragging = true;
                    this.updateValFromY(y);
                    app.canvas.node_capturing_input = this;
                    return true;
                }
            };

            node.onMouseMove = function (e, localPos) {
                if (!this._dragging) return;

                const sc = this.properties?.scale || 1.0;
                const W = 90 * sc;
                const H = 300 * sc;

                // If mouse leaves the node bounds entirely, release drag
                const [x, y] = localPos;
                if (x < 0 || x > W || y < 0 || y > H) {
                    this._dragging = false;
                    app.canvas.node_capturing_input = null;
                    return;
                }

                this.updateValFromY(y);
            };

            node.onMouseUp = function (e, localPos) {
                if (this._dragging) {
                    this._dragging = false;
                    app.canvas.node_capturing_input = null;
                }
            };

            // Failsafe: if mouse leaves canvas while dragging (handled by LiteGraph)
            node.onMouseLeave = function (e) {
                if (this._dragging) {
                    this._dragging = false;
                    app.canvas.node_capturing_input = null;
                }
            };

            node.updateValFromY = function (y) {
                const sc = this.properties?.scale || 1.0;
                const T_Y_START = 40 * sc;
                const T_LEN = 200 * sc; // 240 - 40

                const minV = parseFloat(node.widgets?.find(w => w.name === "min_val")?.value) || 0;
                const maxV = parseFloat(node.widgets?.find(w => w.name === "max_val")?.value) || 1;
                const step = parseFloat(node.widgets?.find(w => w.name === "step")?.value) || 0;

                // Calculate percentage based on Y
                // inverted so bottom = min, top = max
                let pct = 1.0 - (y - T_Y_START) / T_LEN;
                pct = Math.min(Math.max(pct, 0), 1);

                let val = minV + (pct * (maxV - minV));
                // Round to step
                if (step > 0) {
                    // Prevent jitter using inverse factor
                    const inv = 1.0 / step;
                    val = Math.round(val * inv) / inv;
                }

                // Handle precision output to avoid floating point math errors slightly off the step
                val = parseFloat(val.toFixed(5));

                const wInput = node.widgets?.find(w => w.name === "value");
                if (wInput && wInput.value !== val) {
                    wInput.value = val;
                    if (wInput.callback) wInput.callback(val);
                    this.setDirtyCanvas(true, true);
                }
            };

            // Setup right-click configuration array
            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Fader Config",
                    callback: () => {
                        const shade = document.createElement("div");
                        shade.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:9999;";
                        const panel = document.createElement("div");
                        panel.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:300px; background:#1e1e1e; padding:20px; border-radius:8px; border:2px solid #333; z-index:10000; color:white; font-family:sans-serif;";

                        panel.innerHTML = "<h3 style='margin-top:0; color:#f2a900;'>Fader Setup</h3>";

                        const mkInput = (label, name, type = "number", step = "0.1") => {
                            const row = document.createElement("div");
                            row.innerHTML = `<b style='font-size:12px;'>${label}:</b>`;
                            const inp = document.createElement("input");
                            inp.type = type;
                            if (type === "number") inp.step = step;
                            const w = node.widgets.find(wg => wg.name === name);
                            if (type === "checkbox") inp.checked = w ? w.value : true;
                            else inp.value = w ? w.value : "";
                            inp.style.cssText = "width:100%; padding:5px; margin:5px 0 10px 0; background:#111; color:white; border:1px solid #444; box-sizing:border-box;";
                            row.appendChild(inp);
                            panel.appendChild(row);
                            return inp;
                        };

                        const iMin = mkInput("Min Value", "min_val");
                        const iMax = mkInput("Max Value", "max_val");
                        const iStep = mkInput("Step Size", "step", "number", "0.001");
                        const iShowReadout = mkInput("Show Numeric Readout", "show_readout", "checkbox");
                        const iReadColor = mkInput("Readout Color Hex", "readout_color", "text");

                        const iScale = mkInput("Scale", "scale", "number", "0.1");

                        const iL1C = mkInput("LED Stage 1 Color", "led_1_color", "text");
                        const iL1M = mkInput("LED Stage 1->2 Breakpoint (0-1)", "led_1_max", "number", "0.05");
                        const iL2C = mkInput("LED Stage 2 Color", "led_2_color", "text");
                        const iL2M = mkInput("LED Stage 2->3 Breakpoint (0-1)", "led_2_max", "number", "0.05");
                        const iL3C = mkInput("LED Stage 3 Color", "led_3_color", "text");

                        const footer = document.createElement("div");
                        footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:20px;";
                        const btnOk = document.createElement("button");
                        btnOk.innerText = "Save";
                        btnOk.style.cssText = "background:#0084ff; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;";
                        btnOk.onclick = () => {
                            const setW = (name, val, isFloat = false, isBool = false) => {
                                const w = node.widgets.find(wg => wg.name === name);
                                if (w) w.value = isBool ? val : (isFloat ? parseFloat(val) : val);
                            };
                            setW("min_val", iMin.value, true);
                            setW("max_val", iMax.value, true);
                            setW("step", iStep.value, true);
                            setW("show_readout", iShowReadout.checked, false, true);
                            setW("readout_color", iReadColor.value);
                            setW("scale", iScale.value, true);
                            setW("led_1_color", iL1C.value);
                            setW("led_1_max", iL1M.value, true);
                            setW("led_2_color", iL2C.value);
                            setW("led_2_max", iL2M.value, true);
                            setW("led_3_color", iL3C.value);

                            // Recalculate dimensions immediately
                            const sc = parseFloat(iScale.value) || 1.0;
                            node.properties.scale = sc;
                            node.size = [90 * sc, 300 * sc];

                            node.setDirtyCanvas(true, true);
                            node.onConnectionsChange(); // Force output port redraw
                            document.body.removeChild(shade);
                        };
                        const btnCancel = document.createElement("button");
                        btnCancel.innerText = "Cancel";
                        btnCancel.style.cssText = "background:#333; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;";
                        btnCancel.onclick = () => document.body.removeChild(shade);

                        footer.appendChild(btnCancel);
                        footer.appendChild(btnOk);
                        panel.appendChild(footer);

                        shade.appendChild(panel);
                        document.body.appendChild(shade);
                    }
                });
            };
        }
    }
});
