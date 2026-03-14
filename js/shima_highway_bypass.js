import { app } from "../../scripts/app.js";

/**
 * Shima Highway Bypass - Frontend Extension
 * A structural toggle that bypasses nodes between bypass instances.
 */

app.registerExtension({
    name: "Shima.HighwayBypass",
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.HighwayBypass" || node.comfyClass === "Shima.HighwayBypassTerminator") {
            const isTerminator = node.comfyClass === "Shima.HighwayBypassTerminator";

            // --- Styling ---
            node.bgcolor = "#222";
            node.boxcolor = isTerminator ? "#444" : "#333";
            node.shima_ignore_color = true;

            // --- Widget Utility ---
            const getW = (name) => node.widgets?.find(w => w.name === name);

            // --- Widget Hiding ---
            function hideWidgets() {
                const w = getW("bypass_state");
                if (w) {
                    w.type = "hidden";
                    w.hidden = true;
                    w.label = "";
                    w.computeSize = () => [0, 0];
                    if (w.element) w.element.style.display = "none";
                    w.onDraw = () => { };
                }
            }
            // Hide immediately and with staggered fallbacks
            hideWidgets();
            [50, 100, 250, 500, 1000].forEach(ms => setTimeout(hideWidgets, ms));

            // Set padding - revert to 50 as requested
            const TOP_PAD = 50;
            const BOT_PAD = 15;
            const SIDE_PAD = 15;

            // --- Traversal Logic ---
            const updateDownstreamBypass = (startNode, isPassing) => {
                const visited = new Set();
                const queue = [];

                // Find nodes connected to our data output (index 0)
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

                    // STOP if we hit another Highway Bypass or a Terminator
                    if (node.comfyClass === "Shima.HighwayBypass" || node.comfyClass === "Shima.HighwayBypassTerminator") continue;

                    // Apply Bypass State
                    // ComfyUI node mode: 0 = Always (ROAD OPEN), 4 = Bypass (BY · PASS)
                    // Note: Mode 2 (Never/Mute) stops execution, which we want to avoid.
                    const targetMode = isPassing ? 0 : 4;
                    if (node.mode !== targetMode) {
                        node.mode = targetMode;
                    }

                    // Continue Traversal
                    if (node.outputs) {
                        for (const output of node.outputs) {
                            // Only traverse relevant outputs (e.g. not the bypass_state output at index 1)
                            // Actually, in Comfy logic, any data flow counts, but we'll stick to primary
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

            // --- Sync Propagation ---
            const propagateHighwaySync = (controllerNode, newState) => {
                // bypass_state output is index 1
                const syncOutput = controllerNode.outputs?.[1];
                if (!syncOutput || !syncOutput.links) return;

                for (const linkId of syncOutput.links) {
                    const link = app.graph.links[linkId];
                    if (!link) continue;

                    const followerNode = app.graph.getNodeById(link.target_id);
                    if (followerNode && followerNode.comfyClass === "Shima.HighwayBypass") {
                        const followerW = followerNode.widgets?.find(w => w.name === "bypass_state");
                        if (followerW) {
                            followerW.value = newState;
                            // Trigger follower's downstream logic
                            updateDownstreamBypass(followerNode, newState === 0);
                            followerNode.setDirtyCanvas(true, true);
                            // Recurse for daisy chains
                            propagateHighwaySync(followerNode, newState);
                        }
                    }
                }
            };

            // --- Rendering ---
            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const isPassing = getW("bypass_state")?.value === 0;
                const cornerRadius = 8;

                const box = {
                    x: SIDE_PAD,
                    y: TOP_PAD,
                    w: this.size[0] - (SIDE_PAD * 2),
                    h: this.size[1] - (TOP_PAD + BOT_PAD)
                };

                // Colors & Text
                const bgColor = isTerminator ? "#333" : (isPassing ? "#CC9900" : "#EFEFEF");
                const textColor = isTerminator ? "#888" : (isPassing ? "white" : "black");
                const text = isTerminator ? "🛑 END BYPASS" : (isPassing ? "🛣️ ROAD OPEN" : "🚧 BY · PASS");
                const fontSize = isTerminator ? "14px" : "bold 20px";

                ctx.save();

                // Button Background
                ctx.fillStyle = bgColor;
                ctx.beginPath();
                ctx.roundRect(box.x, box.y, box.w, box.h, cornerRadius);
                ctx.fill();

                // Active Glow (Open)
                if (isPassing) {
                    ctx.strokeStyle = "rgba(255,255,255,0.4)";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                } else {
                    ctx.strokeStyle = "rgba(0,0,0,0.1)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                // Text
                ctx.fillStyle = textColor;
                ctx.font = `${fontSize} sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2);

                ctx.restore();
            };

            // --- Interaction ---
            node.onMouseDown = function (e, localPos) {
                if (this.flags.collapsed || isTerminator) return;
                const [x, y] = localPos;

                // Hit detection for the big button
                if (x >= SIDE_PAD && x <= this.size[0] - SIDE_PAD && y >= TOP_PAD && y <= this.size[1] - BOT_PAD) {
                    const w = getW("bypass_state");
                    if (w) {
                        // Toggle state: 0 (Open) <-> 1 (Bypass)
                        w.value = w.value === 0 ? 1 : 0;

                        // 1. Execute local traversal
                        updateDownstreamBypass(this, w.value === 0);

                        // 2. Propagate to Followers
                        propagateHighwaySync(this, w.value);

                        this.setDirtyCanvas(true, true);
                        if (w.callback) w.callback(w.value);
                    }
                    return true;
                }
            };

            // Fixed height/width
            node.size = isTerminator ? [160, 80] : [240, 110];
        }
    }
});
