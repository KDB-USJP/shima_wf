import { app } from "../../scripts/app.js";

/**
 * Shima Highway Detour & Merge - Frontend Extension (V2)
 * Switches between parallel paths with a single-button toggle.
 */

app.registerExtension({
    name: "Shima.HighwayDetour",
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.HighwayDetour" || node.comfyClass === "Shima.HighwayMerge") {

            // --- Styling ---
            node.bgcolor = "#222";
            node.boxcolor = "#333";
            node.shima_ignore_color = true;

            // --- Widget Utility ---
            const getW = (name) => node.widgets?.find(w => w.name === name);

            // --- Widget Hiding ---
            function hideWidgets() {
                const hidden = ["active_route", "merge_state", "label_1", "label_2"];
                hidden.forEach(name => {
                    const w = getW(name);
                    if (w) {
                        w.type = "hidden";
                        w.hidden = true;
                        w.label = "";
                        w.computeSize = () => [0, 0];
                        if (w.element) w.element.style.display = "none";
                        w.onDraw = () => { };
                    }
                });
            }
            hideWidgets();
            [50, 100, 250, 500, 1000].forEach(ms => setTimeout(hideWidgets, ms));

            // Hide automation input label on Detour only
            const hideInputLabels = () => {
                if (node.comfyClass === "Shima.HighwayDetour") {
                    const automateInput = node.inputs?.find(i => i.name === "route_automate");
                    if (automateInput) automateInput.label = "";
                }

                // NUCLEAR CLEANUP: Remove ANY input that isn't explicitly in the whitelist
                if (node.inputs) {
                    const isDetour = node.comfyClass === "Shima.HighwayDetour";
                    const isMerge = node.comfyClass === "Shima.HighwayMerge";

                    if (isDetour || isMerge) {
                        const whitelist = isDetour ? ["data", "route_automate"] : ["Route_1", "Route_2"];
                        for (let i = 0; i < node.inputs.length; i++) {
                            const input = node.inputs[i];
                            if (!whitelist.includes(input.name)) {
                                console.log(`[Shima] Nuclear pruning ghost input: ${input.name || "unnamed"}`);
                                node.removeInput(i);
                                i--;
                            }
                        }
                    }
                }
            };
            hideInputLabels();
            setTimeout(hideInputLabels, 100);
            setTimeout(hideInputLabels, 500);
            setTimeout(hideInputLabels, 1000);
            setTimeout(hideInputLabels, 2500); // Final sweep for slow loaders

            const TOP_PAD = 50;
            const BOT_PAD = 15;
            const SIDE_PAD = 15;

            // --- Traversal & Sync Logic ---
            const updateDetourPaths = (detourNode, activeRoute) => {
                const visited = new Set();

                // 1. Find the Merge Node(s)
                const findMergeNodes = (startNode) => {
                    const found = [];
                    const q = [...(startNode.outputs?.[0]?.links || []), ...(startNode.outputs?.[1]?.links || [])]
                        .map(id => app.graph.links[id])
                        .filter(l => l)
                        .map(l => app.graph.getNodeById(l.target_id));

                    const qVisited = new Set();
                    while (q.length > 0) {
                        const n = q.shift();
                        if (!n || qVisited.has(n.id)) continue;
                        qVisited.add(n.id);
                        if (n.comfyClass === "Shima.HighwayMerge") {
                            found.push(n);
                            continue;
                        }
                        if (n.outputs) {
                            for (const out of n.outputs) {
                                if (out.links) {
                                    q.push(...out.links.map(id => app.graph.links[id]).filter(l => l).map(l => app.graph.getNodeById(l.target_id)));
                                }
                            }
                        }
                    }
                    return found;
                };

                const mergeNodes = findMergeNodes(detourNode);

                // 2. Trace and toggle branches
                const toggleBranch = (outputIndex, enable) => {
                    const q = (detourNode.outputs?.[outputIndex]?.links || [])
                        .map(id => app.graph.links[id])
                        .filter(l => l)
                        .map(l => app.graph.getNodeById(l.target_id));

                    const branchVisited = new Set();
                    while (q.length > 0) {
                        const n = q.shift();
                        if (!n || branchVisited.has(n.id)) continue;
                        branchVisited.add(n.id);

                        if (n.comfyClass === "Shima.HighwayMerge" || n.comfyClass === "Shima.HighwayDetour") continue;

                        n.mode = enable ? 0 : 4;

                        if (n.outputs) {
                            for (const out of n.outputs) {
                                if (out.links) {
                                    q.push(...out.links.map(id => app.graph.links[id]).filter(l => l).map(l => app.graph.getNodeById(l.target_id)));
                                }
                            }
                        }
                    }
                };

                toggleBranch(0, activeRoute === 0);
                toggleBranch(1, activeRoute === 1);

                // 3. Sync Merge Nodes
                for (const mergeNode of mergeNodes) {
                    const mW = mergeNode.widgets?.find(w => w.name === "merge_state");
                    if (mW) {
                        mW.value = activeRoute;
                        mergeNode.setDirtyCanvas(true, true);
                    }
                }
            };

            // --- Exposure ---
            // Allow other nodes (like ChoiceSwitch) to trigger a visual sync
            node.updateHighwayPaths = (activeRoute) => updateDetourPaths(node, activeRoute);

            // --- Initialization Fix ---
            // Ensure the inactive path is muted immediately upon placement/creation
            if (node.comfyClass === "Shima.HighwayDetour") {
                const initMute = () => {
                    const w = getW("active_route");
                    if (w) updateDetourPaths(node, w.value);
                };
                setTimeout(initMute, 500); // Small delay to let graph connect
            }

            // --- Rendering ---
            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const isDetour = this.comfyClass === "Shima.HighwayDetour";
                const activeRoute = isDetour ? getW("active_route")?.value : getW("merge_state")?.value;
                const cornerRadius = 8;

                const box = {
                    x: SIDE_PAD,
                    y: TOP_PAD,
                    w: this.size[0] - (SIDE_PAD * 2),
                    h: this.size[1] - (TOP_PAD + BOT_PAD)
                };

                const L1 = getW("label_1")?.value || (isDetour ? "ROUTE 1" : "MERGE RT 1");
                const L2 = getW("label_2")?.value || (isDetour ? "ROUTE 2" : "MERGE RT 2");
                const label = activeRoute === 0 ? L1 : L2;
                const icon = isDetour ? "⚠️" : "🛣️";

                // Colors per mockup:
                // RT 1: BG Black, Stroke 3px #efe813, Text #efe813
                // RT 2: BG #ffffab, Stroke 3px Black, Text Black
                const bgColor = activeRoute === 0 ? "#000000" : "#ffffab";
                const strokeColor = activeRoute === 0 ? "#efe813" : "#000000";
                const textColor = strokeColor;

                ctx.save();

                // Button Background
                ctx.fillStyle = bgColor;
                ctx.beginPath();
                ctx.roundRect(box.x, box.y, box.w, box.h, cornerRadius);
                ctx.fill();

                // Button Stroke (3px)
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 3;
                ctx.stroke();

                // Text
                ctx.fillStyle = textColor;
                ctx.font = "bold 18px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`${icon}  ${label}`, box.x + box.w / 2, box.y + box.h / 2);

                ctx.restore();
            };

            // --- Interaction (Single Toggle) ---
            node.onMouseDown = function (e, localPos) {
                if (this.flags.collapsed) return;

                // Only allow click interaction on the Detour node.
                // The Merge node is slave to the Detour and cannot be toggled manually.
                if (this.comfyClass !== "Shima.HighwayDetour") return;

                const [x, y] = localPos;

                if (x >= SIDE_PAD && x <= this.size[0] - SIDE_PAD && y >= TOP_PAD && y <= this.size[1] - BOT_PAD) {
                    const w = getW("active_route");
                    if (w) {
                        w.value = w.value === 0 ? 1 : 0;
                        updateDetourPaths(this, w.value);
                        this.setDirtyCanvas(true, true);
                        if (w.callback) w.callback(w.value);
                    }
                    return true;
                }
            };

            // --- Label Editor Modal ---
            node.onDblClick = function () {
                const w1 = getW("label_1");
                const w2 = getW("label_2");

                const dialog = document.createElement("dialog");
                dialog.style.cssText = `
                    padding: 20px; background: #2a2a2a; color: #eee;
                    border: 1px solid #444; border-radius: 8px; width: 300px;
                    display: flex; flex-direction: column; gap: 15px;
                `;
                dialog.innerHTML = `
                    <h3 style="margin:0;">🏷️ Edit Highway Labels</h3>
                    <div>
                        <label style="display:block; font-size:12px; color:#888; margin-bottom:4px;">Route 1 Label</label>
                        <input id="l1" type="text" value="${w1?.value || ""}" style="width:100%; padding:8px; background:#1a1a1a; border:1px solid #444; color:#fff; border-radius:4px;">
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; color:#888; margin-bottom:4px;">Route 2 Label</label>
                        <input id="l2" type="text" value="${w2?.value || ""}" style="width:100%; padding:8px; background:#1a1a1a; border:1px solid #444; color:#fff; border-radius:4px;">
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button id="cancel" style="padding:6px 12px; background:#444; border:none; color:#fff; cursor:pointer; border-radius:4px;">Cancel</button>
                        <button id="save" style="padding:6px 16px; background:#3a7c5a; border:none; color:#fff; cursor:pointer; border-radius:4px; font-weight:bold;">Save Labels</button>
                    </div>
                `;

                document.body.appendChild(dialog);
                dialog.showModal();

                dialog.querySelector("#cancel").onclick = () => { dialog.close(); dialog.remove(); };
                dialog.querySelector("#save").onclick = () => {
                    if (w1) w1.value = dialog.querySelector("#l1").value;
                    if (w2) w2.value = dialog.querySelector("#l2").value;
                    this.setDirtyCanvas(true, true);
                    dialog.close();
                    dialog.remove();
                };
            };

            node.size = [240, 110];
        }
    }
});
