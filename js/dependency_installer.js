import { app } from "../../scripts/app.js";

/**
 * Dependency Installer - Frontend Extension
 */

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

function showShimaConfirm(title, msg, onConfirm) {
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.8); z-index:20000; display:flex; align-items:center; justify-content:center;";
    const modal = document.createElement("div");
    modal.style.cssText = "width:450px; background:#1e1e1e; border:2px solid #444; border-radius:12px; padding:25px; color:white; font-family:sans-serif; display:flex; flex-direction:column; gap:20px;";
    modal.innerHTML = `<h3 style="margin:0;">${title}</h3><p style="font-size:15px; color:#ddd; line-height:1.5;">${msg}</p>`;
    const row = document.createElement("div");
    row.style.cssText = "display:flex; justify-content:flex-end; gap:10px;";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "background:#444; color:white; border:none; padding:10px 20px; border-radius:4px; cursor:pointer;";
    cancel.onclick = () => { if (shade.parentNode) shade.parentNode.removeChild(shade); };
    const ok = document.createElement("button");
    ok.textContent = "Proceed";
    ok.style.cssText = "background:#2a623d; color:white; border:none; padding:10px 20px; border-radius:4px; cursor:pointer; font-weight:bold;";
    ok.onclick = () => { if (shade.parentNode) shade.parentNode.removeChild(shade); onConfirm(); };
    row.appendChild(cancel);
    row.appendChild(ok);
    modal.appendChild(row);
    shade.appendChild(modal);
    document.body.appendChild(shade);
}

function setupDependencyInstallerWidgets(node) {
    try {
        node.size = [300, 200];

        const mainContainer = document.createElement("div");
        mainContainer.style.cssText = `
            display: flex; flex-direction: column; gap: 10px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; margin: 5px; box-sizing: border-box;
        `;

        const createBtn = (text, icon, color) => {
            const btn = document.createElement("button");
            btn.innerHTML = `${icon} ${text}`;
            btn.style.cssText = `background: ${color}; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; text-align: left;`;
            return btn;
        };

        const viewBtn = createBtn("View Dependency List", "🏝️", "#3a5a7c");
        const installBtn = createBtn("Install All Missing", "📦", "#2a623d");
        const editBtn = createBtn("Edit JSON Data", "✏️", "#444");

        mainContainer.appendChild(viewBtn);
        mainContainer.appendChild(installBtn);
        mainContainer.appendChild(editBtn);

        node.addDOMWidget("installer_ui", "div", mainContainer, { serialize: false, hideOnZoom: false });

        node.shimaSyncData = (json_text) => {
            const w = (node.widgets || []).find(w => w.name === "json_data");
            if (w && w.value !== json_text) {
                console.log("[Shima] Dependency Installer synced new data.");
                w.value = json_text;
                node.setDirtyCanvas(true);
            }
        };

        const getJSONData = () => {
            const w = (node.widgets || []).find(w => w.name === "json_data");
            try { return JSON.parse(w?.value || "{}"); } catch (e) { return { official_dependencies: [] }; }
        };

        viewBtn.onclick = () => {
            const data = getJSONData();
            const deps = data.official_dependencies || [];
            const shade = document.createElement("div");
            shade.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.8); z-index:10000; display:flex; align-items:center; justify-content:center;";
            const modal = document.createElement("div");
            modal.style.cssText = "width:750px; max-height:80vh; background:#1e1e1e; border:2px solid #333; border-radius:12px; padding:25px; color:white; overflow-y:auto; font-family:sans-serif; position:relative;";
            modal.innerHTML = `<h2 style="margin:0 0 15px 0;">🏝️ Workflow Dependencies</h2>`;
            const table = document.createElement("table");
            table.style.cssText = "width:100%; border-collapse:collapse; font-size:12px; text-align:left;";
            table.innerHTML = `<tr style="border-bottom:2px solid #444; color:#888;"><th style="padding:10px;">Name</th><th style="padding:10px;">Type</th><th style="padding:10px;">Save Path</th><th style="padding:10px;">Provider</th><th style="padding:10px;">Source</th></tr>`;
            deps.forEach(d => {
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid #333";
                const isSafer = d.url && (d.url.includes("huggingface.co") || d.url.includes("civitai.com"));
                const providerTag = isSafer ? `<span style="color:#00ff00; font-weight:bold;">🟢 Known Repo</span>` : `<span style="color:#ffaa00; font-weight:bold;">🟠 Unverified</span>`;
                tr.innerHTML = `<td style="padding:10px;">${d.filename}</td><td style="padding:10px;">${d.type}</td><td style="padding:10px;">${d.save_path || "default"}</td><td style="padding:10px;">${providerTag}</td><td style="padding:10px;"><a href="${d.url}" target="_blank" style="color:#0084ff; text-decoration:none;">Download Link ↗</a></td>`;
                table.appendChild(tr);
            });
            if (deps.length === 0) { modal.innerHTML += `<div style="padding:20px; color:#888;">No dependencies found. Sync from Generator node first.</div>`; } else { modal.appendChild(table); }
            const closeBtn = document.createElement("button"); closeBtn.textContent = "Close"; closeBtn.style.cssText = "margin-top:20px; background:#444; color:white; border:none; padding:10px 20px; border-radius:4px; cursor:pointer; float:right;";
            closeBtn.onclick = () => { if (shade.parentNode) shade.parentNode.removeChild(shade); }; modal.appendChild(closeBtn); shade.appendChild(modal); document.body.appendChild(shade);
        };

        editBtn.onclick = () => {
            const w = (node.widgets || []).find(w => w.name === "json_data");
            if (!w) return;

            const shade = document.createElement("div");
            shade.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); z-index:11000; display:flex; align-items:center; justify-content:center; backdrop-filter: blur(4px);";
            
            const modal = document.createElement("div");
            modal.style.cssText = "width:800px; background:#1e1e1e; border:1px solid #444; border-radius:12px; padding:25px; display:flex; flex-direction:column; gap:15px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);";
            
            // --- Help Header ---
            const helpHeader = document.createElement("div");
            helpHeader.style.cssText = "padding:12px; background:#111; border-radius:8px; border:1px solid #333; font-size:12px; font-family:sans-serif; line-height:1.6; display:none;";
            helpHeader.innerHTML = `
                <div style="color: #ff69b4;">💖 you must set hot pink items to a valid, accessible URL.</div>
                <div style="color: #ffff00;">💛 check the yellow items to ensure they were correctly detected.</div>
                <div style="color: #add8e6;">💙 blue items are optional descriptive information.</div>
                <div style="color: #00ff00;">💚 do not modify the green text (structure/keys).</div>
            `;

            // --- Editor Container (Layered) ---
            const editorWrapper = document.createElement("div");
            editorWrapper.style.cssText = "position:relative; width:100%; height:500px; background:#050505; border:1px solid #333; border-radius:6px; overflow:hidden;";

            const highlightLayer = document.createElement("div");
            highlightLayer.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; padding:10px; font-family: 'Consolas', 'Monaco', monospace; font-size:13px; white-space: pre-wrap; word-wrap: break-word; color: #00ff00; pointer-events: none; z-index: 1; box-sizing: border-box; overflow-y: auto;";

            const textArea = document.createElement("textarea");
            textArea.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; padding:10px; font-family: 'Consolas', 'Monaco', monospace; font-size:13px; background: transparent; color: transparent; caret-color: white; border: none; outline: none; resize: none; z-index: 2; box-sizing: border-box; white-space: pre-wrap; word-wrap: break-word; overflow-y: auto; tab-size: 4;";
            textArea.spellcheck = false;
            textArea.value = w.value || "{}";

            const applyHighlight = (text) => {
                let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                // Hot Pink: URLs
                html = html.replace(/("url":\s*")([^"]+)(")/g, '$1<span style="color: #ff69b4;">$2</span>$3');
                // Yellow: Type and Save Path
                html = html.replace(/("(type|save_path)":\s*")([^"]+)(")/g, '$1<span style="color: #ffff00;">$3</span>$4');
                // Light Blue: Provider and Description
                html = html.replace(/("(provider|description)":\s*")([^"]+)(")/g, '$1<span style="color: #add8e6;">$3</span>$4');
                highlightLayer.innerHTML = html;

                // Help Logic
                const placeholder = "https://INSERT_URL_HERE_IN_A_CONNECTED_DEPENDENCY_INSTALLER_NODE";
                helpHeader.style.display = text.includes(placeholder) ? "block" : "none";
            };

            // Sync scrolling
            textArea.onscroll = () => { highlightLayer.scrollTop = textArea.scrollTop; };
            // Sync content
            textArea.oninput = () => { applyHighlight(textArea.value); };
            
            applyHighlight(textArea.value); // Initial

            editorWrapper.appendChild(highlightLayer);
            editorWrapper.appendChild(textArea);

            const foot = document.createElement("div");
            foot.style.cssText = "display:flex; justify-content:flex-end; gap:12px; margin-top:5px;";
            
            const save = createBtn("Save Changes", "💾", "#0084ff");
            save.style.padding = "10px 25px";
            save.onclick = () => { 
                w.value = textArea.value; 
                node.setDirtyCanvas(true); 
                if (shade.parentNode) shade.parentNode.removeChild(shade); 
            };

            const cancel = createBtn("Cancel", "", "#333");
            cancel.style.padding = "10px 20px";
            cancel.onclick = () => { if (shade.parentNode) shade.parentNode.removeChild(shade); };

            foot.appendChild(cancel); foot.appendChild(save); 
            modal.appendChild(helpHeader);
            modal.appendChild(editorWrapper); 
            modal.appendChild(foot); 
            shade.appendChild(modal); 
            document.body.appendChild(shade);
        };

        installBtn.onclick = () => {
            const data = getJSONData();
            const deps = data.official_dependencies || [];
            if (deps.length === 0) { showShimaNotice("Notice", "No dependencies to install!"); return; }
            showShimaConfirm("Installing Dependencies", `This will attempt to download ${deps.length} models to your machine. Proceed?`, () => {
                fetch("/shima/deps/batch_install", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dependencies: deps })
                }).then(res => res.json()).then(res => {
                    if (res.success) { showShimaNotice("Success", "Installation started in the background. Check server logs for progress."); }
                    else { showShimaNotice("Error", res.error); }
                });
            });
        };

        node.onExecutionUpdate = function(data) {
            if (data.text && data.text[0] && data.text[0] !== "{}") {
                node.shimaSyncData(data.text[0]);
            }
        };
    } catch (e) {
        console.error("[Shima] Error setting up DependencyInstaller widgets:", e);
    }
}

app.registerExtension({
    name: "Shima.DependencyInstaller",
    nodeCreated(node) {
        if (node.comfyClass === "Shima.DependencyInstaller") {
            try {
                const w = (node.widgets || []).find(w => w.name === "json_data");
                if (w) { w.type = "hidden"; w.computeSize = () => [0, -4]; }

                // Set "Reject UE Links" (Always Wired Only) by default
                const ue = (node.widgets || []).find(w => w.name === "allow_external_linking");
                if (ue) ue.value = false;

                setupDependencyInstallerWidgets(node);

                // --- UE Recursion Prevention ---
                const ensureUEProperties = () => {
                    node.properties = node.properties || {};
                    node.properties["ue_properties"] = node.properties["ue_properties"] || {};
                    if (!node.properties["ue_properties"]["input_ue_unconnectable"]) {
                        node.properties["ue_properties"]["input_ue_unconnectable"] = {};
                    }
                    // Prevent UE from auto-connecting to json_stub
                    node.properties["ue_properties"]["input_ue_unconnectable"]["json_stub"] = true;
                };

                ensureUEProperties();

                // Hook into onConfigure to ensure property is applied after load
                const origOnConfigure = node.onConfigure;
                node.onConfigure = function (info) {
                    origOnConfigure?.call(this, info);
                    ensureUEProperties();
                };
            } catch (e) {
                console.error("[Shima] DependencyInstaller nodeCreated failed:", e);
            }
        }
    }
});
