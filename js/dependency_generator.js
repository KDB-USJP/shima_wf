import { app } from "../../scripts/app.js";

/**
 * Dependency Generator - Frontend Extension
 */

const HELP_TEXT = `The Dependency Generator is designed to help you make a "Pack" of all the Dependencies your workflow has—Models of all types, Input files like JPGs, PNGs and even 3D assets, and more.

When you click the button, this node will traverse your workflow and attempt to locate every model you've used and every input asset you have specified. 

With that resultant JSON, save it as a JSON file and edit the parts in PINK to the actual URLs of your models and assets. Make sure you use publicly available locations if you are distributing the WF outside your organization.`;

function showShimaNotice(title, msg) {
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:20000; display:flex; align-items:center; justify-content:center;";
    const modal = document.createElement("div");
    modal.style.cssText = "width:400px; background:#1e1e1e; border:1px solid #444; border-radius:8px; padding:20px; color:white; font-family:sans-serif; text-align:center; display:flex; flex-direction:column; gap:15px;";
    modal.innerHTML = `<h3 style="margin:0;">${title}</h3><p style="font-size:14px; color:#ccc;">${msg}</p>`;
    const btn = document.createElement("button");
    btn.textContent = "Got it";
    btn.style.cssText = "background:#3a5a7c; color:white; border:none; padding:10px; border-radius:4px; cursor:pointer; font-weight:bold;";
    btn.onclick = () => { if (shade.parentNode) shade.parentNode.removeChild(shade); };
    modal.appendChild(btn);
    shade.appendChild(modal);
    document.body.appendChild(shade);
}

function setupDependencyGeneratorWidgets(node) {
    try {
        node.size = [450, 250]; 

        const mainContainer = document.createElement("div");
        mainContainer.style.cssText = `
            display: flex; flex-direction: column; gap: 10px; padding: 5px; background: rgba(0,0,0,0.3); border-radius: 6px; margin: 5px; height: calc(100% - 30px); box-sizing: border-box;
        `;

        const btnRow = document.createElement("div");
        btnRow.style.cssText = `display: flex; gap: 10px;`;
        const scanBtn = document.createElement("button");
        scanBtn.textContent = "🏝️ Instant Scan (Client-Side)";
        scanBtn.style.cssText = `flex: 2; background: #3a5a7c; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;`;
        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy JSON";
        copyBtn.style.cssText = `flex: 1; background: #444; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;`;
        btnRow.appendChild(scanBtn);
        btnRow.appendChild(copyBtn);

        const container = document.createElement("div");
        container.className = "shima-dependency-stub-container";
        container.style.cssText = `
            background: #050505; color: #888; padding: 10px; font-family: 'Consolas', 'Monaco', monospace; font-size: 11px; flex-grow: 1; overflow-y: auto; border: 1px solid #333; border-radius: 4px; white-space: pre-wrap; overflow-wrap: break-word; cursor: text; user-select: text;
        `;
        container.textContent = HELP_TEXT;

        mainContainer.appendChild(btnRow);
        mainContainer.appendChild(container);

        const widget = node.addDOMWidget("json_stub_display", "div", mainContainer, { serialize: false, hideOnZoom: false });
        
        widget.computeSize = () => {
            const w = node.size ? node.size[0] : 450;
            const h = node.size ? node.size[1] : 250;
            return [w - 20, Math.max(150, h - 80)];
        };

        const placeholderUrl = "https://INSERT_URL_HERE_IN_A_CONNECTED_DEPENDENCY_INSTALLER_NODE";

        function updateDisplay(text, colorize = true) {
            if (!colorize) { container.textContent = text; container.style.color = "#888"; return; }
            
            // Clean HTML
            let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            // Highlighting (Match keys and values then wrap in colored spans)
            // Hot Pink: URLs
            html = html.replace(/("url":\s*")([^"]+)(")/g, '$1<span style="color: #ff69b4;">$2</span>$3');
            
            // Yellow: Type and Save Path
            html = html.replace(/("(type|save_path)":\s*")([^"]+)(")/g, '$1<span style="color: #ffff00;">$3</span>$4');
            
            // Light Blue: Provider and Description
            html = html.replace(/("(provider|description)":\s*")([^"]+)(")/g, '$1<span style="color: #add8e6;">$3</span>$4');
            
            // Green: Everything else (keys and syntax)
            container.style.color = "#00ff00"; 
            container.innerHTML = html;
            
            const w = (node.widgets || []).find(w => w.name === "json_stub");
            if (w) w.value = text;
            
            const syncId = placeholderUrl;
            if (node.outputs?.[0]?.links && app.graph?.links) {
                node.outputs[0].links.forEach(link_id => {
                    const link = app.graph.links[link_id];
                    if (link) {
                        const targetNode = app.graph.getNodeById(link.target_id);
                        if (targetNode && targetNode.comfyClass === "Shima.DependencyInstaller") {
                            if (targetNode.shimaSyncData) targetNode.shimaSyncData(text);
                        }
                    }
                });
            }
        }

        scanBtn.onclick = async () => {
            if (!app.graph?._nodes) return;
            const deps = [];
            const extensions = [".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".onnx", ".torchscript", ".yaml", ".json"];
            const rawIDs = new Set();
            
            // First pass: Collect all potential IDs
            app.graph._nodes.forEach(n => {
                const nodeType = n.comfyClass || n.type || "UnknownNode";
                if (!n.widgets || nodeType === "Shima.DemuxList") return;
                n.widgets.forEach(w => {
                    const val = w.value;
                    if (!val || typeof val !== "string") return;
                    if (val.includes(",") && extensions.some(ext => val.includes(ext))) return;
                    
                    const sVal = val.toLowerCase();
                    const hasExt = extensions.some(ext => sVal.endsWith(ext));
                    const name = (w.name || "").toLowerCase();
                    const label = (w.label || "").toLowerCase();

                    if (hasExt || nodeType.includes("Loader") || name.includes("image_path") || label.includes("image_path")) {
                        if (val.length > 3 && !val.startsWith("http")) rawIDs.add(val);
                    }
                });
            });

            // Second pass: Resolve IDs via Python API
            let resolvedMap = {};
            try {
                const response = await fetch("/shima/deps/resolve_paths", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filenames: Array.from(rawIDs) })
                });
                const res = await response.json();
                if (res.success) resolvedMap = res.resolved || {};
            } catch (e) {
                console.error("[Shima] Failed to resolve paths from server:", e);
            }

            const add = (id, nodeType, widgetName, widgetLabel) => {
                if (!id || typeof id !== "string" || id === "None" || id === "Baked VAE") return;
                if (deps.find(d => d.id === id)) return;

                let category = "Asset";
                let savePath = "default";

                // Use server-resolved path if available
                const resolved = resolvedMap[id];
                if (resolved && typeof resolved === "object") {
                    savePath = resolved.save_dir || resolved.category;
                    const catRoot = resolved.category;
                    if (catRoot === "checkpoints") category = "Checkpoint";
                    else if (catRoot === "loras") category = "LoRA";
                    else if (catRoot === "vae") category = "VAE";
                    else if (catRoot === "controlnet") category = "ControlNet";
                    else if (catRoot === "upscale_models") category = "Upscale";
                    else if (catRoot === "input") category = "Input";
                } else {
                    // Fallback to Greedy Detection
                    const name = widgetName.toLowerCase();
                    const label = widgetLabel.toLowerCase();
                    const sVal = id.toLowerCase();
                    const hasExt = extensions.some(ext => sVal.endsWith(ext));

                    if (hasExt) {
                        if (name.includes("ckpt") || name.includes("model")) { category = "Checkpoint"; savePath = "checkpoints"; }
                        else if (name.includes("lora")) { category = "LoRA"; savePath = "loras"; }
                        else if (name.includes("vae")) { category = "VAE"; savePath = "vae"; }
                        else if (name.includes("controlnet")) { category = "ControlNet"; savePath = "controlnet"; }
                        else if (name.includes("image") || name.includes("path")) { category = "Input"; savePath = "input"; }
                    }
                }

                deps.push({
                    id: id.replace(/\\/g, "/"),
                    filename: id.split(/[/\\]/).pop(),
                    type: category,
                    save_path: savePath,
                    provider: "Unverified",
                    url: "https://INSERT_URL_HERE_IN_A_CONNECTED_DEPENDENCY_INSTALLER_NODE",
                    description: `Auto-detected from ${nodeType}.`
                });
            };

            // Final pass: Build the manifest
            app.graph._nodes.forEach(n => {
                const nodeType = n.comfyClass || n.type || "UnknownNode";
                if (!n.widgets || nodeType === "Shima.DemuxList") return;

                n.widgets.forEach(w => {
                    const val = w.value;
                    if (rawIDs.has(val)) {
                        add(val, nodeType, w.name || "", w.label || "");
                    }
                });
            });

            updateDisplay(JSON.stringify({ "official_dependencies": deps }, null, 4));
        };

        copyBtn.onclick = () => {
            const text = container.innerText;
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => {
                const oldText = copyBtn.textContent;
                copyBtn.textContent = "✅ Copied!"; copyBtn.style.background = "#28a745";
                setTimeout(() => { copyBtn.textContent = oldText; copyBtn.style.background = "#444"; }, 1500);
            });
        };

        node.onExecutionUpdate = function (data) { if (data.text && data.text[0]) updateDisplay(data.text[0]); };
        const onExecuted = node.onExecuted;
        node.onExecuted = function (data) { onExecuted?.apply(this, arguments); if (data && data.text) updateDisplay(data.text[0]); };
    } catch (e) {
        console.error("[Shima] Error setting up DependencyGenerator widgets:", e);
    }
}

app.registerExtension({
    name: "Shima.DependencyGenerator",
    nodeCreated(node) { 
        if (node.comfyClass === "Shima.DependencyGenerator") {
            try {
                setupDependencyGeneratorWidgets(node);
            } catch (e) {
                console.error("[Shima] DependencyGenerator nodeCreated failed:", e);
            }
        }
    }
});
