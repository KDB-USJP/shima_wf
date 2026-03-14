import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Shima.DemuxList",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.DemuxList") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.DemuxList") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;

            const BASE_W = 80;
            const BASE_H = 60;

            node.size = [BASE_W, BASE_H];
            node.computeSize = function () {
                const sc = this.properties?.scale || 1.0;

                // Read the show_labels setting, defaulting to True if undefined
                const showLabelsW = this.widgets?.find(w => w.name === "show_labels");
                const showLabels = showLabelsW ? showLabelsW.value : true;

                // Shrink width and height if labels are hidden
                const currentW = showLabels ? 85 : 63;
                const currentH = showLabels ? BASE_H : 30;

                return [currentW * sc, currentH * sc];
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

            const configurePorts = () => {
                const pad = node.layout_slot_offset || 6;
                const sc = node.properties?.scale || 1.0;

                const showLabelsW = node.widgets?.find(w => w.name === "show_labels");
                const showLabels = showLabelsW ? showLabelsW.value : true;

                const currentW = showLabels ? 85 : 63;
                const currentH = showLabels ? BASE_H : 30;

                // MUX in
                if (node.inputs && node.inputs.length > 0) {
                    node.inputs[0].label = " ";
                    // Top left if labels shown, middle left if shrunk
                    node.inputs[0].pos = [10 * sc, showLabels ? pad : ((currentH / 2) * sc)];
                }

                // F and I out
                if (node.outputs) {
                    const targetW = node.widgets?.find(w => w.name === "target_channel");
                    const targetText = targetW ? targetW.value : "MUX";

                    node.outputs.forEach((o, i) => {
                        o.type = "*"; // Force wildcard to connect to strictly typed array dropdowns
                        o.color_on = "#00aaff"; // Blue output for strings
                        o.color_off = "#888888";

                        if (showLabels) {
                            o.label = i === 0 ? "STR" : "*";
                            o.tooltip = "";
                            // Add extra spacing between outputs when labels are shown
                            o.pos = [(currentW * sc) - (40 * sc) + (i * 25 * sc), pad];
                        } else {
                            o.label = " ";
                            o.tooltip = targetText;
                            // Keep them tight, but physically spaced 
                            o.pos = [(currentW * sc) - (33 * sc) + (i * 20 * sc), (currentH / 2) * sc];
                        }
                    });
                }
            };

            if (node.outputs || node.inputs) configurePorts();
            setTimeout(configurePorts, 50);

            node.refreshHarvestedOptions = function() {
                if (!node.inputs || node.inputs.length === 0) return;
                
                // Track if we found any valid options. If not, don't overwrite user's manual lists
                let foundOptions = false;
                
                // Check all inputs that are connected
                node.inputs.forEach(input => {
                    if (input.link) {
                        const linkInfo = app.graph.links[input.link];
                        if (linkInfo) {
                            const originNode = app.graph.getNodeById(linkInfo.origin_id);
                            if (originNode && originNode.outputs) {
                                // Sometimes the origin output is tied to a widget name
                                const originOutput = originNode.outputs[linkInfo.origin_slot];
                                
                                // Alternatively, check if the origin node is a primitive that HAS a combo widget
                                if (originNode.widgets) {
                                    // ComfyUI primitives usually have their combo data in widget 0 or matching the output name
                                    const comboWidget = originNode.widgets.find(w => w.type === "combo" && w.options && w.options.values);
                                    if (comboWidget) {
                                        const harvestedOpts = comboWidget.options.values.join(", ");
                                        const myOptsW = node.widgets?.find(w => w.name === "options");
                                        if (myOptsW) {
                                            myOptsW.value = harvestedOpts;
                                            foundOptions = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                
                // If it's directly connected to an output that we can trace forward (for complex custom nodes)
                // This preserves the original logic while adding the standard reverse-link trace above.
                if (!foundOptions && node.outputs) {
                    node.outputs.forEach((out, slotIndex) => {
                       if (out.links) {
                           out.links.forEach(linkId => {
                               const linkInfo = app.graph.links[linkId];
                               if (linkInfo) {
                                    const targetNode = app.graph.getNodeById(linkInfo.target_id);
                                    if (targetNode && targetNode.inputs) {
                                        const targetInput = targetNode.inputs[linkInfo.target_slot];
                                        if (targetInput && targetInput.widget && targetNode.widgets) {
                                            const actualWidget = targetNode.widgets.find(w => w.name === targetInput.widget.name);
                                            if (actualWidget && actualWidget.type === "combo" && actualWidget.options && actualWidget.options.values) {
                                                const harvestedOpts = actualWidget.options.values.join(", ");
                                                const myOptsW = node.widgets?.find(w => w.name === "options");
                                                if (myOptsW) {
                                                    myOptsW.value = harvestedOpts;
                                                }
                                            }
                                        }
                                    }
                               }
                           });
                       } 
                    });
                }
            };

            node.onConnectionsChange = function (slotType, slotIndex, isConnected, linkInfo) {
                cleanupUI();
                configurePorts();

                // Generate strings automatically when wires change
                if (isConnected) {
                    // Slight delay to ensure the graph link is fully registered in ComfyUI memory
                    setTimeout(() => { node.refreshHarvestedOptions(); }, 50);
                }
            };

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const sc = this.properties?.scale || 1.0;

                const showLabelsW = this.widgets?.find(w => w.name === "show_labels");
                const showLabels = showLabelsW ? showLabelsW.value : true;

                const currentW = showLabels ? 85 : 63;
                const currentH = showLabels ? BASE_H : 30;

                const W = currentW * sc;
                const H = currentH * sc;

                ctx.save();

                // Chassis
                ctx.fillStyle = "#1e1e1e";
                ctx.beginPath();
                ctx.roundRect(0, 0, W, H, 8 * sc);
                ctx.fill();
                ctx.strokeStyle = "#333";
                ctx.lineWidth = 1 * sc;
                ctx.stroke();

                // Target Channel Display (Only if labels are shown)
                if (showLabels) {
                    const targetW = node.widgets?.find(w => w.name === "target_channel");
                    const targetText = targetW ? targetW.value : "MUX";

                    ctx.fillStyle = "#ffaa00"; // default Shima orange
                    const fontSize = Math.max(8, Math.floor(12 * sc));
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.fillText(targetText, W / 2, H / 2 + (4 * sc));
                }

                ctx.restore();
            };

            // Custom Tooltip Drawer since LiteGraph's is failing
            node.onDrawForeground = function (ctx) {
                if (this.flags.collapsed) return;

                const showLabelsW = this.widgets?.find(w => w.name === "show_labels");
                if (!showLabelsW || showLabelsW.value !== false) return; // Only draw when shrunk

                // If mouse is hovering near output ports, draw tooltip
                if (app.canvas.node_over === this && app.canvas.mouse) {
                    const localX = app.canvas.graph_mouse[0] - this.pos[0];
                    const localY = app.canvas.graph_mouse[1] - this.pos[1];
                    const sc = this.properties?.scale || 1.0;

                    // Out ports are at right
                    if (localX > (63 / 2) * sc) {
                        const targetW = node.widgets?.find(w => w.name === "target_channel");
                        const targetText = targetW ? targetW.value : "MUX";

                        ctx.save();
                        ctx.font = `bold ${Math.max(10, Math.floor(12 * sc))}px sans-serif`;
                        const tw = ctx.measureText(targetText).width;

                        // Tooltip Body
                        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
                        ctx.beginPath();
                        ctx.roundRect(localX + 10, localY - 20, tw + 16, 20, 4);
                        ctx.fill();
                        ctx.strokeStyle = "#ffaa00";
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        // Tooltip Text
                        ctx.fillStyle = "#ffaa00";
                        ctx.textAlign = "left";
                        ctx.fillText(targetText, localX + 18, localY - 6);
                        ctx.restore();
                    }
                }
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Demux Config",
                    callback: () => {
                        const targetW = node.widgets.find(w => w.name === "target_channel");

                        const shade = document.createElement("div");
                        shade.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:9999;";
                        const panel = document.createElement("div");
                        panel.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:250px; background:#1e1e1e; padding:20px; border-radius:8px; border:2px solid #333; z-index:10000; color:white; font-family:sans-serif;";

                        panel.innerHTML = "<h3 style='margin-top:0; color:#f2a900;'>Demux Channel</h3>";

                        // Trace upstream connection to populate dropdown
                        let originLabels = [];
                        if (node.inputs && node.inputs.length > 0 && node.inputs[0].link) {
                            const link = app.graph.links[node.inputs[0].link];
                            if (link) {
                                const originNode = app.graph.getNodeById(link.origin_id);
                                if (originNode && originNode.comfyClass === "Shima.Omnijog") {
                                    const rowsW = originNode.widgets?.find(w => w.name === "rows");
                                    const rowLimit = rowsW ? parseInt(rowsW.value) || 10 : 10;
                                    for (let i = 0; i < rowLimit; i++) {
                                        const labelW = originNode.widgets?.find(w => w.name === `label_${i}`);
                                        if (labelW && labelW.value) {
                                            originLabels.push(labelW.value);
                                        }
                                    }
                                }
                            }
                        }

                        const row = document.createElement("div");
                        row.innerHTML = `<b style='font-size:12px;'>Listen for Channel:</b>`;

                        let inp;
                        if (originLabels.length > 0) {
                            inp = document.createElement("select");
                            let foundMatch = false;

                            originLabels.forEach(lbl => {
                                const opt = document.createElement("option");
                                opt.value = lbl;
                                opt.innerText = lbl;
                                if (targetW && targetW.value === lbl) {
                                    opt.selected = true;
                                    foundMatch = true;
                                }
                                inp.appendChild(opt);
                            });

                            // If current target_channel isn't in the upstream list, append it as a missing indicator
                            if (targetW && targetW.value && !foundMatch) {
                                const opt = document.createElement("option");
                                opt.value = targetW.value;
                                opt.innerText = `${targetW.value} (Missing on Host)`;
                                opt.selected = true;
                                inp.appendChild(opt);
                            }
                        } else {
                            // Fallback to text input if not connected or upstream has no channels
                            inp = document.createElement("input");
                            inp.type = "text";
                            inp.placeholder = "Connect to an Omnijog to see available channels.";
                            inp.value = targetW ? targetW.value : "CFG";
                        }

                        inp.style.cssText = "width:100%; padding:5px; margin:5px 0 15px 0; background:#111; color:white; border:1px solid #444; box-sizing:border-box; font-weight:bold;";
                        row.appendChild(inp);
                        panel.appendChild(row);

                        // Show Labels Checkbox
                        const showLabelsW = node.widgets?.find(w => w.name === "show_labels");
                        const row2 = document.createElement("div");
                        row2.style.cssText = "display:flex; align-items:center; margin-bottom:15px;";

                        const chk = document.createElement("input");
                        chk.type = "checkbox";
                        chk.checked = showLabelsW ? showLabelsW.value : true;
                        chk.style.cssText = "margin-right:8px; cursor:pointer;";

                        const chkLabel = document.createElement("span");
                        chkLabel.innerText = "Show Labels";
                        chkLabel.style.cssText = "font-size:12px; font-weight:bold;";

                        row2.appendChild(chk);
                        row2.appendChild(chkLabel);
                        panel.appendChild(row2);

                        const optionsW = node.widgets?.find(w => w.name === "options");
                        const row3 = document.createElement("div");
                        row3.style.cssText = "margin-top:15px;";
                        row3.innerHTML = `<b style='font-size:12px;'>Output Items (Comma Separated):</b><br><span style='font-size:10px; color:#aaa;'>(Auto-fills when connected to a dropdown list)</span>`;
                        const txtArea = document.createElement("textarea");
                        txtArea.value = optionsW ? optionsW.value : "Euler, Euler A, etc";
                        txtArea.style.cssText = "width:100%; height:80px; padding:5px; margin-top:5px; background:#111; color:white; border:1px solid #444; box-sizing:border-box; font-family:monospace; font-size:11px;";
                        row3.appendChild(txtArea);
                        panel.appendChild(row3);

                        const footer = document.createElement("div");
                        footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top: 15px;";
                        const btnOk = document.createElement("button");
                        btnOk.innerText = "Save";
                        btnOk.style.cssText = "background:#0084ff; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;";
                        btnOk.onclick = () => {
                            if (targetW) {
                                targetW.value = inp.value || inp.options[inp.selectedIndex]?.value;
                            }
                            if (showLabelsW) {
                                showLabelsW.value = chk.checked;
                            }
                            if (optionsW) {
                                optionsW.value = txtArea.value;
                            }
                            node.refreshHarvestedOptions(); // Re-scan the noodles!
                            node.onConnectionsChange(); // Force port redraw
                            node.setDirtyCanvas(true, true);
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
