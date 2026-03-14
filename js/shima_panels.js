import { app } from "../../scripts/app.js";

// Global Font Loader registry
const LOADED_FONTS = new Set();
async function loadFont(fontName) {
    if (fontName === "default" || fontName === "sans-serif" || LOADED_FONTS.has(fontName)) return true;
    try {
        const fontUrl = "/shima/assets/fonts/" + fontName;
        const face = new FontFace(fontName, "url(" + fontUrl + ")");
        await face.load();
        document.fonts.add(face);
        LOADED_FONTS.add(fontName);
        return true;
    } catch (e) {
        console.error("[Shima Panels] Failed to load font: " + fontName, e);
        return false;
    }
}

// Helper to darken hex colors for gradients
function _darkenHexString(hexStr, amount) {
    if (!hexStr || !hexStr.startsWith("#")) return "#000000";
    let hex = hexStr.substring(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    r = Math.max(0, r - amount);
    g = Math.max(0, g - amount);
    b = Math.max(0, b - amount);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Function to spawn the heavy-duty HTML Modal over the ComfyUI canvas
function spawnPanelModal(node, titleText, callback) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0"; overlay.style.left = "0"; overlay.style.width = "100vw"; overlay.style.height = "100vh";
    overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
    overlay.style.zIndex = 10000;
    overlay.style.display = "flex"; overlay.style.justifyContent = "center"; overlay.style.alignItems = "center";
    overlay.style.backdropFilter = "blur(5px)";

    const box = document.createElement("div");
    box.style.backgroundColor = "#1a1a1a";
    box.style.border = "3px solid #333";
    box.style.borderRadius = "12px";
    box.style.padding = "30px";
    box.style.width = "600px";
    box.style.boxShadow = "0 20px 50px rgba(0,0,0,0.9)";
    box.style.fontFamily = "sans-serif";
    box.style.display = "grid";
    box.style.gridTemplateColumns = "1fr 1fr";
    box.style.gap = "15px";

    const header = document.createElement("div");
    header.textContent = titleText + " CONFIGURATION";
    header.style.color = "#ccc";
    header.style.marginBottom = "20px";
    header.style.fontSize = "18px";
    header.style.fontWeight = "bold";
    header.style.gridColumn = "1 / -1";
    header.style.borderBottom = "1px solid #444";
    header.style.paddingBottom = "10px";
    header.style.textAlign = "center";
    box.appendChild(header);

    // Read current payload configuration, or default to standard Sampler settings
    let currentConfig = {};
    if (node.widgets) {
        node.widgets.forEach(w => {
            currentConfig[w.name] = w.value;
        });
    }

    // Helper to generate inputs
    const inputs = {};
    const createInput = (key, label, type, options = null) => {
        const wrap = document.createElement("div");
        wrap.style.display = "flex"; wrap.style.flexDirection = "column";

        const lbl = document.createElement("label");
        lbl.textContent = label;
        lbl.style.color = "#888"; lbl.style.fontSize = "12px"; lbl.style.marginBottom = "5px";
        wrap.appendChild(lbl);

        let input;
        if (options) { // Select
            input = document.createElement("select");
            options.forEach(optVal => {
                const opt = document.createElement("option");
                opt.value = optVal; opt.text = optVal;
                if (currentConfig[key] === optVal) opt.selected = true;
                input.appendChild(opt);
            });
        } else if (type === "boolean") { // Checkbox
            input = document.createElement("input");
            input.type = "checkbox";
            let val = currentConfig[key];
            if (val === "false" || val === "False" || val === "0") val = false;
            if (val === "true" || val === "True" || val === "1") val = true;
            input.checked = !!val;
            wrap.style.flexDirection = "row";
            wrap.style.alignItems = "center";
            lbl.style.marginBottom = "0"; lbl.style.marginLeft = "10px";
            wrap.insertBefore(input, lbl); // Box before label
        } else { // Text/Number
            input = document.createElement("input");
            input.type = type;
            if (type === "number") input.step = "any";
            input.value = currentConfig[key] !== undefined ? currentConfig[key] : "";
        }

        if (type !== "boolean") {
            input.style.width = "100%";
            input.style.boxSizing = "border-box";
            input.style.backgroundColor = "#222";
            input.style.color = "#fff";
            input.style.border = "1px solid #555";
            input.style.borderRadius = "4px";
            input.style.padding = "8px";
            input.style.fontSize = "14px";
            input.style.fontFamily = "monospace";
        }

        if (type !== "boolean") wrap.appendChild(input);
        box.appendChild(wrap);
        inputs[key] = { element: input, type: type };
    };

    // --- Dynamically Generate Modal Form Fields from Native Widgets ---
    if (node.widgets && node.widgets.length > 0) {
        node.widgets.forEach(w => {
            // Skip hidden systemic properties 
            if (["panel_title", "panel_font", "payload", "use_commonparams", "use_samplercommons", "allow_external_linking"].includes(w.name)) return;

            const safeLabel = w.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

            // Accurately determine if this should be a checkbox
            const isBooleanField = w.type === "toggle" || w.type === "BOOLEAN" || typeof w.value === "boolean" || w.value === "true" || w.value === "false";

            if (isBooleanField) {
                createInput(w.name, safeLabel, "boolean");
            } else if (w.type === "combo" || Array.isArray(w.options?.values) || w.options?.values) {
                // Determine the options array format
                let opts = w.options?.values || [];
                if (!Array.isArray(opts) && typeof opts === "object") opts = Object.values(opts);
                // Also check if the combo is actually just true/false
                if (opts.length === 2 && opts.includes(true) && opts.includes(false)) {
                    createInput(w.name, safeLabel, "boolean");
                } else {
                    createInput(w.name, safeLabel, "select", opts.length > 0 ? opts : null);
                }
            } else if (w.type === "number") {
                createInput(w.name, safeLabel, "number");
            } else if (w.type === "customtext" || w.type === "string" || w.type === "text") {
                // Text input
                createInput(w.name, safeLabel, "text");
            } else {
                // Fallback for unknown text types
                createInput(w.name, safeLabel, "text");
            }
        });
    }

    // --- Footer Controls ---
    const commitBtn = document.createElement("button");
    commitBtn.textContent = "SAVE SHIMA CONFIG";
    commitBtn.style.gridColumn = "1 / -1";
    commitBtn.style.marginTop = "20px";
    commitBtn.style.padding = "15px";
    commitBtn.style.backgroundColor = "#2d7a4d";
    commitBtn.style.color = "white";
    commitBtn.style.border = "none";
    commitBtn.style.borderRadius = "6px";
    commitBtn.style.fontWeight = "bold";
    commitBtn.style.cursor = "pointer";

    commitBtn.onmouseover = () => commitBtn.style.backgroundColor = "#3ba366";
    commitBtn.onmouseout = () => commitBtn.style.backgroundColor = "#2d7a4d";

    const commitAndClose = () => {
        // Write directly back to node widgets
        for (const [key, data] of Object.entries(inputs)) {
            let val = data.element.value;
            if (data.type === "boolean") {
                val = data.element.checked;
            } else if (data.type === "number") {
                val = parseFloat(data.element.value);
            }

            const w = node.widgets?.find(w => w.name === key);
            if (w) {
                w.value = val;
                if (w.callback) w.callback(val);
            }
        }

        document.body.removeChild(overlay);
        callback();
    };

    commitBtn.onclick = commitAndClose;
    box.appendChild(commitBtn);

    const handleEsc = function (ev) {
        if (ev.key === "Escape") {
            ev.preventDefault();
            document.body.removeChild(overlay);
            document.removeEventListener("keydown", handleEsc);
        }
    };
    document.addEventListener("keydown", handleEsc);

    overlay.onclick = function (ev) {
        if (ev.target === overlay) {
            document.body.removeChild(overlay);
            document.removeEventListener("keydown", handleEsc);
        }
    };

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// ==========================================
// CORE COMPONENT LOGIC
// ==========================================
app.registerExtension({
    name: "Shima.Panels",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {

        // 1. PANELIZED TIER 1 GENERATORS
        const panelNodes = ["Shima.PanelSampler", "Shima.PanelModelCitizen", "Shima.PanelLatentMaker", "Shima.PanelMasterPrompt", "Shima.PanelControlAgent"];
        if (panelNodes.includes(nodeData.name)) {
            nodeType.title_mode = LiteGraph.NO_TITLE;

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                this.properties = this.properties || {};
                this.properties.scale = 1.0;

                let defaultTitle = "Shima Sampler";
                let defaultH = 340;
                if (nodeData.name === "Shima.PanelModelCitizen") { defaultTitle = "Model Citizen"; defaultH = 285; }
                else if (nodeData.name === "Shima.PanelLatentMaker") { defaultTitle = "Latent Maker"; defaultH = 215; }
                else if (nodeData.name === "Shima.PanelMasterPrompt") { defaultTitle = "Master Prompt"; defaultH = 255; }
                else if (nodeData.name === "Shima.PanelControlAgent") { defaultTitle = "Control Agent"; defaultH = 260; }

                this.properties.panel_title = defaultTitle;

                // Sync equivalent Use Everywhere broadcasting defaults for these panel equivalents
                setTimeout(() => {
                    if (!this.properties) this.properties = {};
                    this.properties.ue_properties = this.properties.ue_properties || {};
                    this.properties["ue_convert"] = true;
                    this.properties.ue_properties.version = "7.0";

                    if (nodeData.name === "Shima.PanelModelCitizen") {
                        this.properties.ue_properties.output_not_broadcasting = { "MODEL": true, "CLIP": true, "VAE": true, "name_string": true };
                        this.properties.ue_properties.input_regex = "modelcitizen.bndl";
                    } else if (nodeData.name === "Shima.PanelLatentMaker") {
                        this.properties.ue_properties.output_not_broadcasting = { "latent": true, "s33d": true, "width": true, "height": true };
                        this.properties.ue_properties.input_regex = "latentmaker.bndl";
                    } else if (nodeData.name === "Shima.PanelMasterPrompt") {
                        this.properties.ue_properties.output_not_broadcasting = { "positive": true, "negative": true, "CLIP_L_ONLY": true, "CLIP_G_ONLY": true, "T5_ONLY": true, "pos_string": true, "neg_string": true };
                        this.properties.ue_properties.input_regex = "masterprompt.bndl";
                    } else if (nodeData.name === "Shima.PanelSampler") {
                        this.properties.ue_properties.output_not_broadcasting = { "image": true, "latent": true, "s33d_used": true };
                        this.properties.ue_properties.input_regex = "shimasampler.bndl";
                    }
                    if (app.graph) this.setDirtyCanvas(true, true);
                }, 100);
                this.bgcolor = "transparent";
                this.boxcolor = "transparent";
                this.shima_ignore_color = true;
                this.flags = this.flags || {};
                this.flags.no_header = true;

                // Configure standard PCB Size
                const BASE_W = 420;
                const BASE_H = defaultH;
                this.size = [BASE_W, BASE_H];

                this.onResize = function (size) {
                    size[0] = BASE_W;
                    size[1] = BASE_H;
                };

                // Suppress hidden payload widget from showing up
                if (!this.widgets || !this.widgets.find(w => w.name === "payload")) {
                    const w = this.addWidget("string", "payload", "{}");
                    w.type = "hidden";
                    w.hidden = true;
                    w.computeSize = () => [0, -4];
                }

                // Hide commonparams widget
                if (this.widgets) {
                    this.widgets.forEach(w => {
                        if (w.name === "use_commonparams" || w.name === "use_samplercommons" || w.name === "allow_external_linking") {
                            w.type = "hidden";
                            w.hidden = true;
                            w.computeSize = () => [0, -4];
                        }
                    });
                }

                // Hook Double Click to open massive Settings Modal
                this.onDblClick = function (e, pos) {
                    // Check if they clicked the physical PCB buttons first
                    // (To avoid opening modal when toggling switches)
                    const sc = this.properties?.scale || 1.0;
                    const PADDING = 20 * sc;
                    const W = this.size[0];
                    const H = this.size[1];
                    let pillWidth = 46 * sc;
                    let pillHeight = 84 * sc;
                    let pillX = PADDING + (6 * sc);
                    let buttonY = H - PADDING - pillHeight - (3 * sc);

                    if (pos[0] > pillX && pos[0] < pillX + pillWidth && pos[1] > buttonY && pos[1] < buttonY + pillHeight) {
                        return false; // They clicked the switches
                    }

                    spawnPanelModal(this, this.properties.panel_title, (newConfig) => {
                        const payloadWidget = this.widgets.find(w => w.name === "payload");
                        if (payloadWidget) {
                            payloadWidget.value = JSON.stringify(newConfig);
                            app.graph.setDirtyCanvas(true, true);
                        }
                    });
                    return true;
                };
            };

            // Interaction Hooks for standard Overrides (Switches on PCB)
            nodeType.prototype.syncNativePorts = function () {
                if (this.flags.collapsed) return;
                const sc = this.properties?.scale || 1.0;

                const PADDING = 20 * sc;
                const W = this.size[0];

                if (this.inputs) {
                    let validIndex = 0;
                    this.inputs.forEach((inp, i) => {
                        if (!inp) return;
                        if (["payload", "use_commonparams", "use_samplercommons", "allow_external_linking"].includes(inp.name)) {
                            // Banish hidden background variables from physical UI
                            inp.pos = [0, -100];
                            return;
                        }
                        const dotX = PADDING + (30 * sc);
                        const dotY = PADDING + (25 * sc) + (validIndex * 35 * sc);
                        inp.pos = [dotX, dotY];
                        validIndex++;
                    });
                }

                if (this.outputs) {
                    this.outputs.forEach((out, i) => {
                        if (!out) return;
                        const dotX = W - PADDING - (30 * sc);
                        const dotY = PADDING + (25 * sc) + (i * 35 * sc);
                        out.pos = [dotX, dotY];
                    });
                }
            };

            nodeType.prototype.onMouseDown = function (e, local_pos) {
                const sc = this.properties?.scale || 1.0;
                const W = this.size[0];
                const H = this.size[1];
                const x = local_pos[0];
                const y = local_pos[1];

                const PADDING = 20 * sc;

                // Hitbox for Switches (Conditional Layouts)
                const samplerCommonsW = this.widgets?.find(w => w.name === "use_samplercommons");
                let pillWidth = samplerCommonsW ? (84 * sc) : (46 * sc);
                let pillHeight = 84 * sc;
                let pillX = PADDING + (6 * sc);
                let buttonY = H - PADDING - pillHeight - (3 * sc);

                let circle1X = pillX + (23 * sc);
                let circle1Y = buttonY + (22 * sc);
                let circle2X = circle1X;
                let circle2Y = buttonY + pillHeight - (22 * sc);

                const circleRadius = 15 * sc;

                // CommonParams Switch
                if (Math.hypot(x - circle1X, y - circle1Y) < circleRadius) {
                    const w = this.widgets?.find(w => w.name === "use_commonparams");
                    if (w) {
                        w.value = !w.value;
                        app.graph.setDirtyCanvas(true, true);
                        return true;
                    }
                }

                // External Linking Switch
                if (Math.hypot(x - circle2X, y - circle2Y) < circleRadius) {
                    const w = this.widgets?.find(w => w.name === "allow_external_linking");
                    if (w) {
                        w.value = !w.value;
                        app.graph.setDirtyCanvas(true, true);
                        return true;
                    }
                }

                // SamplerCommons Switch
                if (samplerCommonsW) {
                    let circle3X = pillX + (61 * sc);
                    let circle3Y = buttonY + (22 * sc);
                    if (Math.hypot(x - circle3X, y - circle3Y) < circleRadius) {
                        samplerCommonsW.value = !samplerCommonsW.value;
                        app.graph.setDirtyCanvas(true, true);
                        return true;
                    }
                }

                // Title Box Hitbox (Rename trigger)
                let titleH = 46 * sc;
                let titleY = H - (72 * sc); // Shifted UP higher onto the green PCB background
                let titleX = pillX + pillWidth + (16 * sc);
                let titleW = W - PADDING - titleX - (16 * sc); // Narrowed symmetrically to stay inside frame

                if (x > titleX && x < titleX + titleW && y > titleY && y < titleY + titleH) {
                    const overlay = document.createElement("div");
                    overlay.style.position = "fixed";
                    overlay.style.top = "0"; overlay.style.left = "0"; overlay.style.width = "100%"; overlay.style.height = "100%";
                    overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
                    overlay.style.zIndex = 10000;
                    overlay.style.display = "flex"; overlay.style.justifyContent = "center"; overlay.style.alignItems = "center";
                    overlay.style.backdropFilter = "blur(2px)";

                    const box = document.createElement("div");
                    box.style.backgroundColor = "#222";
                    box.style.border = "2px solid #444";
                    box.style.borderRadius = "8px";
                    box.style.padding = "20px";
                    box.style.width = "400px";
                    box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.8)";
                    box.style.display = "flex";
                    box.style.flexDirection = "column";

                    const header = document.createElement("div");
                    header.textContent = "Rename Title Block";
                    header.style.color = "#aaa"; header.style.marginBottom = "15px"; header.style.fontSize = "14px"; header.style.fontFamily = "sans-serif";
                    box.appendChild(header);

                    const input = document.createElement("input");
                    input.type = "text";
                    input.value = this.properties.panel_title || "Shima Sampler";
                    input.style.padding = "10px";
                    input.style.fontSize = "16px";
                    input.style.backgroundColor = "#111";
                    input.style.color = "#fff";
                    input.style.border = "1px solid #555";
                    input.style.borderRadius = "4px";
                    input.style.width = "100%";
                    input.style.boxSizing = "border-box";
                    box.appendChild(input);

                    const fontSelect = document.createElement("select");
                    fontSelect.style.width = "100%";
                    fontSelect.style.marginTop = "10px";
                    fontSelect.style.backgroundColor = "#111";
                    fontSelect.style.color = "#fff";
                    fontSelect.style.border = "1px solid #555";
                    fontSelect.style.borderRadius = "4px";
                    fontSelect.style.padding = "8px";
                    box.appendChild(fontSelect);

                    // Fetch fonts from API
                    fetch('/shima/fonts')
                        .then(res => res.json())
                        .then(fonts => {
                            const defaultOpt = document.createElement("option");
                            defaultOpt.value = "sans-serif";
                            defaultOpt.text = "Default (sans-serif)";
                            fontSelect.appendChild(defaultOpt);

                            const currentFont = this.properties.panel_font || "sans-serif";
                            if (currentFont === "sans-serif") defaultOpt.selected = true;

                            fonts.forEach(fontFile => {
                                const fontName = fontFile.replace(/\.[^/.]+$/, "").replace(/^\d-/, "");
                                const opt = document.createElement("option");
                                opt.value = fontFile;
                                opt.text = fontName;
                                if (currentFont === fontFile) opt.selected = true;
                                fontSelect.appendChild(opt);
                            });
                        })
                        .catch(err => console.error("Failed to load Shima fonts", err));

                    const footer = document.createElement("div");
                    footer.textContent = "Press Enter to save, Esc to cancel.";
                    footer.style.color = "#777"; footer.style.fontFamily = "sans-serif"; footer.style.fontSize = "11px"; footer.style.marginTop = "10px";
                    box.appendChild(footer);

                    const commitAndClose = () => {
                        this.properties.panel_title = input.value;
                        if (fontSelect.value) {
                            this.properties.panel_font = fontSelect.value;
                            loadFont(fontSelect.value).then(() => app.graph.setDirtyCanvas(true, true));
                        }
                        if (document.body.contains(overlay)) document.body.removeChild(overlay);
                        app.graph.setDirtyCanvas(true, true);
                    };

                    input.onkeydown = (ev) => {
                        if (ev.key === "Enter") commitAndClose();
                        else if (ev.key === "Escape") if (document.body.contains(overlay)) document.body.removeChild(overlay);
                    };
                    overlay.onclick = (ev) => {
                        if (ev.target === overlay) if (document.body.contains(overlay)) document.body.removeChild(overlay);
                    };

                    overlay.appendChild(box);
                    document.body.appendChild(overlay);
                    setTimeout(() => { input.select(); input.focus(); }, 10);
                    return true;
                }

                return false;
            };

            // Custom Background (Sleek Hardware Aesthetic)
            nodeType.prototype.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const sc = this.properties?.scale || 1.0;
                const W = this.size[0];
                const H = this.size[1];

                ctx.save();

                // 1. Outer Metallic Chassis Bezel
                ctx.fillStyle = "#c0c0c0";
                ctx.beginPath();
                ctx.roundRect(0, 0, W, H, 16 * sc);
                ctx.fill();

                // Bezel Highlight / Shadow
                ctx.strokeStyle = "#e0e0e0";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                // Heavy Metal Screws in the corners (matches Control Panel exactly)
                const drawScrew = (sx, sy) => {
                    // Screw hole drop shadow
                    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.arc(sx, sy + 1 * sc, 6 * sc, 0, Math.PI * 2); ctx.fill();
                    // Screw head
                    ctx.fillStyle = "#888"; ctx.beginPath(); ctx.arc(sx, sy, 5 * sc, 0, Math.PI * 2); ctx.fill();
                    // Crosshead
                    ctx.strokeStyle = "#444"; ctx.lineWidth = 1.5 * sc; ctx.beginPath();
                    ctx.moveTo(sx - 2.5 * sc, sy - 2.5 * sc); ctx.lineTo(sx + 2.5 * sc, sy + 2.5 * sc); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(sx - 2.5 * sc, sy + 2.5 * sc); ctx.lineTo(sx + 2.5 * sc, sy - 2.5 * sc); ctx.stroke();
                };

                const screwInset = 10 * sc;
                drawScrew(screwInset, screwInset);
                drawScrew(W - screwInset, screwInset);
                drawScrew(screwInset, H - screwInset);
                drawScrew(W - screwInset, H - screwInset);

                // 2. Inner Screeen / PCB Core (Dark Green)
                const PADDING = 20 * sc;
                const IN_W = W - (PADDING * 2);
                const IN_H = H - (PADDING * 2);

                ctx.fillStyle = "#1a2a1f"; // Dark green PCB
                ctx.beginPath();
                ctx.roundRect(PADDING, PADDING, IN_W, IN_H, 8 * sc);
                ctx.fill();

                // Ensure dots are synced before we draw the large ports underneath them
                this.syncNativePorts();

                // Mockup large ports removed so only native ports draw

                // 3. Status Switch Column (Conditional Layout)
                const samplerCommonsW = this.widgets?.find(w => w.name === "use_samplercommons");
                let pillWidth = samplerCommonsW ? (84 * sc) : (46 * sc);
                let pillHeight = 84 * sc;
                let pillX = PADDING + (6 * sc);
                let buttonY = H - PADDING - pillHeight - (3 * sc);

                // Raised plastic housing for the switches
                ctx.fillStyle = "#222";
                ctx.beginPath();
                ctx.roundRect(pillX, buttonY, pillWidth, pillHeight, 10 * sc);
                ctx.fill();
                ctx.strokeStyle = "#111";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                let circle1X = pillX + (23 * sc);
                let circle1Y = buttonY + (22 * sc);
                let circle2X = circle1X;
                let circle2Y = buttonY + pillHeight - (22 * sc);

                // Switch 1 - Common Params Override (🟢 / 🔴)
                const commonParamsW = this.widgets?.find(w => w.name === "use_commonparams");
                const isCommonActive = commonParamsW && commonParamsW.value;

                ctx.font = (20 * sc) + "px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isCommonActive ? "🟢" : "🔴", circle1X, circle1Y);

                // Switch 2 - External Linking (🔗 / ❌)
                const extLinkingW = this.widgets?.find(w => w.name === "allow_external_linking");
                const isExtActive = extLinkingW && extLinkingW.value;

                ctx.fillText(isExtActive ? "🔗" : "❌", circle2X, circle2Y);

                // Switch 3 - SamplerCommons Override (🟩 / 🟥)
                if (samplerCommonsW) {
                    let circle3X = pillX + (61 * sc);
                    let circle3Y = buttonY + (22 * sc);
                    const isSamplerActive = samplerCommonsW.value;
                    ctx.fillText(isSamplerActive ? "🟩" : "🟥", circle3X, circle3Y);
                }

                // 4. Main Panel Title Label (Dimensional Button style)
                let titleH = 46 * sc;
                let titleY = H - (72 * sc); // Shifted UP higher onto the green PCB background
                let titleX = pillX + pillWidth + (16 * sc);
                let titleW = W - PADDING - titleX - (16 * sc); // Narrowed symmetrically to stay inside frame

                // Drop Shadow behind button
                ctx.fillStyle = "#121a14"; // Deep green/black shadow
                ctx.beginPath();
                ctx.roundRect(titleX + (0 * sc), titleY + (4 * sc), titleW, titleH, 12 * sc);
                ctx.fill();

                // Main Button Body
                ctx.fillStyle = "#d1cfbd"; // Base tan
                ctx.beginPath();
                ctx.roundRect(titleX, titleY, titleW, titleH, 12 * sc);
                ctx.fill();

                // Inner Bezel Highlight (Lighter Tan Ring)
                ctx.strokeStyle = "#e2e0d3";
                ctx.lineWidth = 3 * sc;
                ctx.beginPath();
                ctx.roundRect(titleX + (4 * sc), titleY + (4 * sc), titleW - (8 * sc), titleH - (8 * sc), 8 * sc);
                ctx.stroke();

                // Inner Bezel Lowlight overlay
                ctx.strokeStyle = "rgba(0,0,0,0.1)";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                // Label Text
                ctx.fillStyle = "#111";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                const titleFont = this.properties?.panel_font || "sans-serif";

                // If it's a custom font we dynamically load it, if it's sans-serif we use the default weight
                if (titleFont === "sans-serif") {
                    ctx.font = "400 " + (20 * sc) + "px sans-serif";
                } else {
                    // Start font loading process in background if not already loaded, it will re-render when done
                    if (!LOADED_FONTS.has(titleFont)) {
                        loadFont(titleFont).then(() => app.graph.setDirtyCanvas(true, true));
                    }
                    ctx.font = (22 * sc) + "px \"" + titleFont + "\"";
                }

                ctx.fillText(this.properties.panel_title || "Shima Sampler", titleX + (titleW / 2), titleY + (titleH / 2));

                // 4b. Decorative Dots ( Speaker holes on left and right of title box )
                ctx.fillStyle = "#dbd7c5";
                const dotSpacing = 8 * sc;
                const dotRadius = 2 * sc;
                for (let r = 0; r < 2; r++) { // 2 columns (trim outer)
                    for (let c = 0; c < 4; c++) { // 4 rows
                        // Left side (aligned flush with the inner bezel curve)
                        const lx = titleX - (12 * sc) + (r * dotSpacing);
                        const ly = titleY + (12 * sc) + (c * dotSpacing);
                        ctx.beginPath(); ctx.arc(lx, ly, dotRadius, 0, Math.PI * 2); ctx.fill();

                        // Right side (aligned flush with the inner bezel curve)
                        const rx = titleX + titleW + (4 * sc) + (r * dotSpacing);
                        const ry = titleY + (12 * sc) + (c * dotSpacing);
                        ctx.beginPath(); ctx.arc(rx, ry, dotRadius, 0, Math.PI * 2); ctx.fill();
                    }
                }

                // 5. Aesthetic PCB Corner Mark (Top-Left Decorative Triangle)
                ctx.fillStyle = "#a89f81";
                const pcbX = PADDING + (10 * sc);
                const pcbY = PADDING + (10 * sc);
                const markSize = 11 * sc; // ~75% of original 15px
                ctx.beginPath();
                ctx.moveTo(pcbX, pcbY + markSize);
                ctx.lineTo(pcbX + markSize, pcbY);
                ctx.lineTo(pcbX, pcbY);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            };
            // Custom Connection Routing for Collapsed State
            const origGetConnectionPos = nodeType.prototype.getConnectionPos;
            nodeType.prototype.getConnectionPos = function (isInput, slotNumber, out) {
                if (this.flags?.collapsed) {
                    out = out || new Float32Array(2);
                    const sc = this.properties?.scale || 1.0;
                    const w = this._shima_chip_width || (240 * sc);
                    const h = 46 * sc;

                    // LiteGraph globally translates the canvas by -NODE_TITLE_HEIGHT/2 when collapsed.
                    // To hit the mathematical center of our custom chip, we must mirror that offset.
                    const titleOffset = LiteGraph.NODE_TITLE_HEIGHT ? (LiteGraph.NODE_TITLE_HEIGHT * 0.5) : 15;
                    const centerY = this.pos[1] - titleOffset + (h / 2);

                    if (isInput) {
                        out[0] = this.pos[0];
                        out[1] = Math.round(centerY);
                    } else {
                        out[0] = this.pos[0] + w;
                        out[1] = Math.round(centerY);
                    }
                    return out;
                }

                if (origGetConnectionPos) {
                    return origGetConnectionPos.apply(this, arguments);
                }

                return out || [this.pos[0], this.pos[1]];
            };

            // Custom Collapsed State
            nodeType.prototype.onDrawCollapsed = function (ctx, show_pins) {
                const sc = this.properties?.scale || 1.0;
                ctx.save();

                const titleStr = this.properties.panel_title || "Shima Sampler";

                let titleH = 46 * sc;
                ctx.font = "400 " + (20 * sc) + "px sans-serif";
                let textW = ctx.measureText(titleStr).width;
                let titleW = Math.max(textW + (80 * sc), 240 * sc);
                let titleX = 0;
                let titleY = 0;
                this._shima_chip_width = titleW; // Cache for connection routing constraint

                // Drop Shadow behind button
                ctx.fillStyle = "#121a14"; // Deep green/black shadow
                ctx.beginPath();
                ctx.roundRect(titleX + (0 * sc), titleY + (4 * sc), titleW, titleH, 12 * sc);
                ctx.fill();

                // Main Button Body
                ctx.fillStyle = "#d1cfbd"; // Base tan
                ctx.beginPath();
                ctx.roundRect(titleX, titleY, titleW, titleH, 12 * sc);
                ctx.fill();

                // Inner PCB Screen (Dark Green)
                ctx.fillStyle = "#1a2a1f";
                ctx.beginPath();
                ctx.roundRect(titleX + (4 * sc), titleY + (4 * sc), titleW - (8 * sc), titleH - (8 * sc), 8 * sc);
                ctx.fill();

                // Inner Bezel Highlight (Lighter Tan Ring)
                ctx.strokeStyle = "#e2e0d3";
                ctx.lineWidth = 3 * sc;
                ctx.beginPath();
                ctx.roundRect(titleX + (4 * sc), titleY + (4 * sc), titleW - (8 * sc), titleH - (8 * sc), 8 * sc);
                ctx.stroke();

                // Inner Bezel Lowlight overlay
                ctx.strokeStyle = "rgba(0,0,0,0.1)";
                ctx.lineWidth = 2 * sc;
                ctx.stroke();

                // Label Text
                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                const titleFont = this.properties?.panel_font || "sans-serif";

                if (titleFont === "sans-serif") {
                    ctx.font = "400 " + (20 * sc) + "px sans-serif";
                } else {
                    if (!LOADED_FONTS.has(titleFont)) {
                        loadFont(titleFont).then(() => app.graph.setDirtyCanvas(true, true));
                    }
                    ctx.font = (22 * sc) + "px \"" + titleFont + "\"";
                }

                ctx.fillText(titleStr, titleX + (titleW / 2), titleY + (titleH / 2));

                // Decorative Dots
                ctx.fillStyle = "#dbd7c5";
                const dotSpacing = 8 * sc;
                const dotRadius = 2 * sc;
                for (let r = 0; r < 2; r++) { // 2 columns (trim outer)
                    for (let c = 0; c < 4; c++) { // 4 rows
                        // Left side
                        const lx = titleX + (16 * sc) + (r * dotSpacing);
                        const ly = titleY + (12 * sc) + (c * dotSpacing);
                        ctx.beginPath(); ctx.arc(lx, ly, dotRadius, 0, Math.PI * 2); ctx.fill();

                        // Right side
                        const rx = titleX + titleW - (24 * sc) + (r * dotSpacing);
                        const ry = titleY + (12 * sc) + (c * dotSpacing);
                        ctx.beginPath(); ctx.arc(rx, ry, dotRadius, 0, Math.PI * 2); ctx.fill();
                    }
                }

                ctx.restore();
                return true; // Overrides litegraph default box rendering entirely
            };


        }

        // Universal BNDL styling stripped back to native ComfyUI defaults
    },

    async nodeCreated(node) {
        const panelNodes = ["Shima.PanelSampler", "Shima.PanelModelCitizen", "Shima.PanelLatentMaker", "Shima.PanelMasterPrompt", "Shima.PanelControlAgent"];
        if (panelNodes.includes(node.comfyClass)) {
            // Determine dynamic chassis height based on whether it needs space for extra aesthetic UI elements (like Sampler)
            let pcbHeight = 340;
            if (node.comfyClass === "Shima.PanelModelCitizen") pcbHeight = 285;
            else if (node.comfyClass === "Shima.PanelLatentMaker") pcbHeight = 215;
            else if (node.comfyClass === "Shima.PanelMasterPrompt") pcbHeight = 255;
            else if (node.comfyClass === "Shima.PanelControlAgent") pcbHeight = 260;

            // Hide all standard widgets to preserve PCB aesthetic
            const pcbCleanup = () => {
                let changed = false;

                // 1. Destroy accidentally generated Input Sockets
                if (node.inputs) {
                    const keepInputs = ["modelcitizen.bndl", "modelcitizen", "latentmaker.bndl", "masterprompt.bndl", "latentmaker", "masterprompt", "shima.commonparams", "shima.samplercommons", "image", "shima.controlbus", "panelinputs.bndl"];
                    for (let i = node.inputs.length - 1; i >= 0; i--) {
                        if (!keepInputs.includes(node.inputs[i].name)) {
                            node.removeInput(i);
                            changed = true;
                        }
                    }
                }

                // 2. Hide identically named Internal Widgets
                if (node.widgets) {
                    node.widgets.forEach(w => {
                        if (w.type !== "hidden" || w.hidden !== true) {
                            w.type = "hidden";
                            w.computeSize = () => [0, -4];
                            w.hidden = true;
                            changed = true;
                        }
                    });
                }

                if (changed && app.graph) {
                    app.graph.setDirtyCanvas(true, true);
                }
            };
            pcbCleanup();
            setTimeout(pcbCleanup, 50);

            // Aggressively lock the physical node size so native ComfyUI layout engines don't stretch it
            node.computeSize = function (min) {
                return [300, pcbHeight];
            };
            node.onResize = function (size) {
                size[0] = 300;
                size[1] = pcbHeight;
            };
            node.size = [300, pcbHeight];

            const launchModal = () => {
                const titleStr = node.properties?.panel_title || node.comfyClass.split(".")[1].replace("Panel", "");
                spawnPanelModal(node, titleStr, () => {
                    app.graph.setDirtyCanvas(true, true);
                });
            };

            node.onDblClick = function (e, pos) {
                launchModal();
                return true;
            };

            const origMenuOptions = node.getExtraMenuOptions;
            node.getExtraMenuOptions = function (_, options) {
                if (origMenuOptions) {
                    origMenuOptions.apply(this, arguments);
                }
                options.push({
                    content: "Shima: Configure...",
                    callback: launchModal
                });
            };
        }
    }
});
