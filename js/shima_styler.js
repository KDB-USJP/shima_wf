window.Shima = window.Shima || {};

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Common Style Browser Logic for Selector (List) and Gallery (Grid)
const createStyleBrowser = (nodeType, nodeData) => {
    const onNodeCreated = nodeType.prototype.onNodeCreated;

    nodeType.prototype.onNodeCreated = function () {
        const r = onNodeCreated?.apply(this, arguments);
        const node = this;
        const isGallery = nodeData.name === "Shima.StyleGallery";

        const widget = {
            type: "HTML",
            name: "style_browser",
            draw(ctx, node, widget_width, y, widget_height) { },
            computeSize() {
                return [650, 800];
            }
        };

        // State
        this.stylerData = [];
        this.filteredData = [];
        this.selectedStyles = [];
        this.availableImages = new Set(); // For gallery

        // Force Default Size logic
        // If size is missing or default small, force it.
        // We use a slight delay or check to avoid overwriting loaded nodes if possible,
        // but for now, forcing the minimum is safer for the "Default" requirement.
        // LiteGraph default is often [140, 260] or similar.
        if (!this.size || this.size[0] < 600) {
            this.size = [650, 400]; // Reduced from 600 to be even tighter
        }

        // UI Setup
        this.setupUI = function () {
            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex",
                flexDirection: "column",
                height: "100%",
                backgroundColor: "#222",
                color: "#eee",
                fontFamily: "sans-serif",
                overflow: "hidden",
                padding: "10px",
                // Fix for Hidden Outputs: Make container narrower than node to reveal slots
                // Increased to 40px (20px per side) to clearly clear the connection dots
                width: "calc(100% - 40px)",
                margin: "0 auto",
                // Add small top margin to clear the 'active' toggle
                marginTop: "20px",
                // Add bottom padding/margin for "breathing room"
                marginBottom: "20px",
                paddingBottom: "10px",
                boxSizing: "border-box",
                borderRadius: "8px",
                flexGrow: "1" // Allow growing within the DOM widget area
            });

            // Asset Status Warning
            const warningBar = document.createElement("div");
            warningBar.style.cssText = `
                background: #422;
                color: #f66;
                padding: 5px 10px;
                font-size: 11px;
                border: 1px solid #633;
                border-radius: 4px;
                margin-bottom: 10px;
                display: none;
                text-align: center;
                cursor: pointer;
            `;
            warningBar.innerHTML = "⚡ <b>Shima Assets Missing!</b> Click to open Setup Hub.";
            warningBar.onclick = () => {
                const node = app.graph.addNode("Shima.Hub");
                if (node) {
                    node.pos = [this.pos[0] + 50, this.pos[1] + 50];
                    app.canvas.centerOnNode(node);
                }
            };
            container.appendChild(warningBar);

            // Fetch Asset Status
            api.fetchApi("/shima/assets/check").then(r => r.json()).then(data => {
                if (!data.exists) {
                    warningBar.style.display = "block";
                }
            });

            // Helper to Hide Widgets
            const hideWidget = (wName) => {
                const w = this.widgets?.find(w => w.name === wName);
                if (w) {
                    w.computeSize = () => [0, -4]; // Standard hidden size
                    w.type = "hidden"; // Standard hidden type
                    w.visible = false; // Extra safety

                }
                return w;
            };

            // Hide 'selected_styles' input immediately
            hideWidget("selected_styles");

            // Prompts (Fixed Height & Scrollable)
            const createPromptArea = (label, wName) => {
                const w = hideWidget(wName);
                if (!w) return;

                const wrap = document.createElement("div");
                Object.assign(wrap.style, { marginBottom: "10px" });

                const l = document.createElement("label");
                l.textContent = label;
                l.style.display = "block";
                l.style.fontSize = "0.8em";
                l.style.marginBottom = "2px";
                l.style.color = "#aaa";
                wrap.appendChild(l);

                const t = document.createElement("textarea");
                Object.assign(t.style, {
                    width: "100%",
                    height: "80px", // Approx 5 lines
                    backgroundColor: "#222",
                    color: "#eee",
                    border: "1px solid #444",
                    resize: "vertical",
                    fontFamily: "monospace",
                    fontSize: "0.9em",
                    marginBottom: "5px"
                });
                t.value = w.value || "";

                // Sync Logic
                t.addEventListener("input", () => {
                    w.value = t.value;
                    if (w.callback) w.callback(w.value);
                });

                wrap.appendChild(t);
                container.appendChild(wrap);
            };

            createPromptArea("Base Prompt", "base_prompt");

            // Only Selector has Negative Prompt usually
            if (nodeData.name === "Shima.StyleSelector") {
                createPromptArea("Negative Prompt", "negative_prompt");
            }

            // Controls Row (Mode & Connector)
            const controlsRow = document.createElement("div");
            Object.assign(controlsRow.style, {
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "10px",
                marginTop: "5px"
            });

            // Helper to Create Dropdowns
            const createDropdown = (label, wName, options) => {
                const w = hideWidget(wName);
                if (!w) return null;

                const wrap = document.createElement("div");
                Object.assign(wrap.style, {
                    flex: "1",
                    display: "flex",
                    flexDirection: "column",
                    marginRight: "5px"
                });

                const l = document.createElement("label");
                l.textContent = label;
                l.style.fontSize = "0.8em";
                l.style.color = "#aaa";
                l.style.marginBottom = "2px";
                wrap.appendChild(l);

                const select = document.createElement("select");
                Object.assign(select.style, {
                    width: "100%",
                    backgroundColor: "#222",
                    color: "#eee",
                    border: "1px solid #444",
                    padding: "4px",
                    borderRadius: "4px"
                });

                options.forEach(opt => {
                    const optVal = Array.isArray(opt) ? opt[0] : opt;
                    const optLabel = Array.isArray(opt) ? opt[1] : opt;
                    const el = document.createElement("option");
                    el.value = optVal;
                    el.textContent = optLabel;
                    if (optVal === w.value) el.selected = true;
                    select.appendChild(el);
                });

                // ROBUST SYNC: Check if current widget value is valid. If not (e.g. empty, or mismatch), force default.
                const validValues = options.map(opt => Array.isArray(opt) ? opt[0] : opt);
                if (!validValues.includes(w.value)) {
                    // Log for debugging if needed, but for now just fix it
                    // console.log(`[Shima] Fixing invalid value for ${wName}: '${w.value}' -> '${select.value}'`);
                    w.value = select.value;
                }

                // Sync
                select.addEventListener("change", () => {
                    w.value = select.value;
                    if (w.callback) w.callback(w.value);
                    if (wName === "mode") {
                        if (this.refreshSelectionVisuals) this.refreshSelectionVisuals();
                    }
                });

                wrap.appendChild(select);
                return wrap;
            };

            // Helper to Create Number Input
            const createNumberInput = (label, wName, step = 0.1, min = -10, max = 10) => {
                const w = hideWidget(wName);
                if (!w) return null;

                const wrap = document.createElement("div");
                Object.assign(wrap.style, {
                    flex: "1",
                    display: "flex",
                    flexDirection: "column",
                    marginRight: "5px"
                });

                const l = document.createElement("label");
                l.textContent = label;
                l.style.fontSize = "0.8em";
                l.style.color = "#aaa";
                l.style.marginBottom = "2px";
                wrap.appendChild(l);

                const input = document.createElement("input");
                input.type = "number";
                input.step = step;
                input.min = min;
                input.max = max;
                input.value = w.value !== undefined ? w.value : 1.0;

                Object.assign(input.style, {
                    width: "100%",
                    backgroundColor: "#222",
                    color: "#eee",
                    border: "1px solid #444",
                    padding: "4px",
                    borderRadius: "4px"
                });

                // FORCE SYNC (Frontend -> Backend)
                // If backend has default but frontend creates new, ensure they match.
                // Or if loading, ensure input matches widget.
                // w.value is correct source of truth usually.

                // Sync Logic
                input.addEventListener("input", () => {
                    let val = parseFloat(input.value);
                    if (isNaN(val)) val = 1.0;
                    w.value = val;
                    if (w.callback) w.callback(w.value);
                });

                // Manual Sync to ensure widget gets default if empty
                if (w.value === undefined || w.value === null) {
                    w.value = parseFloat(input.value);
                }

                wrap.appendChild(input);
                return wrap;
            };

            // Mode Dropdown
            const modeCtrl = createDropdown("Selection Mode", "mode", ["Single", "Stack"]);
            if (modeCtrl) controlsRow.appendChild(modeCtrl);

            // Strength Input
            const strengthCtrl = createNumberInput("Strength", "style_strength", 0.1, -10, 10);
            if (strengthCtrl) controlsRow.appendChild(strengthCtrl);

            // Connector Dropdown
            const connOptions = [
                [" and ", "and"],
                [" mixed with ", "mixed with"],
                [" + ", "+"],
                [", ", ", (comma)"]
            ];
            const connCtrl = createDropdown("Connector", "connector", connOptions);
            if (connCtrl) {
                if (modeCtrl) modeCtrl.style.marginRight = "5px"; // Adjust spacing
                controlsRow.appendChild(connCtrl);
            }

            container.appendChild(controlsRow);

            // Search
            const searchBar = document.createElement("input");
            searchBar.placeholder = "Search Styles...";
            Object.assign(searchBar.style, {
                padding: "8px",
                marginBottom: "10px",
                backgroundColor: "#333",
                border: "1px solid #555",
                color: "#fff"
            });
            searchBar.addEventListener("input", (e) => this.filterData(e.target.value));
            container.appendChild(searchBar);

            // Category
            const catSelect = document.createElement("select");
            Object.assign(catSelect.style, {
                marginBottom: "10px",
                backgroundColor: "#333",
                color: "#fff",
                padding: "5px",
                marginRight: "5px" // Add spacing for next select
            });

            const allOpt = document.createElement("option");
            allOpt.value = "ALL";
            allOpt.textContent = "All Categories";
            catSelect.appendChild(allOpt);

            this.catSelect = catSelect;
            catSelect.addEventListener("change", () => this.filterData(searchBar.value));

            // Source Filter (New)
            const sourceSelect = document.createElement("select");
            Object.assign(sourceSelect.style, {
                marginBottom: "10px",
                backgroundColor: "#333",
                color: "#fff",
                padding: "5px"
            });

            ["All Sources", "Artists", "User Styles"].forEach(opt => {
                const o = document.createElement("option");
                o.value = opt;
                o.textContent = opt;
                sourceSelect.appendChild(o);
            });

            this.sourceSelect = sourceSelect;
            sourceSelect.addEventListener("change", () => this.filterData(searchBar.value));

            // Filter Container
            const filterContainer = document.createElement("div");
            filterContainer.style.display = "flex";
            filterContainer.appendChild(catSelect);
            filterContainer.appendChild(sourceSelect);

            container.appendChild(filterContainer);

            // List/Grid Container
            const listContainer = document.createElement("div");
            Object.assign(listContainer.style, {
                flex: "1",
                minHeight: "0", // CRITICAL for flex scrolling
                overflowY: "auto",
                border: "1px solid #444",
                marginBottom: "10px"
            });

            if (isGallery) {
                listContainer.style.display = "grid";
                // Match website: minmax(140px, 1fr) for better row distribution
                listContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))";
                listContainer.style.gap = "12px";
                listContainer.style.padding = "10px";
            }

            this.listContainer = listContainer;
            container.appendChild(listContainer);

            // Stack View
            const stackView = document.createElement("div");
            Object.assign(stackView.style, {
                minHeight: "40px",
                padding: "5px",
                backgroundColor: "#1a1a1a",
                borderTop: "1px solid #555",
                fontSize: "0.9em",
                wordBreak: "break-word"
            });
            stackView.textContent = "Selected: None";

            this.stackView = stackView;
            container.appendChild(stackView);

            return container;
        }

        const ui = this.setupUI();

        const domWidget = this.addDOMWidget("style_browser_ui", "btn", ui, {
            serialize: false,
            hideOnZoom: false
        });

        // Defined computeSize to allow manual resizing
        // Returns [width, height] - FIXED CONSTANT HEIGHT
        domWidget.computeSize = (width) => {
            return [width, 800];
        };

        // Add Spacer to force bottom border
        // This ensures the node background/border logic "sees" content at the bottom
        // and doesn't cut off awkwardly at the DOM widget edge.
        const spacerWidget = {
            type: "custom",
            name: "BottomSpacer",
            computeSize: () => [650, 20], // 20px height
            draw: (ctx, node, width, y) => { } // Draw nothing
        };
        this.addCustomWidget(spacerWidget);

        // Track UI elements for updates
        this.domWidget = domWidget;

        // Strict Hiding Cleanup
        setTimeout(() => {
            const HIDE_LIST = ["mode", "connector", "selected_styles", "base_prompt", "negative_prompt", "style_strength"];

            // Loop through all widgets to find targets
            if (this.widgets) {
                for (let i = this.widgets.length - 1; i >= 0; i--) {
                    const w = this.widgets[i];
                    if (HIDE_LIST.includes(w.name)) {
                        w.computeSize = () => [0, -4];
                        w.type = "hidden";
                        w.visible = false;
                        // Nuke draw method just in case
                        w.draw = () => { };
                    }
                }
            }
            // Force resize after cleanup - REMOVED to prevent shrinking
            // node.setSize(node.computeSize());
        }, 100);

        // Load Images (Gallery Only) 
        this.loadImages = async () => {
            if (!isGallery) return;
            try {
                const res = await fetch("/shima/styler/images");
                if (res.ok) {
                    const data = await res.json();
                    this.availableImages = new Set(data.images);
                    // Refresh current view with new images
                    if (this.renderList) this.renderList();
                }
            } catch (e) {
                console.error("Failed to load available images", e);
            }
        };

        // Load Data
        const loadAll = async () => {
            await this.loadImages();

            try {
                const res = await fetch("/shima/styler/data");
                if (res.ok) {
                    const data = await res.json();
                    this.stylerData = data;

                    // Normalize data structure if needed (ensure flat list or handle dict)
                    // The API returns {artists: [], user_styles: []}
                    // We need a flat list for this simple filter logic, OR adapt filter logic.
                    // Let's flatten for compatibility with existing code:
                    let flat = [];
                    if (data.artists) {
                        data.artists.forEach(a => { a._source = "Artists"; flat.push(a); });
                    }
                    if (data.user_styles) {
                        data.user_styles.forEach(u => { u._source = "User Styles"; flat.push(u); });
                    }
                    if (!data.artists && !data.user_styles && Array.isArray(data)) {
                        // Legacy handling
                        flat = data.map(d => ({ ...d, _source: "Artists" }));
                    }

                    this.stylerData = flat;

                    this.processCategories();
                    this.filterData("");
                } else {
                    this.listContainer.textContent = "Error: " + res.statusText;
                    console.error("[ShimaSelector] API Error:", res.status, res.statusText);
                }
            } catch (e) {
                this.listContainer.textContent = "Error loading data.";
                console.error("[ShimaSelector] Fetch Error:", e);
            }
        };
        loadAll();

        // Helpers
        this.processCategories = () => {
            const cats = new Set();
            this.stylerData.forEach(item => {
                if (item.categories) item.categories.forEach(c => cats.add(c));
            });
            Array.from(cats).sort().forEach(c => {
                const opt = document.createElement("option");
                opt.value = c;
                opt.textContent = c;
                this.catSelect.appendChild(opt);
            });
        }

        this.filterData = (query) => {
            const cat = this.catSelect.value;
            const source = this.sourceSelect.value;
            const q = query.toLowerCase();
            const showMissingWidget = this.widgets?.find(w => w.name === "show_missing");
            const hideMissing = isGallery && showMissingWidget && !showMissingWidget.value;

            this.filteredData = this.stylerData.filter(item => {
                // Source check
                if (source !== "All Sources" && item._source !== source) return false;

                // Name/Cat check
                const matchName = item.name.toLowerCase().includes(q);
                const matchCat = cat === "ALL" || (item.categories && item.categories.includes(cat));
                if (!matchName || !matchCat) return false;

                // Image check (Gallery)
                if (hideMissing) {
                    const img = this.findImage(item.name);
                    if (!img) return false;
                }
                return true;
            });
            this.visibleItemCount = 1000; // Reset visible count on new filter
            this.renderList();
        }

        this.findImage = (id) => {
            // IDs are A0, A1, U0, U1... matching filename A0.png, A1.png...
            const target = (id + ".png").toLowerCase();
            for (let filename of this.availableImages) {
                if (filename.toLowerCase() === target) {
                    return filename;
                }
            }
            return null;
        }

        this.visibleItemCount = 1000; // Load 1000 items

        this.renderList = () => {
            // If first render, clear. Else append? 
            // Simplest: Always replace, but slice
            this.listContainer.innerHTML = "";

            // Render everything up to the limit
            const itemsToShow = this.filteredData.slice(0, this.visibleItemCount);

            // Setup Sentinel for Scroll
            // Use IntersectionObserver to load more when scrolling to bottom?
            // Or just simple "Load More" button? Scroll is better.

            itemsToShow.forEach(item => {
                const row = document.createElement("div");
                row.style.cursor = "pointer";
                row.title = item.name;

                const isSelected = this.selectedStyles.includes(item.name);

                row.onclick = () => {
                    this.toggleSelection(item.name);
                }

                if (isGallery) {
                    // Tile - Match Website's Premium Card Style
                    Object.assign(row.style, {
                        backgroundColor: "#2a2a2a",
                        borderRadius: "8px",
                        overflow: "hidden",
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        border: "2px solid transparent",
                        transition: "transform 0.2s",
                        height: "min-content" // Prevent vertical stretching
                    });
                    row.classList.add("style-item-tile");

                    if (isSelected) {
                        row.style.borderColor = "#3b82f6"; // Blue active border
                        row.style.boxShadow = "0 0 10px rgba(59, 130, 246, 0.5)";
                    }

                    // Square Aspect Ratio Container (Padding Trick)
                    const imgContainer = document.createElement("div");
                    Object.assign(imgContainer.style, {
                        width: "100%",
                        paddingTop: "100%", // 1:1 Aspect Ratio
                        position: "relative",
                        overflow: "hidden"
                    });
                    row.appendChild(imgContainer);

                    const imgName = this.findImage(item.id);
                    if (imgName) {
                        const img = document.createElement("img");
                        img.src = `/shima/styler/image_v2/${encodeURIComponent(imgName)}`;
                        Object.assign(img.style, {
                            position: "absolute",
                            top: "0",
                            left: "0",
                            width: "100%",
                            height: "100%",
                            objectFit: "cover"
                        });
                        imgContainer.appendChild(img);
                    } else {
                        const ph = document.createElement("div");
                        ph.textContent = item.name;
                        Object.assign(ph.style, {
                            position: "absolute",
                            top: "0",
                            left: "0",
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.7em",
                            textAlign: "center",
                            padding: "4px",
                            boxSizing: "border-box"
                        });
                        imgContainer.appendChild(ph);
                    }

                    // Card Body (Title/Cat)
                    const cardBody = document.createElement("div");
                    Object.assign(cardBody.style, {
                        padding: "8px",
                        fontSize: "0.8em",
                        color: "#ccc",
                        overflow: "hidden"
                    });

                    const title = document.createElement("div");
                    title.textContent = item.name;
                    title.style.fontWeight = "bold";
                    title.style.whiteSpace = "nowrap";
                    title.style.overflow = "hidden";
                    title.style.textOverflow = "ellipsis";
                    cardBody.appendChild(title);

                    row.appendChild(cardBody);
                } else {
                    // Row
                    row.style.padding = "5px";
                    row.style.borderBottom = "1px solid #333";
                    row.style.display = "flex";
                    row.style.justifyContent = "space-between";
                    row.classList.add("style-item-row"); // Marker for updates

                    if (isSelected) row.style.backgroundColor = "#444";

                    const n = document.createElement("span");
                    n.textContent = item.name;
                    n.style.fontWeight = "bold";

                    const i = document.createElement("span");
                    i.textContent = "ℹ️";
                    i.title = `${item.categories.join(", ")}\n${item.info}`;
                    i.style.cursor = "help";

                    row.appendChild(n);
                    row.appendChild(i);
                }

                this.listContainer.appendChild(row);
            });
        };

        this.refreshSelectionVisuals = () => {
            const children = Array.from(this.listContainer.children);
            children.forEach(row => {
                const name = row.title; // We stored name in title
                const isSelected = this.selectedStyles.includes(name);

                if (isGallery) {
                    row.style.outline = isSelected ? "2px solid #4CAF50" : "none";
                } else {
                    row.style.backgroundColor = isSelected ? "#444" : "transparent";
                }
            });
        }

        this.toggleSelection = (name) => {
            const modeWidget = this.widgets.find(w => w.name === "mode");
            const mode = modeWidget ? modeWidget.value : "Single";

            if (mode === "Single") {
                this.selectedStyles = [name];
            } else {
                if (this.selectedStyles.includes(name)) {
                    this.selectedStyles = this.selectedStyles.filter(n => n !== name);
                } else {
                    this.selectedStyles.push(name);
                }
            }
            this.updateOutput();
            this.refreshSelectionVisuals();
        }

        this.updateOutput = () => {
            const w = this.widgets.find(w => w.name === "selected_styles");
            if (w) w.value = JSON.stringify(this.selectedStyles);
            this.stackView.textContent = "Selected: " + this.selectedStyles.join(", ");
        }

        return r;
    };
};

app.registerExtension({
    name: "Shima.StyleSelector",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.StyleSelector" || nodeData.name === "Shima.StyleGallery") {
            createStyleBrowser(nodeType, nodeData);
        }
        if (nodeData.name === "Shima.StyleIterator") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated?.apply(this, arguments);
                const node = this;

                // Listen for server event
                const handleBatch = (e) => {
                    if (e.detail.node_id === node.id.toString()) {
                        // 1. Trigger next queue immediately
                        app.queuePrompt(0);

                        // 2. Optional: Visually update the index widget if found
                        const indexWidget = node.widgets.find(w => w.name === "index");
                        if (indexWidget) {
                            // Does backend send new index? No, but we could infer current+1
                            // Actually, backend keeps internal state.
                            // If index_mode was added, we would handle it here.

                            // For now, force a redraw to show active state
                            node.setDirtyCanvas(true, true);
                        }
                    }
                };

                api.addEventListener("shima-batch-continue", handleBatch);

                // Cleanup
                const onRemove = node.onRemoved; // Hook into removal? Comfy nodes don't have standard destroy?
                // Usually event listeners persist unless removed. 
                // But since "node" is closure, it's fine until reload.

                return r;
            }
        }
    }
});
