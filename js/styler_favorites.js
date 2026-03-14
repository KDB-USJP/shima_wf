
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { createIconGridWidget } from "./grid_widget.js";
import { addShimaToolbar, BUTTON_TYPES } from "./shima_topbar.js";
import { disableUEForInputs } from "./ue_helper.js";

app.registerExtension({
    name: "Shima.StyleFavorites",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.StyleFavorites") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // Add onMouseDown support for clicks
                const origOnMouseDown = this.onMouseDown;
                this.onMouseDown = function (e, pos) {
                    const r2 = origOnMouseDown ? origOnMouseDown.apply(this, arguments) : undefined;
                    if (this.widgets) {
                        for (const w of this.widgets) {
                            if (w.mouse) {
                                const m = w.mouse(e, pos, this);
                                if (m) return m;
                            }
                        }
                    }
                    return r2;
                };

                // Add onMouseMove support for tooltips/hover
                const origOnMouseMove = this.onMouseMove;
                this.onMouseMove = function (e, pos) {
                    const r2 = origOnMouseMove ? origOnMouseMove.apply(this, arguments) : undefined;
                    if (this.widgets) {
                        for (const w of this.widgets) {
                            if (w.mouse) w.mouse(e, pos, this);
                        }
                    }
                    return r2;
                };

                this.favoriteStyles = [];
                this.selectedIds = new Set();
                this.gridItems = []; // Array to hold items for the grid widget
                this._updatingFavorites = false; // Concurrency Lock

                // -----------------------------------------------------------
                // 1. Setup TopBar Logic
                // -----------------------------------------------------------

                // Define Custom Buttons if not already defined
                if (!BUTTON_TYPES["active"]) {
                    BUTTON_TYPES["active"] = {
                        type: "toggle",
                        widget: "active",
                        icon: (val) => val ? "🟢" : "🔴",
                        tooltip: (val) => `Node is ${val ? "Active" : "Bypassed"}`
                    };
                }

                if (!BUTTON_TYPES["refresh_faves"]) {
                    BUTTON_TYPES["refresh_faves"] = {
                        type: "action",
                        icon: "💞",
                        tooltip: "Refresh Favorites Thumbnails",
                        callback: "onToolbarRefresh"
                    };
                }

                // Add Toolbar
                addShimaToolbar(this, ["commonparams", "external_linking", "|", "refresh_faves"]);

                // Implement Refresh Callback
                this.onToolbarRefresh = () => {
                    this.updateFavorites();
                };

                // -----------------------------------------------------------
                // 2. Find and Manage Widgets
                // -----------------------------------------------------------
                const favoritesWidget = this.widgets.find(w => w.name === "favorites_list");
                const selectedWidget = this.widgets.find(w => w.name === "selected_styles_idx");
                const filterWidget = this.widgets.find(w => w.name === "filter_mode");
                const modeWidget = this.widgets.find(w => w.name === "mode");

                // FORCE HIDE LIST
                const HIDE_LIST = ["active", "base_prompt", "shima_base_prompt_internal", "use_commonparams", "allow_external_linking", "selected_styles_idx", "favorites_list"];

                // 2.5 Disable Use Everywhere for internal logic
                disableUEForInputs(this, HIDE_LIST);

                const hideWidgets = () => {
                    HIDE_LIST.forEach(wName => {
                        const w = this.widgets.find(w => w.name === wName);
                        if (w && w.type !== "hidden") {
                            w.origType = w.type;
                            w.type = "hidden";
                            w._isShimaHidden = true; // Custom flag for computeSize
                            w.computeSize = () => [0, -4];
                            w.hidden = true;
                            w.last_y = -100; // Move off-canvas
                        }
                    });
                };

                const runHider = () => { hideWidgets(); };
                runHider();
                setTimeout(runHider, 100);
                setTimeout(runHider, 500);

                // Load selection from both widgets (Sync)
                const loadInitialSelection = () => {
                    this.selectedIds.clear();
                    if (selectedWidget && selectedWidget.value) {
                        try {
                            const val = typeof selectedWidget.value === "string" ? JSON.parse(selectedWidget.value) : selectedWidget.value;
                            if (Array.isArray(val)) {
                                val.forEach(id => this.selectedIds.add(String(id).trim()));
                            }
                        } catch (e) { }
                    }
                    if (this.selectedIds.size === 0 && favoritesWidget && favoritesWidget.value) {
                        const typed = String(favoritesWidget.value).split(/[\n,]/);
                        typed.forEach(id => {
                            const clean = id.trim();
                            if (clean) this.selectedIds.add(clean);
                        });
                    }
                };
                loadInitialSelection();

                // -----------------------------------------------------------
                // 3. Create Favorites Input (DOM)
                // -----------------------------------------------------------
                const createFavoritesInput = () => {
                    if (this.widgets.find(w => w.name === "FavoritesInput")) return;
                    const container = document.createElement("div");

                    // Asset Status Warning
                    const warningBar = document.createElement("div");
                    warningBar.style.cssText = `background: #422; color: #f66; padding: 5px 10px; font-size: 11px; border: 1px solid #633; border-radius: 4px; margin-bottom: 5px; display: none; text-align: center; cursor: pointer; width: 100%; box-sizing: border-box;`;
                    warningBar.innerHTML = "⚡ <b>Assets Missing!</b> Click for Setup Hub.";
                    warningBar.onclick = () => {
                        const node = app.graph.addNode("Shima.Hub");
                        if (node) {
                            node.pos = [this.pos[0] + 50, this.pos[1] + 50];
                            app.canvas.centerOnNode(node);
                        }
                    };
                    container.appendChild(warningBar);

                    api.fetchApi("/shima/assets/check").then(r => r.json()).then(data => {
                        if (!data.styles_exist && !data.exists) warningBar.style.display = "block";
                    });

                    Object.assign(container.style, { width: "100%", padding: "0 4px", boxSizing: "border-box", marginTop: "4px", marginBottom: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" });
                    const label = document.createElement("span");
                    label.textContent = "Favorites:";
                    label.style.cssText = "color: #aaa; font-size: 12px; margin-right: 6px; white-space: nowrap;";
                    const input = document.createElement("input");
                    input.type = "text";
                    Object.assign(input.style, { flexGrow: "1", height: "24px", backgroundColor: "#222", color: "#ddd", border: "1px solid #444", borderRadius: "4px", fontSize: "12px", padding: "2px 6px", outline: "none" });
                    input.placeholder = "A0, U0, 273...";

                    if (favoritesWidget) {
                        input.value = typeof favoritesWidget.value === "string" ? favoritesWidget.value : "";
                        input.addEventListener("change", () => {
                            favoritesWidget.value = input.value;
                            if (favoritesWidget.callback) favoritesWidget.callback(favoritesWidget.value);
                            this.updateFavorites();
                        });
                        input.addEventListener("keydown", (e) => {
                            if (e.key === "Enter") { e.preventDefault(); input.blur(); }
                            e.stopPropagation();
                        });
                    }
                    container.appendChild(label);
                    container.appendChild(input);
                    this.favoritesInput = input;
                    const domWidget = this.addDOMWidget("FavoritesInput", "custom", container, {
                        getValue: () => input.value,
                        setValue: (v) => { input.value = v; },
                    });
                    domWidget.computeSize = (w) => [w, 35];
                };
                createFavoritesInput();

                // -----------------------------------------------------------
                // 4. Create Grid Widget
                // -----------------------------------------------------------
                if (!this.widgets.find(w => w.name === "FavoritesGrid")) {
                    const initialMulti = modeWidget ? modeWidget.value === "Stack" : true;
                    const gridWidget = createIconGridWidget(this, "FavoritesGrid", this.gridItems, {
                        columns: 4, minColumnWidth: 100, cellHeight: 110, iconSize: 90, padding: 10, multi: initialMulti
                    });
                    const originalCallback = gridWidget.callback;
                    gridWidget.callback = (val) => {
                        this.selectedIds = new Set(val);
                        if (selectedWidget) {
                            selectedWidget.value = JSON.stringify(Array.from(this.selectedIds));
                        }
                        if (originalCallback) originalCallback(val);
                    };
                    gridWidget.value = Array.from(this.selectedIds);
                    this.addCustomWidget(gridWidget);
                    this.gridWidget = gridWidget;
                }

                this.computeSize = function (size) {
                    const w = this.size ? this.size[0] : 650;
                    let h = 0;
                    if (this.widgets) {
                        for (const widget of this.widgets) {
                            if (widget.type === "hidden" || widget.visible === false || widget._isShimaHidden) continue;
                            const wh = widget.computeSize ? widget.computeSize(w)[1] : (widget.type === "custom" ? 35 : 30);
                            h += wh + 4;
                        }
                    }
                    h += 30;
                    const num_connections = Math.max(this.inputs ? this.inputs.length : 0, this.outputs ? this.outputs.length : 0);
                    const conn_h = num_connections * 20 + 20;
                    return [w, Math.max(h, conn_h)];
                };

                // -----------------------------------------------------------
                // 5. Update Logic
                // -----------------------------------------------------------
                this.updateFavorites = async () => {
                    if (!favoritesWidget || this._updatingFavorites) return;
                    this._updatingFavorites = true;
                    try {
                        let csv = favoritesWidget.value;
                        if (typeof csv !== "string") csv = "";
                        const ids = csv.split(/[\n,]/).map(x => x.trim()).filter(x => x.length > 0);
                        if (ids.length === 0) {
                            this.gridItems.length = 0;
                            this.setDirtyCanvas(true, true);
                            return;
                        }
                        const response = await api.fetchApi(`/shima/styler/lookup?ids=${ids.join(",")}`);
                        const json = await response.json();
                        if (json.data) {
                            const filterVal = filterWidget ? filterWidget.value : "Both";
                            const newItems = [];
                            json.data.forEach(item => {
                                const type = item.type || "artist";
                                if (filterVal === "Artists" && type !== "artist") return;
                                if (filterVal === "User Styles" && type !== "user_style") return;
                                const imgId = item.image || item.id;
                                const tooltipText = (type === "user_style") ? (item.positive || item.name) : item.name;
                                newItems.push({ id: String(item.id), image: `/shima/styler/image_v2/${imgId}.png`, tooltip: tooltipText });
                            });
                            this.gridItems.length = 0;
                            this.gridItems.push(...newItems);
                        }
                    } catch (e) {
                        console.error("[Shima Favorites] Update Error:", e);
                    } finally {
                        this._updatingFavorites = false;
                        if (this.onResize) this.onResize(this.size);
                        const [w, h] = this.computeSize([this.size[0], this.size[1]]);
                        this.size[1] = h;
                        this.setDirtyCanvas(true, true);
                    }
                };

                // Listeners
                if (filterWidget) {
                    filterWidget.callback = () => this.updateFavorites();
                }
                if (modeWidget) {
                    const origModeCallback = modeWidget.callback;
                    modeWidget.callback = (val) => {
                        if (origModeCallback) origModeCallback.apply(modeWidget, arguments);
                        if (this.gridWidget) this.gridWidget.multi = (val === "Stack");
                    };
                }

                const origOnConfigure = this.onConfigure;
                this.onConfigure = function (o) {
                    if (origOnConfigure) origOnConfigure.apply(this, arguments);
                    if (this.favoritesInput && favoritesWidget) {
                        this.favoritesInput.value = favoritesWidget.value || "";
                    }
                    this.updateFavorites();
                    setTimeout(runHider, 100);
                };

                // Initial Load
                setTimeout(() => this.updateFavorites(), 100);
                return r;
            };
        }
    }
});
