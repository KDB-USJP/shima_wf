import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Shima.Omnijog",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.Omnijog") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.Omnijog") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;

            const BASE_W = 160;
            const BASE_H = 260; // Taller for the buttons underneath

            node.size = [BASE_W, BASE_H];
            node.computeSize = function () {
                const sc = this.properties?.scale || 1.0;

                const rowsW = this.widgets?.find(w => w.name === "rows");
                const rowLimit = rowsW ? parseInt(rowsW.value) || 10 : 10;
                const rowGroups = Math.ceil(rowLimit / 2);

                const dynamicH = (260 + (Math.max(0, rowGroups - 2) * 25));
                return [BASE_W * sc, dynamicH * sc];
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
            
            // Ensure Min/Max hidden widgets exist so ComfyUI can restore their values from JSON on reload
            const ensureBoundsWidgets = () => {
                for (let i = 0; i < 20; i++) {
                    if (!node.widgets || !node.widgets.find(w => w.name === `min_${i}`)) {
                        let wMin = node.addWidget("string", `min_${i}`, "");
                        wMin.type = "hidden"; wMin.hidden = true; wMin.computeSize = () => [0, -4];
                    }
                    if (!node.widgets || !node.widgets.find(w => w.name === `max_${i}`)) {
                        let wMax = node.addWidget("string", `max_${i}`, "");
                        wMax.type = "hidden"; wMax.hidden = true; wMax.computeSize = () => [0, -4];
                    }
                }
            };
            ensureBoundsWidgets();
            cleanupUI();
            setTimeout(cleanupUI, 50);

            const configurePorts = () => {
                const pad = node.layout_slot_offset || 6;
                const sc = node.properties?.scale || 1.0;
                // Move outputs to the top edge
                if (node.outputs) {
                    node.outputs.forEach((o, i) => {
                        o.label = " ";
                        o.pos = [(BASE_W * sc) - (20 * sc) + (i * 15 * sc), pad]; // single MUX port
                    });
                }
            };

            if (node.outputs) configurePorts();
            setTimeout(configurePorts, 50);

            node.onConnectionsChange = function () {
                cleanupUI();
                configurePorts();
            };

            // Ensure the node resizes correctly when loading a workflow or duplicating a node
            node.onConfigure = function (info) {
                // Call the original onConfigure if it exists
                if (LiteGraph.LGraphNode.prototype.onConfigure) {
                    LiteGraph.LGraphNode.prototype.onConfigure.call(this, info);
                }
                if (this.computeSize) {
                    this.size = this.computeSize();
                }
            };

            function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

            // Omnijog specific state
            node._shuttleAmount = 0; // -1.0 to 1.0
            node._internalVals = { "0": null, "1": null, "2": null, "3": null };

            const parseColors = () => {
                const wColors = node.widgets?.find(w => w.name === "colors");
                let cStr = wColors ? wColors.value : "#ffaa00,#00aaff,#55ff55,#ff55aa";
                let parts = cStr.split(",").map(s => s.trim());
                if (parts.length < 4) parts = ["#ffaa00", "#00aaff", "#55ff55", "#ff55aa"];
                return parts;
            };

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const sc = this.properties?.scale || 1.0;

                // Get rows limit
                const rowsW = this.widgets?.find(w => w.name === "rows");
                const rowLimit = rowsW ? parseInt(rowsW.value) || 10 : 10;
                const rowGroups = Math.ceil(rowLimit / 2); // up to 10 rows of 2 buttons

                const W = BASE_W * sc;
                // Base H is for 2 rows (4 buttons). 
                // Each extra row needs about 25px * sc
                const dynamicH = (260 + (Math.max(0, rowGroups - 2) * 25)) * sc;
                const H = dynamicH;

                ctx.save();

                // 1. Chassis Background
                ctx.fillStyle = "#222";
                ctx.beginPath();
                ctx.roundRect(0, 0, W, H, 12 * sc);
                ctx.fill();
                ctx.strokeStyle = "#111";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                // 2. MUX Output Label
                ctx.fillStyle = "#888";
                const labelSize = Math.max(8, Math.floor(10 * sc));
                ctx.font = `bold ${labelSize}px sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText("MUX", W - (20 * sc), 20 * sc);

                // 3. The Shuttle Wheel (Top area)
                const cX = W / 2;
                const cY = 85 * sc; // Center of wheel
                const wheelRad = 60 * sc;

                // Outer track ring
                ctx.beginPath();
                ctx.arc(cX, cY, wheelRad + (8 * sc), 0, Math.PI * 2);
                ctx.fillStyle = "#181818";
                ctx.fill();
                ctx.strokeStyle = "#0d0d0d";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                // Draw spring limit dashed lines (decorative)
                ctx.beginPath();
                ctx.arc(cX, cY, wheelRad + (14 * sc), Math.PI * 1.1, Math.PI * 1.9);
                ctx.strokeStyle = "#444";
                ctx.lineWidth = 2 * sc;
                ctx.setLineDash([4 * sc, 4 * sc]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Rotation transforms for wheel
                ctx.translate(cX, cY);
                // Max rotation is +/- 120 degrees depending on shuttle amount
                const maxAngle = (120 * Math.PI) / 180;
                const visualShuttle = clamp(node._shuttleAmount, -1.0, 1.0);
                ctx.rotate(visualShuttle * maxAngle);

                // Wheel base
                ctx.beginPath();
                ctx.arc(0, 0, wheelRad, 0, Math.PI * 2);
                var rgrad = ctx.createRadialGradient(0, 0, 0, 0, 0, wheelRad);
                rgrad.addColorStop(0, '#555');
                rgrad.addColorStop(0.8, '#333');
                rgrad.addColorStop(1, '#222');
                ctx.fillStyle = rgrad;
                ctx.fill();
                ctx.strokeStyle = "#111";
                ctx.lineWidth = 1 * sc;
                ctx.stroke();

                // Wheel Grip Ring
                ctx.beginPath();
                ctx.arc(0, 0, wheelRad * 0.85, 0, Math.PI * 2);
                ctx.strokeStyle = "#1a1a1a";
                ctx.lineWidth = 4 * sc;
                ctx.stroke();

                const activeChannel = node.widgets?.find(w => w.name === "active_channel")?.value || "0";
                const colors = parseColors();
                const activeColor = colors[parseInt(activeChannel) % colors.length] || "#ffaa00";

                // Inner highlighted ring
                ctx.beginPath();
                ctx.arc(0, 0, wheelRad * 0.75, 0, Math.PI * 2);
                ctx.strokeStyle = activeColor;
                ctx.lineWidth = 3 * sc;
                ctx.stroke();

                // Thumb dimple (indicates rotation)
                ctx.beginPath();
                ctx.arc(0, -(wheelRad * 0.5), 8 * sc, 0, Math.PI * 2);
                var dgrad = ctx.createRadialGradient(0, -(wheelRad * 0.5), 0, 0, -(wheelRad * 0.5), 8 * sc);
                dgrad.addColorStop(0, '#111');
                dgrad.addColorStop(1, '#2c2c2c');
                ctx.fillStyle = dgrad;
                ctx.fill();

                // Un-rotate
                ctx.rotate(-(visualShuttle * maxAngle));
                ctx.translate(-cX, -cY);

                // --- NEW: Stepper Buttons (- / +) ---
                const stepRadius = 9 * sc;
                const stepY = 152 * sc;
                const leftStepX = 30 * sc;
                const rightStepX = W - (30 * sc);

                const drawStepBtn = (x, y, symbol) => {
                    ctx.beginPath();
                    ctx.arc(x, y, stepRadius, 0, Math.PI * 2);
                    ctx.fillStyle = "#ffffff";
                    ctx.fill();
                    ctx.strokeStyle = "#444";
                    ctx.lineWidth = 1 * sc;
                    ctx.stroke();

                    ctx.fillStyle = "#000000";

                    const barW = 8 * sc;
                    const barH = 2.5 * sc;

                    if (symbol === "-") {
                        ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH);
                    } else if (symbol === "+") {
                        ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH);
                        ctx.fillRect(x - barH / 2, y - barW / 2, barH, barW);
                    }
                };

                drawStepBtn(leftStepX, stepY, "-");
                drawStepBtn(rightStepX, stepY, "+");

                // 4. Digital Readout (Middle)
                const wActiveVal = node.widgets?.find(w => w.name === "val_" + activeChannel);
                let valToDraw = wActiveVal ? parseFloat(wActiveVal.value) || 0 : 0;

                const readY = 175 * sc; // Pushed down slightly to make room for steppers
                ctx.fillStyle = "#0c0c0c";
                ctx.beginPath();
                ctx.roundRect(15 * sc, readY, W - (30 * sc), 24 * sc, 4 * sc);
                ctx.fill();
                ctx.strokeStyle = "#333";
                ctx.lineWidth = 1 * sc;
                ctx.stroke();

                ctx.fillStyle = activeColor;
                ctx.shadowBlur = 5;
                ctx.shadowColor = activeColor;
                const readSize = Math.max(8, Math.floor(12 * sc));
                ctx.textAlign = "center";

                let valStr = valToDraw.toString();
                if (valStr.includes('.') && valStr.split('.')[1].length > 2) {
                    valStr = valToDraw.toFixed(2);
                }

                // --- NEW: Forward String Trace for DemuxList ---
                const activeLabel = node.widgets?.find(w => w.name === "label_" + activeChannel)?.value || ("CH" + (parseInt(activeChannel) + 1));
                let isStringMode = false;
                if (node.outputs && node.outputs[0] && node.outputs[0].links) {
                    for (let l_id of node.outputs[0].links) {
                        const link = app.graph.links[l_id];
                        if (!link) continue;
                        const targetNode = app.graph.getNodeById(link.target_id);
                        if (targetNode && targetNode.comfyClass === "Shima.DemuxList") {
                            const tChanW = targetNode.widgets?.find(w => w.name === "target_channel");
                            if (tChanW && tChanW.value === activeLabel) {
                                const optW = targetNode.widgets?.find(w => w.name === "options");
                                if (optW && optW.value) {
                                    const opts = optW.value.split(",").map(s => s.trim()).filter(s => s);
                                    if (opts.length > 0) {
                                        const intVal = Math.round(valToDraw);
                                        // JS Modulo bug fix for negative numbers
                                        let idx = intVal % opts.length;
                                        if (idx < 0) idx += opts.length;
                                        valStr = opts[idx];
                                        isStringMode = true;
                                        break; // Found our string, stop searching
                                    }
                                }
                            }
                        }
                    }
                }

                // Dynamic text scaling for long strings
                let drawFontSize = readSize;
                if (isStringMode) {
                    ctx.font = `bold ${drawFontSize}px sans-serif`;
                    let textWidth = ctx.measureText(valStr).width;
                    const maxTextWidth = W - (40 * sc); // Padding from steppers
                    if (textWidth > maxTextWidth) {
                        drawFontSize = Math.max(6 * sc, Math.floor(drawFontSize * (maxTextWidth / textWidth)));
                        ctx.font = `bold ${drawFontSize}px sans-serif`;
                    }
                } else {
                    ctx.font = `bold ${drawFontSize}px monospace`;
                }

                ctx.fillText(valStr, W / 2, readY + (15 * sc));
                ctx.shadowBlur = 0;
                ctx.shadowColor = "transparent";

                // 5. Dynamic Channel Buttons (Bottom)
                const btnPositions = [];
                const maxBtns = rowLimit;
                let currentY = 210 * sc; // Pushed down slightly to align with readout shift
                const btnW = 55 * sc;
                const btnH = 20 * sc;

                for (let i = 0; i < maxBtns; i++) {
                    const isLeft = (i % 2 === 0);
                    if (!isLeft && i > 0) {
                        // Keep Y same for right button
                    } else if (i > 0) {
                        currentY += 25 * sc; // Move down for next row
                    }

                    const xPos = isLeft ? (cX - btnW - (2 * sc)) : (cX + (2 * sc));
                    btnPositions.push({ idx: i.toString(), x: xPos, y: currentY });
                }

                ctx.textAlign = "center";
                const fontBtnSize = Math.max(6, Math.floor(9 * sc));
                ctx.font = `bold ${fontBtnSize}px sans-serif`;

                btnPositions.forEach((pos, i) => {
                    const isActive = (activeChannel === pos.idx);
                    const color = colors[i % colors.length];
                    const labelStr = node.widgets?.find(w => w.name === "label_" + pos.idx)?.value || "CH" + (i + 1);

                    ctx.beginPath();
                    ctx.roundRect(pos.x, pos.y, btnW, btnH, btnH / 2);

                    if (isActive) {
                        ctx.fillStyle = color;
                        ctx.shadowBlur = 4 * sc;
                        ctx.shadowColor = color;
                        ctx.fill();
                        ctx.fillStyle = "#000";
                    } else {
                        ctx.fillStyle = "#333";
                        ctx.fill();
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1 * sc;
                        ctx.stroke();
                        ctx.fillStyle = color;
                    }

                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "transparent";
                    ctx.fillText(labelStr, pos.x + (btnW / 2), pos.y + (btnH * 0.75));
                });

                ctx.restore();
            };

            const startShuttleLoop = () => {
                if (node._shuttleAF) cancelAnimationFrame(node._shuttleAF);
                let lastTime = performance.now();

                const loop = (time) => {
                    const dt = time - lastTime;
                    lastTime = time;

                    const isDragging = node._dragging === true;

                    if (isDragging) {
                        // Apply speed to active channel value
                        if (node._shuttleAmount !== 0) {
                            // Non-linear speed response: small turns = slow, hard turns = fast
                            const speedCurve = Math.sign(node._shuttleAmount) * Math.pow(Math.abs(node._shuttleAmount), 2);
                            const speedBase = 0.015; // Base units per ms at max deflection
                            const delta = (speedCurve * speedBase) * dt;

                            const wActive = node.widgets.find(w => w.name === "active_channel");
                            const idx = wActive ? wActive.value : "0";

                            const wVal = node.widgets.find(w => w.name === "val_" + idx);
                            const wStep = node.widgets.find(w => w.name === "step_" + idx);

                            if (wVal) {
                                // Accumulate unrounded internally
                                if (node._internalVals[idx] === null || node._internalVals[idx] === undefined) {
                                    node._internalVals[idx] = parseFloat(wVal.value) || 0;
                                }
                                node._internalVals[idx] += delta;

                                let raw = node._internalVals[idx];
                                const step = wStep ? (parseFloat(wStep.value) || 0) : 0;

                                if (step > 0) {
                                    const inv = 1.0 / step;
                                    raw = Math.round(raw * inv) / inv;
                                }
                                raw = parseFloat(raw.toFixed(5));

                                // Apply Min/Max Bounds
                                const wMin = node.widgets.find(w => w.name === "min_" + idx);
                                const wMax = node.widgets.find(w => w.name === "max_" + idx);
                                
                                if (wMin && wMin.value !== "" && !isNaN(wMin.value)) {
                                    raw = Math.max(parseFloat(wMin.value), raw);
                                }
                                if (wMax && wMax.value !== "" && !isNaN(wMax.value)) {
                                    raw = Math.min(parseFloat(wMax.value), raw);
                                }

                                if (wVal.value !== raw) {
                                    wVal.value = raw;
                                    node._internalVals[idx] = raw; // Lock internal accumulator to boundary
                                    if (wVal.callback) wVal.callback(raw);
                                    // Normally we would queue an execution here for real-time upstream 
                                    // if the user has Auto Queue enabled, but we avoid forcing app.graph.runStep() 
                                    // to prevent server flooding.
                                    app.graph.setDirtyCanvas(true, true);
                                }
                            }
                        }
                    } else {
                        // Spring back logic
                        if (node._shuttleAmount !== 0) {
                            node._shuttleAmount *= Math.pow(0.75, dt / 16); // Snap back quickly
                            if (Math.abs(node._shuttleAmount) < 0.01) {
                                node._shuttleAmount = 0;
                                node.setDirtyCanvas(true, true);
                                node._shuttleAF = null;
                                // Fire a final run on release
                                if (app.graph.onNodeTrace) {
                                    // Optional: signal execution. 
                                    // Just dirtying is enough for normal interact.
                                }
                                return; // end loop
                            }
                            node.setDirtyCanvas(true, true);
                        } else {
                            // Amount is 0 and not dragging, stop loop
                            node._shuttleAF = null;
                            return;
                        }
                    }

                    node.setDirtyCanvas(true, true);
                    node._shuttleAF = requestAnimationFrame(loop);
                };
                node._shuttleAF = requestAnimationFrame(loop);
            };

            node.onMouseDown = function (e, localPos) {
                if (e.button !== 0) return;
                const [x, y] = localPos;
                const sc = this.properties?.scale || 1.0;

                // Check buttons dynamically
                const rowsW = this.widgets?.find(w => w.name === "rows");
                const rowLimit = rowsW ? parseInt(rowsW.value) || 10 : 10;

                const cX = (BASE_W * sc) / 2;
                const btnW = 55 * sc;
                const btnH = 20 * sc;

                const btnPositions = [];
                let currentY = 205 * sc;

                for (let i = 0; i < rowLimit; i++) {
                    const isLeft = (i % 2 === 0);
                    if (!isLeft && i > 0) {
                        // match Y
                    } else if (i > 0) {
                        currentY += 25 * sc;
                    }
                    const xPos = isLeft ? (cX - btnW - (2 * sc)) : (cX + (2 * sc));
                    btnPositions.push({ idx: i.toString(), x: xPos, y: currentY });
                }

                for (let btn of btnPositions) {
                    if (x >= btn.x && x <= btn.x + btnW && y >= btn.y && y <= btn.y + btnH) {
                        const wActive = this.widgets?.find(w => w.name === "active_channel");
                        if (wActive && wActive.value !== btn.idx) {
                            wActive.value = btn.idx;
                            this.setDirtyCanvas(true, true);
                            
                            // Trigger downstream DemuxList refreshes
                            setTimeout(() => {
                                if (this.outputs) {
                                    this.outputs.forEach(out => {
                                        if (out.links) {
                                            out.links.forEach(linkId => {
                                                const link = app.graph.links[linkId];
                                                if (link) {
                                                    const targetNode = app.graph.getNodeById(link.target_id);
                                                    if (targetNode && typeof targetNode.refreshHarvestedOptions === "function") {
                                                        targetNode.refreshHarvestedOptions();
                                                        targetNode.onConnectionsChange(); // Force port redraws
                                                    }
                                                }
                                            });
                                        }
                                    });
                                }
                            }, 50);

                            return true;
                        }
                    }
                }

                // Check Steppers (- / +)
                const stepRadius = 9 * sc;
                const stepY = 152 * sc;
                const leftStepX = 30 * sc;
                const rightStepX = (BASE_W * sc) - (30 * sc);

                // Helper to apply step
                const applyStep = (direction) => {
                    const activeCh = this.widgets?.find(w => w.name === "active_channel")?.value || "0";
                    const wVal = this.widgets?.find(w => w.name === `val_${activeCh}`);
                    const wStep = this.widgets?.find(w => w.name === `step_${activeCh}`);
                    if (wVal && wStep) {
                        let curBase = parseFloat(wVal.value) || 0;
                        const jump = parseFloat(wStep.value) || 0.1;

                        const precisionStr = wStep.value.toString();
                        const decimals = precisionStr.includes('.') ? precisionStr.split('.')[1].length : 0;

                        // Calculate new value
                        let newVal = direction === "up" ? curBase + jump : curBase - jump;
                        // Precision fix
                        newVal = parseFloat(newVal.toFixed(decimals));

                        // Apply Min/Max Bounds
                        const wMin = this.widgets?.find(w => w.name === "min_" + activeCh);
                        const wMax = this.widgets?.find(w => w.name === "max_" + activeCh);
                        
                        if (wMin && wMin.value !== "" && !isNaN(wMin.value)) {
                            newVal = Math.max(parseFloat(wMin.value), newVal);
                        }
                        if (wMax && wMax.value !== "" && !isNaN(wMax.value)) {
                            newVal = Math.min(parseFloat(wMax.value), newVal);
                        }

                        wVal.value = newVal;
                        if (wVal.callback) wVal.callback(newVal);

                        this.setDirtyCanvas(true, true);
                    }
                };

                // Left Stepper (-)
                const dxL = x - leftStepX;
                const dyL = y - stepY;
                if (dxL * dxL + dyL * dyL <= (stepRadius * 1.5) * (stepRadius * 1.5)) { // 1.5x hit radius
                    applyStep("down");

                    this._stepHeld = true;
                    app.canvas.node_capturing_input = this; // FORCE CATCH MOUSE UP

                    // Setup holding loop (accelerating)
                    let speedMs = 150; // Faster baseline repeat after initial delay
                    const loopDown = () => {
                        if (!this._stepHeld) return; // Killswitch
                        applyStep("down");
                        speedMs = Math.max(30, speedMs * 0.85); // Accelerate
                        this._stepDelay = setTimeout(loopDown, speedMs);
                    };
                    this._stepDelay = setTimeout(loopDown, 500); // Standard 500ms OS-level hold delay

                    // Force global catch for mouse up because LiteGraph swallows it
                    const stopStep = () => {
                        this._stepHeld = false;
                        if (this._stepDelay) {
                            clearTimeout(this._stepDelay);
                            this._stepDelay = null;
                        }
                        window.removeEventListener("pointerup", stopStep, { capture: true });
                        window.removeEventListener("mouseup", stopStep, { capture: true });
                        window.removeEventListener("touchend", stopStep, { capture: true });
                    };
                    window.addEventListener("pointerup", stopStep, { capture: true });
                    window.addEventListener("mouseup", stopStep, { capture: true });
                    window.addEventListener("touchend", stopStep, { capture: true });

                    return true;
                }

                // Right Stepper (+)
                const dxR = x - rightStepX;
                const dyR = y - stepY;
                if (dxR * dxR + dyR * dyR <= (stepRadius * 1.5) * (stepRadius * 1.5)) { // 1.5x hit radius
                    applyStep("up");

                    this._stepHeld = true;
                    app.canvas.node_capturing_input = this; // FORCE CATCH MOUSE UP

                    // Setup holding loop (accelerating)
                    let speedMs = 150; // Faster baseline repeat after initial delay
                    const loopUp = () => {
                        if (!this._stepHeld) return; // Killswitch
                        applyStep("up");
                        speedMs = Math.max(30, speedMs * 0.85); // Accelerate
                        this._stepDelay = setTimeout(loopUp, speedMs);
                    };
                    this._stepDelay = setTimeout(loopUp, 500); // Standard 500ms OS-level hold delay

                    // Force global catch for mouse up because LiteGraph swallows it
                    const stopStep = () => {
                        this._stepHeld = false;
                        if (this._stepDelay) {
                            clearTimeout(this._stepDelay);
                            this._stepDelay = null;
                        }
                        window.removeEventListener("pointerup", stopStep, { capture: true });
                        window.removeEventListener("mouseup", stopStep, { capture: true });
                        window.removeEventListener("touchend", stopStep, { capture: true });
                    };
                    window.addEventListener("pointerup", stopStep, { capture: true });
                    window.addEventListener("mouseup", stopStep, { capture: true });
                    window.addEventListener("touchend", stopStep, { capture: true });

                    return true;
                }

                // Check wheel
                const cY = 85 * sc;
                const wheelRad = 65 * sc; // Generous hit area
                const dx = x - cX;
                const dy = y - cY;
                if (dx * dx + dy * dy <= wheelRad * wheelRad) {
                    this._dragging = true;
                    this._startY = y;
                    app.canvas.node_capturing_input = this;
                    startShuttleLoop();
                    return true;
                }
            };

            node.onMouseMove = function (e, localPos) {
                if (!this._dragging) return;

                const sc = this.properties?.scale || 1.0;

                const [x, y] = localPos;
                const deltaY = this._startY - y; // up is positive

                // Allow massive overdrive for 50x speed. 120 pixels = 1.0 deflection.
                this._shuttleAmount = clamp(deltaY / (120 * sc), -10.0, 10.0);
            };

            node.onMouseUp = function (e, localPos) {
                // Guaranteed killswitch
                this._stepHeld = false;
                if (this._stepDelay) {
                    clearTimeout(this._stepDelay);
                    this._stepDelay = null;
                }

                if (this._dragging) {
                    this._dragging = false;
                }

                // We must uncouple ourselves from global capture so other nodes work
                if (app.canvas.node_capturing_input === this) {
                    app.canvas.node_capturing_input = null;
                }

                // CRUCIAL: Must return false to allow LiteGraph to release its global dragging states
                return false;
            };

            node.onMouseLeave = function (e) {
                this._stepHeld = false;
                if (this._stepDelay) {
                    clearTimeout(this._stepDelay);
                    this._stepDelay = null;
                }
                // We want the wheel drag to persist outside the node bounds, but button holds must stop.
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Omnijog Config",
                    callback: () => {
                        const shade = document.createElement("div");
                        shade.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:9999;";
                        const panel = document.createElement("div");
                        panel.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:300px; background:#1e1e1e; padding:20px; border-radius:8px; border:2px solid #333; z-index:10000; color:white; font-family:sans-serif; max-height:80vh; overflow-y:auto;";

                        panel.innerHTML = "<h3 style='margin-top:0; color:#f2a900;'>Omnijog Setup</h3>";

                        const mkInput = (label, name, type = "number", step = "0.1") => {
                            const row = document.createElement("div");
                            row.innerHTML = `<b style='font-size:12px;'>${label}:</b>`;
                            const inp = document.createElement("input");
                            inp.type = type;
                            if (type === "number") inp.step = step;
                            const w = node.widgets.find(wg => wg.name === name);
                            inp.value = w ? w.value : "";
                            inp.style.cssText = "width:100%; padding:5px; margin:5px 0 10px 0; background:#111; color:white; border:1px solid #444; box-sizing:border-box;";
                            row.appendChild(inp);
                            panel.appendChild(row);
                            return inp;
                        };

                        const rowsW = node.widgets?.find(w => w.name === "rows");
                        const rowLimit = rowsW ? parseInt(rowsW.value) || 10 : 10;

                        const iRows = mkInput("Total CH Buttons (Even, Max 20)", "rows", "number", "2");

                        // Dynamically render inputs based on current row config limit
                        const chInputs = [];
                        for (let i = 0; i < rowLimit; i++) {
                            const lbl = mkInput(`CH ${i + 1} Name`, `label_${i}`, "text");
                            const stp = mkInput(`CH ${i + 1} Step`, `step_${i}`, "number", "0.01");
                            const minVal = mkInput(`CH ${i + 1} Min`, `min_${i}`, "number", "0.1");
                            const maxVal = mkInput(`CH ${i + 1} Max`, `max_${i}`, "number", "0.1");

                            // Style adjustments to make them sit compactly
                            lbl.style.marginBottom = "2px";
                            stp.style.marginBottom = "2px";
                            minVal.style.marginBottom = "2px";
                            maxVal.style.marginBottom = "15px";

                            chInputs.push({ label: lbl, step: stp, min: minVal, max: maxVal, idx: i });
                        }

                        const iCols = mkInput("Colors (Comma Sep hex)", "colors", "text");
                        const iScale = mkInput("Global Scale", "scale", "number", "0.1");

                        const footer = document.createElement("div");
                        footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:20px;";
                        const btnOk = document.createElement("button");
                        btnOk.innerText = "Save";
                        btnOk.style.cssText = "background:#0084ff; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;";
                        btnOk.onclick = () => {
                            const setW = (name, val, isFloat = false, isInt = false) => {
                                let w = node.widgets.find(wg => wg.name === name);
                                if (!w) {
                                    // Dynamically create hidden widget if it doesn't exist yet
                                    w = node.addWidget("string", name, val);
                                    w.type = "hidden";
                                    w.computeSize = () => [0, -4];
                                    w.hidden = true;
                                }
                                if (isFloat) w.value = parseFloat(val);
                                else if (isInt) w.value = parseInt(val);
                                else w.value = val;
                                // Handle empty min/max strings safely for the Python backend
                                if ((name.startsWith("min_") || name.startsWith("max_")) && isNaN(w.value)) {
                                    w.value = ""; 
                                }
                            };

                            setW("rows", iRows.value, false, true);

                            // Dynamically save active config rows
                            chInputs.forEach(inp => {
                                setW(`label_${inp.idx}`, inp.label.value);
                                setW(`step_${inp.idx}`, inp.step.value, true);
                                setW(`min_${inp.idx}`, inp.min.value, true);
                                setW(`max_${inp.idx}`, inp.max.value, true);
                            });
                            setW("colors", iCols.value);
                            setW("scale", iScale.value, true);

                            // Recalculate dimensions immediately
                            const sc = parseFloat(iScale.value) || 1.0;
                            node.properties.scale = sc;
                            node.size = node.computeSize();

                            node.setDirtyCanvas(true, true);
                            node.onConnectionsChange();
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
