import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Shima Workflow Checker Frontend
 * Provides diagnostic tools and troubleshooting menus.
 */

app.registerExtension({
    name: "Shima.WorkflowChecker",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.WorkflowChecker") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const node = this;

                // Hit testing utility
                const testHit = (x, y, rect) => {
                    if (!rect) return false;
                    return (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
                };

                // Node Sizing
                node.computeSize = function () {
                    const show_text = this._report_data || "IDLE";
                    if (show_text.startsWith("FAIL")) {
                        const lines = show_text.split("\n").length;
                        return [450, Math.max(300, lines * 22 + 150)];
                    }
                    return [450, 150];
                };

                // Custodian-style background drawing
                node.onDrawBackground = function (ctx) {
                    if (this.flags.collapsed) return;
                    const [w, h] = this.size;
                    const show_text = this._report_data || "IDLE";
                    const isScanning = show_text === "SCANNING";

                    const isPass = show_text.startsWith("GOOD");
                    const isFail = show_text.startsWith("FAIL");
                    const isIdle = show_text.startsWith("IDLE");

                    ctx.save();

                    // 1. Chassis Floor
                    ctx.fillStyle = "#111";
                    ctx.beginPath();
                    ctx.roundRect(0, 0, w, h, 8);
                    ctx.fill();
                    ctx.strokeStyle = "#333";
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // 2. Status Button Panel (The Interactive Area)
                    let panelY = 40; // Below the title
                    let panelH = 50;

                    this._buttonRect = { x: 15, y: panelY, w: w - 30, h: panelH };

                    ctx.beginPath();
                    ctx.roundRect(this._buttonRect.x, this._buttonRect.y, this._buttonRect.w, this._buttonRect.h, 10);

                    if (isIdle || isScanning) {
                        ctx.fillStyle = this._is_hovering ? "#333" : "#222";
                        ctx.fill();
                        ctx.strokeStyle = this._is_hovering ? "#bbb" : "#888";
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        ctx.fillStyle = isScanning ? "#FFEA00" : "#fff";
                        ctx.font = "bold 24px sans-serif";
                        ctx.textAlign = "center";
                        ctx.fillText(isScanning ? "SCANNING..." : "SCAN WORKFLOW", w / 2, panelY + 33);
                    } else if (isPass) {
                        ctx.fillStyle = this._is_hovering ? "#2f2" : "#0f0";
                        ctx.fill();
                        ctx.strokeStyle = "#fff";
                        ctx.lineWidth = 3;
                        ctx.stroke();

                        ctx.fillStyle = "#000";
                        ctx.font = "bold 26px sans-serif";
                        ctx.textAlign = "center";
                        ctx.fillText("LOOKS GOOD!", w / 2, panelY + 35);
                    } else if (isFail) {
                        ctx.fillStyle = this._is_hovering ? "#f22" : "#d00"; // Brighter Red
                        ctx.fill();
                        ctx.strokeStyle = "#fff";
                        ctx.lineWidth = 3;
                        ctx.stroke();

                        ctx.fillStyle = "#fff";
                        ctx.font = "bold 24px sans-serif";
                        ctx.textAlign = "center";
                        ctx.fillText("ISSUES BELOW:", w / 2, panelY + 33);
                    }

                    // 3. Detailed Report Area
                    if (isFail) {
                        let detailY = panelY + panelH + 30;
                        const lines = show_text.split("\n").slice(1);

                        for (const line of lines) {
                            if (!line.trim()) continue;

                            if (line.startsWith("(")) {
                                ctx.fillStyle = "#FFEA00"; // (Node Info) in yellow
                                ctx.font = "bold 12px sans-serif";
                                ctx.textAlign = "left";
                                ctx.fillText(line, 20, detailY);
                                detailY += 16;
                            } else if (line.endsWith(":")) {
                                ctx.fillStyle = "#FFEA00"; // Asset label in yellow
                                ctx.font = "12px sans-serif";
                                ctx.textAlign = "left";
                                ctx.fillText(line, 20, detailY);
                                detailY += 16;
                            } else if (line.startsWith("***")) {
                                ctx.fillStyle = "#888";
                                ctx.font = "italic 11px sans-serif";
                                ctx.textAlign = "left";
                                ctx.fillText(line, 20, detailY + 10);
                                detailY += 20;
                            } else {
                                ctx.fillStyle = "#fff";
                                ctx.font = "12px monospace";
                                ctx.textAlign = "left";
                                ctx.fillText(line, 20, detailY);
                                detailY += 24;
                            }
                        }
                    }

                    ctx.restore();
                };

                this.color = "#222";
                this.bgcolor = "#111";
                this.size = [500, 150];

                return r;
            };
        }
    },

    async nodeCreated(node) {
        if (node.comfyClass === "Shima.WorkflowChecker") {
            const testHit = (x, y, rect) => {
                if (!rect) return false;
                return (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
            };

            node.onMouseMove = function (e, localPos) {
                if (this._buttonRect) {
                    const h = testHit(localPos[0], localPos[1], this._buttonRect);
                    if (this._is_hovering !== h) {
                        this._is_hovering = h;
                        app.canvas.canvas.style.cursor = h ? "pointer" : "default";
                        this.setDirtyCanvas(true);
                    }
                }
            };

            node.onMouseLeave = function () {
                this._is_hovering = false;
                app.canvas.canvas.style.cursor = "default";
                this.setDirtyCanvas(true);
            };

            node.onMouseDown = function (e, localPos) {
                if (e.button !== 0) return;

                if (this._buttonRect && testHit(localPos[0], localPos[1], this._buttonRect)) {
                    console.log("[Shima] Checker button clicked - Spawning scan thread");

                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    e.preventDefault();

                    // Immediate visual feedback
                    this._report_data = "SCANNING";
                    this.setDirtyCanvas(true);

                    // Run scan after brief delay to allow UI to render "SCANNING" frame
                    setTimeout(async () => {
                        await this.scanGraph();
                        this.setDirtyCanvas(true); // Double redraw after update
                    }, 50);

                    return true;
                }
            };
        }
    },

    async setup() {
        const getCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
        LGraphCanvas.prototype.getCanvasMenuOptions = function () {
            const options = getCanvasMenuOptions ? getCanvasMenuOptions.apply(this, arguments) : [];
            options.push(null);
            options.push({
                content: "🔍 Shima Troubleshooting",
                has_submenu: true,
                callback: () => { },
                submenu: {
                    options: [
                        {
                            content: "Help: 'Cannot validate output'",
                            callback: () => {
                                alert("Troubleshooting: 'Cannot validate output'\n\nThis usually means a model or input image is missing.\n\nActions:\n1. Check the Workflow Checker node status.\n2. Ensure required models are in ComfyUI/models/.\n3. Verify input images exist in ComfyUI/input/.");
                            }
                        },
                        {
                            content: "Help: 'Black Screen' on internal pages",
                            callback: () => {
                                alert("Troubleshooting: Connection Error (Cloud VM)\n\nIf Styler/Excel fails to load:\n1. Ensure you are using the full /web-url/ trailing slash if applicable.\n2. Force a hard refresh (Ctrl+F5).\n3. Check your browser console for 'Blocked by X-Frame-Options' errors.");
                            }
                        }
                    ]
                }
            });
            return options;
        };
    }
});

// Custom Ephemeral Highlighting (Non-Persistent)
const originalOnDrawForeground = LGraphNode.prototype.onDrawForeground;
LGraphNode.prototype.onDrawForeground = function (ctx, canvas) {
    const r = originalOnDrawForeground ? originalOnDrawForeground.apply(this, arguments) : undefined;

    if (this._shima_scan_error && !this.flags.collapsed) {
        ctx.save();
        ctx.strokeStyle = "#f00";
        ctx.lineWidth = 4;
        ctx.lineJoin = "round";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "red";

        ctx.beginPath();
        ctx.roundRect(-4, -4, this.size[0] + 8, this.size[1] + 8, 8);
        ctx.stroke();
        ctx.restore();
    }
    return r;
};

// Global Method for Scanning (Attached to prototype so Checker node can find it)
LGraphNode.prototype.scanGraph = async function () {
    console.group("[Shima] Diagnostic Scan Started");

    // 0. Force Heavy Sync (God Mode v2)
    console.log("[Shima] Triggering heavy sync (Seeding + Cache-Busting)...");
    try {
        // Stage 1: Server-side re-scan (Models & Input)
        await api.fetchApi("/assets/seed", {
            method: "POST",
            body: JSON.stringify({ roots: ["models", "input"] })
        }).catch(err => console.warn("[Shima] Seed endpoint not found or failed, skipping to Stage 2.", err));

        // Stage 2: Cache-busted definition reload
        const timestamp = Date.now();
        const response = await api.fetchApi(`/object_info?t=${timestamp}`, {
            cache: "no-store",
            headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" }
        });
        const defs = await response.json();

        if (defs) {
            // Update global definitions
            app.nodeDefs = defs;
            console.log("[Shima] Node definitions sync complete.");

            // Nuclear Widget Refresh (Existing Nodes)
            console.log("[Shima] Propagating new definitions to existing nodes...");
            const allNodes = app.graph.nodes || app.graph._nodes || [];
            for (const node of allNodes) {
                const nodeDef = app.nodeDefs[node.comfyClass || node.type];
                if (!nodeDef || !node.widgets) continue;

                const inputs = { ...(nodeDef.input?.required || {}), ...(nodeDef.input?.optional || {}) };
                for (const widget of node.widgets) {
                    if (widget.type === "combo" && widget.options) {
                        const inputDef = inputs[widget.name];
                        if (inputDef && Array.isArray(inputDef[0])) {
                            // Deep refresh: Update the actual choices array
                            const newChoices = inputDef[0];
                            widget.options.values = newChoices;
                        }
                    }
                }
            }

            // Trigger standard refresh if available (ComfyUI-Manager etc)
            if (app.refreshComboValues) {
                await app.refreshComboValues();
            }
        }
    } catch (err) {
        console.error("[Shima] Heavy Sync encountered an error:", err);
    }

    const missing = [];

    // 1. Reset Global State (Clean ephemeral flags)
    const allNodes = app.graph.nodes || app.graph._nodes || [];
    for (const n of allNodes) {
        n._shima_scan_error = false;
        if (n.bgcolor === "#850000") n.bgcolor = null;
    }

    // 2. Scan ALL nodes
    for (const node of allNodes) {
        if (!node.widgets) continue;

        for (const widget of node.widgets) {
            const name = (widget.name || "").toLowerCase();
            const label = (widget.label || "").toLowerCase();

            // Broad Asset Target Identification
            const isAssetField = name.includes("model") || name.includes("ckpt") ||
                name.includes("image") || name.includes("file") ||
                name.includes("vae") || name.includes("lora") ||
                name.includes("upscale") || name.includes("name") ||
                label.includes("model") || label.includes("image") ||
                name.includes("controlnet") || name.includes("ipadapter");

            if (isAssetField && widget.type === "combo") {
                const val = widget.value;
                const choices = widget.options ? widget.options.values : [];

                // NORMALIZE VALUE
                const sVal = (val === undefined || val === null) ? "" : String(val).trim();
                const sValLower = sVal.toLowerCase();

                // CRITICAL FAIL: Skip "None" variations (Intentional skip)
                if (sValLower === "none" || sValLower === "null") continue;

                // NORMALIZE CHOICES
                const normChoices = (choices || []).map(c => String(c.content || c).trim().toLowerCase());

                // ERROR DETECTION:
                // 1. If choices exist, current value MUST be in them (case-insensitive)
                // 2. If no choices exist, but it's an asset field, it's a "Wait-state" but often means it's missing if sVal has content
                let isMissing = false;

                if (normChoices.length > 0) {
                    if (!normChoices.includes(sValLower)) isMissing = true;
                } else if (sVal !== "") {
                    // It has a value but the list is empty? That's suspicious for an asset field.
                    isMissing = true;
                } else if (sVal === "") {
                    // Empty asset field is ALWAYS a fail unless it's strictly "None"
                    isMissing = true;
                }

                if (isMissing) {
                    console.warn(`[Shima] Asset Fail: Node(${node.title || node.id}), Field(${widget.name}), Value(${sVal})`);
                    console.log(`[Shima] Choices available:`, choices);

                    missing.push({
                        node: node.title || node.type || node.id,
                        widget: widget.label || widget.name,
                        value: sVal || "[EMPTY]"
                    });
                    node._shima_scan_error = true;
                }
            }
        }
    }

    // 3. Report Generation
    if (missing.length > 0) {
        console.error(`[Shima] Scan Complete: FOUND ${missing.length} ISSUES`);
        let report = `FAIL\n`;
        missing.forEach(m => {
            report += `(${m.node})\n`;
            const lowerLabel = m.widget.toLowerCase();
            const typeLabel = lowerLabel.includes("image") || lowerLabel.includes("file") ? "Missing File:" : "Missing Asset:";
            report += `${typeLabel}\n`;
            report += `${m.value}\n\n`;
        });
        report += `***Check ComfyUI console if these values look correct to you***`;
        this._report_data = report;
    } else {
        console.log("[Shima] Scan Complete: ALL GOOD");
        this._report_data = "GOOD";
    }

    console.groupEnd();

    if (this.computeSize) {
        this.size = this.computeSize();
    }
    app.canvas.setDirty(true, true);
};
