import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Shima Setup Hub - Frontend UI
 * Handles asset pack downloads and status reporting
 */

app.registerExtension({
    name: "Shima.Hub",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "Shima.Hub") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            const node = this;

            // --- Dashboard Styling ---
            const dashboard = document.createElement("div");
            dashboard.style.cssText = `
                background: #151515;
                color: #ddd;
                padding: 12px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 11px;
                border: 1px solid #333;
                border-radius: 8px;
                margin: 5px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
            `;

            // Helper to create sections
            const createSection = (title, icon) => {
                const section = document.createElement("div");
                section.style.cssText = `
                    border-bottom: 1px solid #222;
                    padding-bottom: 8px;
                `;
                const header = document.createElement("div");
                header.style.cssText = `
                    font-weight: bold;
                    color: #888;
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                `;
                header.innerHTML = `${icon} ${title}`;
                section.appendChild(header);

                const content = document.createElement("div");
                content.style.cssText = `padding-left: 4px; display: flex; flex-direction: column; gap: 4px;`;
                section.appendChild(content);

                return { section, content };
            };

            // 1. Data Section
            const dataSec = createSection("Data (Database)", "📂");
            const dataStatus = document.createElement("div");
            dataSec.content.appendChild(dataStatus);

            // 2. Assets Section
            const assetsSec = createSection("Styler Assets (Thumbnails)", "🎨");
            const assetsList = document.createElement("div");
            assetsList.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;
            assetsSec.content.appendChild(assetsList);

            // 3. Models Section
            const modelsSec = createSection("Models (AI Engine)", "🤖");
            const modelsList = document.createElement("div");
            modelsList.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;
            modelsSec.content.appendChild(modelsList);

            dashboard.appendChild(dataSec.section);
            dashboard.appendChild(assetsSec.section);
            dashboard.appendChild(modelsSec.section);

            node.addDOMWidget("dashboard_display", "div", dashboard);

            // Shima Hub dynamically expands based on content, but needs a larger baseline
            node.size = [420, 480];

            // --- Asset Row Component ---
            const createAssetRow = (name, isInstalled, isActive) => {
                const row = document.createElement("div");
                row.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: ${isActive ? "#1a3a14" : "#1a1a1a"};
                    padding: 4px 8px;
                    border-radius: 4px;
                    border: 1px solid ${isActive ? "#3a842a" : "#333"};
                `;

                const label = document.createElement("span");
                label.textContent = name;
                label.style.color = isInstalled ? (isActive ? "#0f0" : "#0c0") : "#fb0";
                if (isActive) label.style.fontWeight = "bold";

                const left = document.createElement("div");
                left.style.cssText = `display: flex; align-items: center; gap: 8px;`;

                const statusIcon = document.createElement("span");
                statusIcon.textContent = isInstalled ? (isActive ? "⭐️" : "✅") : "📥";

                left.appendChild(statusIcon);
                left.appendChild(label);
                row.appendChild(left);

                const actions = document.createElement("div");
                actions.style.cssText = `display: flex; gap: 4px;`;
                row.appendChild(actions);

                if (isInstalled && !isActive) {
                    const activeBtn = document.createElement("button");
                    activeBtn.textContent = "Set Active";
                    activeBtn.style.cssText = `
                        background: #3a842a;
                        border: none;
                        color: white;
                        padding: 2px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 10px;
                    `;
                    activeBtn.onclick = () => setActivePack(name);
                    actions.appendChild(activeBtn);
                } else if (!isInstalled) {
                    const dlBtn = document.createElement("button");
                    dlBtn.textContent = "Install";
                    dlBtn.style.cssText = `
                        background: #06c;
                        border: none;
                        color: white;
                        padding: 2px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 10px;
                    `;
                    dlBtn.onclick = () => downloadPack(name);
                    actions.appendChild(dlBtn);
                }

                return row;
            };

            const createModelRow = (displayName, modelId, isInstalled, isDownloading) => {
                const row = document.createElement("div");
                row.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #1a1a1a;
                    padding: 4px 8px;
                    border-radius: 4px;
                    border: 1px solid #333;
                `;

                const label = document.createElement("span");
                label.textContent = displayName;
                label.style.color = isInstalled ? "#0c0" : (isDownloading ? "#0af" : "#fb0");

                const left = document.createElement("div");
                left.style.cssText = `display: flex; align-items: center; gap: 8px;`;

                const statusIcon = document.createElement("span");
                statusIcon.textContent = isInstalled ? "✅" : (isDownloading ? "⏳" : "📥");

                left.appendChild(statusIcon);
                left.appendChild(label);
                row.appendChild(left);

                const actions = document.createElement("div");
                actions.style.cssText = `display: flex; gap: 4px;`;
                row.appendChild(actions);

                if (!isInstalled && !isDownloading) {
                    const dlBtn = document.createElement("button");
                    dlBtn.textContent = "Download";
                    dlBtn.style.cssText = `
                        background: #06c;
                        border: none;
                        color: white;
                        padding: 2px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 10px;
                    `;
                    dlBtn.onclick = () => downloadModel(modelId, displayName);
                    actions.appendChild(dlBtn);
                }

                return row;
            };

            // --- Actions ---
            const downloadPack = (pack) => {
                const originalText = dataStatus.textContent;
                dataStatus.textContent = `🚀 Downloading ${pack}...`;
                dataStatus.style.color = "#0af";

                api.fetchApi("/shima/assets/download", {
                    method: "POST",
                    body: JSON.stringify({ pack: pack })
                }).then(r => r.json()).then(data => {
                    if (data.success) {
                        refreshStatus();
                    } else {
                        dataStatus.textContent = `❌ Error: ${data.error || "Unknown error"}`;
                        dataStatus.style.color = "#f33";
                    }
                }).catch(err => {
                    dataStatus.textContent = `❌ Network Error: ${err}`;
                    dataStatus.style.color = "#f33";
                });
            };

            const downloadModel = (modelId, displayName) => {
                // Optimistic UI update
                refreshStatus(null, { [modelId]: "downloading" });

                api.fetchApi("/shima/models/download", {
                    method: "POST",
                    body: JSON.stringify({ model_id: modelId })
                }).then(r => r.json()).then(data => {
                    if (data.success) {
                        refreshStatus();
                    } else {
                        alert(`Failed to download ${displayName}: ${data.error}`);
                        refreshStatus();
                    }
                }).catch(err => {
                    alert(`Network error downloading ${displayName}: ${err}`);
                    refreshStatus();
                });
            };

            const setActivePack = (pack) => {
                // 1. Update the node widget first
                const activeWidget = node.widgets?.find(w => w.name === "active_pack");
                if (activeWidget) {
                    activeWidget.value = pack;
                    if (activeWidget.callback) activeWidget.callback(pack);
                }

                // 2. Update global settings
                api.fetchApi("/shima/settings/update", {
                    method: "POST",
                    body: JSON.stringify({ active_thumbnail_pack: pack })
                }).then(r => r.json()).then(data => {
                    if (data.success) {
                        refreshStatus(pack); // PASS DIRECTLY FOR INSTANT FEEDBACK
                        // Also tell styler nodes to refresh if possible
                        app.graph._nodes.forEach(n => {
                            if (n.loadImages) n.loadImages();
                        });
                    }
                });
            };

            const refreshStatus = (forcedPack = null, downloadingModels = {}) => {
                // Source active pack from node widget first
                const activeWidget = node.widgets?.find(w => w.name === "active_pack");
                const widgetValue = activeWidget ? activeWidget.value : null;

                api.fetchApi("/shima/settings/get").then(r => r.json()).then(settings => {
                    const activePack = forcedPack || widgetValue || settings.active_thumbnail_pack || settings.themes?.active_thumbnail_pack;

                    api.fetchApi("/shima/assets/check").then(r => r.json()).then(data => {
                        // Refresh Data Status
                        if (data.data_exists) {
                            dataStatus.textContent = "✅ shima_sheets.xlsx found";
                            dataStatus.style.color = "#0c0";
                        } else {
                            dataStatus.textContent = "⚠️ Database file MISSING (assets/data/shima_sheets.xlsx)";
                            dataStatus.style.color = "#f33";
                        }

                        // Refresh Assets List
                        assetsList.innerHTML = "";
                        if (data.pack_status) {
                            Object.entries(data.pack_status).forEach(([name, installed]) => {
                                assetsList.appendChild(createAssetRow(name, installed, name === activePack));
                            });
                        }
                    });

                    // Fetch ControlNet Models Status
                    api.fetchApi("/shima/models/check").then(r => r.json()).then(data => {
                        modelsList.innerHTML = "";
                        if (data.models) {
                            Object.entries(data.models).forEach(([modelId, info]) => {
                                const isDownloading = downloadingModels[modelId] === "downloading";
                                modelsList.appendChild(createModelRow(info.display_name, modelId, info.installed, isDownloading));
                            });
                        }
                    }).catch(err => {
                        modelsList.textContent = "Failed to load model status.";
                    });
                });
            };

            // Initial check
            setTimeout(refreshStatus, 500);
        };
    }
});
