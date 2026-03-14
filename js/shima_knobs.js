import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Shima.Knob",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.Knob") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.Knob") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;

            // Knob Base Definition
            const BASE_W = 120;
            const BASE_H = 150;

            node.size = [BASE_W, BASE_H];
            node.computeSize = function () {
                const sc = this.properties?.scale || 1.0;
                const showReadout = this.widgets?.find(w => w.name === "show_readout")?.value ?? true;
                const targetH = showReadout ? 190 : BASE_H;
                return [BASE_W * sc, targetH * sc];
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

            function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const sc = this.properties?.scale || 1.0;
                const W = BASE_W * sc;
                const showReadout = node.widgets?.find(w => w.name === "show_readout")?.value ?? true;
                const targetH = showReadout ? 190 : BASE_H;
                const H = targetH * sc;

                // Get values
                const wInput = node.widgets?.find(w => w.name === "value");
                if (!wInput) return;

                let val = parseFloat(wInput.value) || 0.0;
                const minV = parseFloat(node.widgets?.find(w => w.name === "min_val")?.value) || 0;
                const maxV = parseFloat(node.widgets?.find(w => w.name === "max_val")?.value) || 1;
                const ledColor = node.widgets?.find(w => w.name === "led_color")?.value || "#ffaa00";

                // Normalization
                let pct = 0;
                if (maxV > minV) {
                    pct = clamp((val - minV) / (maxV - minV), 0, 1);
                }

                ctx.save();

                // 1. Chassis Background (dark matte square/rounded)
                ctx.fillStyle = "#1e1e1e";
                ctx.beginPath();
                ctx.roundRect(0, 0, W, H, 12 * sc);
                ctx.fill();
                ctx.strokeStyle = "#111";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                // Knob Center
                const cX = W / 2;
                const cY = H / 2 + (10 * sc); // Push slightly down to leave room for F/I

                const knobRadius = 35 * sc;
                const arcRadius = 48 * sc;

                // 2. LED Arc
                // We'll draw 15 dots from angle 150 deg to 30 deg (240 degree span)
                // In canvas, 0 is right (3 o'clock). 90 is bottom. -90 (or 270) is top.
                // Start: 150 deg (bottom leftish), sweep clockwise over the top to 30 deg (bottom rightish)
                // Converting to radians:
                const startAngle = (150 * Math.PI) / 180;
                const endAngle = (390 * Math.PI) / 180; // 390 is 30 in continuous clockwise space from 150
                const numLeds = 15;
                const angleStep = (endAngle - startAngle) / (numLeds - 1);
                const dotRadius = 2.5 * sc;

                for (let i = 0; i < numLeds; i++) {
                    const ledPct = i / (numLeds - 1);
                    const angle = startAngle + (i * angleStep);
                    // Light it up if pct > ledPct (plus a tiny bump so 0 doesn't light the first dot unless it's strictly > 0)
                    const isLit = pct > 0 && pct >= ledPct;

                    const lx = cX + Math.cos(angle) * arcRadius;
                    const ly = cY + Math.sin(angle) * arcRadius;

                    ctx.beginPath();
                    ctx.arc(lx, ly, dotRadius, 0, Math.PI * 2);

                    if (isLit) {
                        ctx.fillStyle = ledColor;
                        ctx.shadowBlur = 8 * sc;
                        ctx.shadowColor = ledColor;
                    } else {
                        ctx.fillStyle = "#111";
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = "transparent";
                    }
                    ctx.fill();
                }

                ctx.shadowBlur = 0;
                ctx.shadowColor = "transparent";

                // 3. The Knob Base (Outer Grip Ring)
                ctx.beginPath();
                ctx.arc(cX, cY, knobRadius, 0, Math.PI * 2);
                ctx.fillStyle = "#111"; // dark rubber base
                ctx.fill();
                ctx.strokeStyle = "#080808";
                ctx.lineWidth = 1 * sc;
                ctx.stroke();

                // 4. The Metallic Face (Concentric Circles with radial gradient)
                const faceRadius = knobRadius * 0.85;

                // Outer ring of face
                ctx.beginPath();
                ctx.arc(cX, cY, faceRadius, 0, Math.PI * 2);
                // Silver radial gradient
                var rgrad = ctx.createRadialGradient(cX, cY, 0, cX, cY, faceRadius);
                rgrad.addColorStop(0, '#e8e8e8');
                rgrad.addColorStop(0.3, '#d4d4d4');
                rgrad.addColorStop(0.7, '#c0c0c0');
                rgrad.addColorStop(1, '#999999');
                ctx.fillStyle = rgrad;
                ctx.fill();

                // Inner indent/bevel
                const innerRadius = knobRadius * 0.75;
                ctx.beginPath();
                ctx.arc(cX, cY, innerRadius, 0, Math.PI * 2);
                var innerRgrad = ctx.createRadialGradient(cX, cY, 0, cX, cY, innerRadius);
                innerRgrad.addColorStop(0, '#f0f0f0');
                innerRgrad.addColorStop(0.8, '#d0d0d0');
                innerRgrad.addColorStop(1, '#aaaaaa');
                ctx.fillStyle = innerRgrad;
                ctx.fill();
                ctx.strokeStyle = "#ffffff"; // Highlight bevel
                ctx.lineWidth = 0.5 * sc;
                ctx.stroke();

                // 5. The Indicator Notch
                // Rotate canvas to match percentage
                const currentAngle = startAngle + (pct * (endAngle - startAngle));

                ctx.translate(cX, cY);
                ctx.rotate(currentAngle);

                // Draw a small pill shape acting as the notch
                // Since we rotated, "right" (0 degrees) is now pointing where the notch should be
                ctx.fillStyle = "#222";
                ctx.beginPath();
                ctx.roundRect((knobRadius * 0.4), -(2 * sc), (knobRadius * 0.35), 4 * sc, 2 * sc);
                ctx.fill();

                // Unrotate
                ctx.rotate(-currentAngle);
                ctx.translate(-cX, -cY);

                // 6. Output Labels (F, I) below the top edge ports
                ctx.fillStyle = "#888";
                const labelSize = Math.max(8, Math.floor(10 * sc));
                ctx.font = `bold ${labelSize}px sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText("F", W - (30 * sc), 20 * sc);
                ctx.fillText("I", W - (15 * sc), 20 * sc);

                // 7. Optional LCD Readout Screen
                if (showReadout) {
                    const rColor = node.widgets?.find(w => w.name === "readout_color")?.value || "#ffaa00";
                    ctx.fillStyle = "#0c0c0c";
                    ctx.beginPath();
                    ctx.roundRect(15 * sc, H - (38 * sc), W - (30 * sc), 28 * sc, 4 * sc);
                    ctx.fill();
                    ctx.strokeStyle = "#333";
                    ctx.lineWidth = 1 * sc;
                    ctx.stroke();

                    ctx.fillStyle = rColor;
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = rColor;
                    const fontSize = Math.max(8, Math.floor(14 * sc));
                    ctx.font = `bold ${fontSize}px monospace`;
                    ctx.textAlign = "center";

                    let valStr = val.toString();
                    if (valStr.includes('.') && valStr.split('.')[1].length > 2) {
                        valStr = val.toFixed(2);
                    }

                    ctx.fillText(valStr, W / 2, H - (18 * sc));
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "transparent";
                }

                ctx.restore();
            };

            // Hit test logic
            const isInsideKnob = (x, y) => {
                const sc = node.properties?.scale || 1.0;
                const W = BASE_W * sc;
                const showReadout = node.widgets?.find(w => w.name === "show_readout")?.value ?? true;
                const targetH = showReadout ? 190 : BASE_H;
                const H = targetH * sc;

                const cX = W / 2;
                const cY = (BASE_H * sc) / 2 + (10 * sc); // Center of knob stays relative to Base_H
                const radius = 55 * sc; // Give a generous hit zone around the knob + arc
                const dx = x - cX;
                const dy = y - cY;
                return (dx * dx + dy * dy <= radius * radius);
            };

            node.onMouseDown = function (e, localPos) {
                if (e.button !== 0) return; // Only left click
                const [x, y] = localPos;

                if (isInsideKnob(x, y)) {
                    this._dragging = true;
                    this._startY = y;
                    // capture initial value
                    const wInput = node.widgets?.find(w => w.name === "value");
                    this._startVal = parseFloat(wInput.value) || 0;
                    app.canvas.node_capturing_input = this;
                    return true;
                }
            };

            node.onMouseMove = function (e, localPos) {
                if (!this._dragging) return;

                const sc = this.properties?.scale || 1.0;
                const W = BASE_W * sc;
                const showReadout = node.widgets?.find(w => w.name === "show_readout")?.value ?? true;
                const targetH = showReadout ? 190 : BASE_H;
                const H = targetH * sc;

                // If mouse leaves the node bounds entirely, release drag
                const [x, y] = localPos;
                if (x < 0 || x > W || y < 0 || y > H) {
                    this._dragging = false;
                    app.canvas.node_capturing_input = null;
                    return;
                }

                // Virtual vertical drag behavior (simulating DAW knobs)
                // 1 pixel of movement = ~X% of range
                const deltaY = this._startY - y; // up is positive

                const minV = parseFloat(node.widgets?.find(w => w.name === "min_val")?.value) || 0;
                const maxV = parseFloat(node.widgets?.find(w => w.name === "max_val")?.value) || 1;
                const step = parseFloat(node.widgets?.find(w => w.name === "step")?.value) || 0;

                const range = maxV - minV;
                // Sensibility: moving 100 scaled pixels sweeps the entire range
                const sensitivity = range / (100 * sc);

                let val = this._startVal + (deltaY * sensitivity);
                val = clamp(val, minV, maxV);

                // Round to step
                if (step > 0) {
                    const inv = 1.0 / step;
                    val = Math.round(val * inv) / inv;
                }

                // Handle precision output
                val = parseFloat(val.toFixed(5));

                const wInput = node.widgets?.find(w => w.name === "value");
                if (wInput && wInput.value !== val) {
                    wInput.value = val;
                    if (wInput.callback) wInput.callback(val);
                    this.setDirtyCanvas(true, true);
                }
            };

            node.onMouseUp = function (e, localPos) {
                if (this._dragging) {
                    this._dragging = false;
                    app.canvas.node_capturing_input = null;
                }
            };

            node.onMouseLeave = function (e) {
                if (this._dragging) {
                    this._dragging = false;
                    app.canvas.node_capturing_input = null;
                }
            };

            // Setup right-click configuration array
            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Knob Config",
                    callback: () => {
                        const shade = document.createElement("div");
                        shade.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:9999;";
                        const panel = document.createElement("div");
                        panel.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:300px; background:#1e1e1e; padding:20px; border-radius:8px; border:2px solid #333; z-index:10000; color:white; font-family:sans-serif;";

                        panel.innerHTML = "<h3 style='margin-top:0; color:#f2a900;'>Knob Setup</h3>";

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
                        const iLedColor = mkInput("LED Arc Color Hex", "led_color", "text");

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
                            setW("led_color", iLedColor.value);

                            // Recalculate dimensions immediately
                            const sc = parseFloat(iScale.value) || 1.0;
                            node.properties.scale = sc;
                            const targetH = iShowReadout.checked ? 190 : BASE_H;
                            node.size = [120 * sc, targetH * sc];

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
