import { app } from "../../scripts/app.js";

/**
 * Shima Custodian - Frontend Extension
 * Maintenance utilities for the Shima extension.
 */

app.registerExtension({
    name: "Shima.Custodian",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.Custodian") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.Custodian") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;
            node.size = [240, 180];

            node.computeSize = function () {
                return [240, 180];
            };

            node._status_msg = "System Ready";

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

            // Button Rectangles [x, y, w, h] - Centered for 240 width
            const bX = (240 - 200) / 2;
            const btn1 = [bX, 50, 200, 26];
            const btn2 = [bX, 85, 200, 26];
            const btn3 = [bX, 120, 200, 26];

            const drawBtn = (ctx, rect, label, color, isHovered) => {
                const [bx, by, bw, bh] = rect;
                ctx.fillStyle = isHovered ? color : "#222";
                ctx.beginPath();
                ctx.roundRect(bx, by, bw, bh, 4);
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = isHovered ? "#fff" : color;
                ctx.font = "bold 11px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(label, bx + bw / 2, by + bh / 2 + 1);
            };

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;
                const [w, h] = this.size;

                ctx.save();

                // Chassis Floor
                ctx.fillStyle = "#161616";
                ctx.beginPath();
                ctx.roundRect(0, 0, w, h, 8);
                ctx.fill();
                ctx.strokeStyle = "#333";
                ctx.lineWidth = 2;
                ctx.stroke();

                // Header
                ctx.fillStyle = "#f2a900"; // Caution yellow
                ctx.font = "bold 13px Arial";
                ctx.textAlign = "center";
                ctx.fillText("SHIMA CUSTODIAN", w / 2, 24);

                // Divider
                ctx.beginPath();
                ctx.moveTo(15, 34);
                ctx.lineTo(w - 15, 34);
                ctx.strokeStyle = "#f2a900";
                ctx.lineWidth = 1;
                ctx.stroke();

                // Buttons
                drawBtn(ctx, btn1, "☢️ NUKE __PYCACHE__", "#ff4444", this._hover_btn === 1);
                drawBtn(ctx, btn2, "🏷️ TOGGLE ALL DYMOS", "#44aaff", this._hover_btn === 2);
                drawBtn(ctx, btn3, "📰 TOGGLE ALL HEADLINES", "#44aaff", this._hover_btn === 3);

                // Status
                ctx.fillStyle = "#666";
                ctx.font = "10px sans-serif";
                ctx.fillText(this._status_msg || "System Ready", w / 2, h - 12);

                ctx.restore();
            };

            // Hit Testing
            const testHit = (x, y, rect) => {
                return (x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3]);
            };

            node.onMouseMove = function (e, localPos) {
                const [x, y] = localPos;
                let h = 0;
                if (testHit(x, y, btn1)) h = 1;
                else if (testHit(x, y, btn2)) h = 2;
                else if (testHit(x, y, btn3)) h = 3;

                if (this._hover_btn !== h) {
                    this._hover_btn = h;
                    this.setDirtyCanvas(true);
                }
            };

            node.onMouseLeave = function () {
                this._hover_btn = 0;
                this.setDirtyCanvas(true);
            };

            node.onMouseDown = function (e, localPos) {
                if (e.button !== 0) return; // Only left-click
                const [x, y] = localPos;

                if (testHit(x, y, btn1)) { // Nuke Pycache
                    if (confirm("This will recursively delete ALL __pycache__ folders inside the Shima extension directory.\n\nProceed?")) {
                        this._status_msg = "Nuking cache...";
                        this.setDirtyCanvas(true);
                        fetch("/shima/maintenance/pycache", { method: "POST" })
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    this._status_msg = `Deleted ${data.count} caches.`;
                                    alert(`Deleted ${data.count} __pycache__ folders.`);
                                } else {
                                    this._status_msg = `Error: ${data.message}`;
                                }
                                this.setDirtyCanvas(true);
                            }).catch(err => {
                                this._status_msg = "Network Error.";
                                this.setDirtyCanvas(true);
                            });
                    }
                    return true;
                }

                const toggleNodes = (targetClass, label) => {
                    const nodes = app.graph._nodes.filter(n => n.comfyClass === targetClass);
                    if (nodes.length === 0) {
                        this._status_msg = `No ${label}s found.`;
                        this.setDirtyCanvas(true);
                        return;
                    }
                    const isHidden = !nodes[0].properties.hidden;
                    nodes.forEach(n => {
                        n.properties.hidden = isHidden;
                        n.setDirtyCanvas(true);
                    });
                    this._status_msg = `${label}s ${isHidden ? "HIDDEN" : "VISIBLE"}`;
                    this.setDirtyCanvas(true);
                };

                if (testHit(x, y, btn2)) {
                    toggleNodes("Shima.DymoLabel", "Dymo");
                    return true;
                }

                if (testHit(x, y, btn3)) {
                    toggleNodes("Shima.Headline", "Headline");
                    return true;
                }
            };
        }
    }
});
