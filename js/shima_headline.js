import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Shima Headline - Frontend Extension
 * Handles multiline text rendering and stylized picker modal.
 */

// Helper to load fonts into the browser
const LOADED_FONTS = new Set();
async function loadFont(fontName) {
    if (fontName === "default" || LOADED_FONTS.has(fontName)) return true;

    try {
        const fontUrl = `/shima/assets/fonts/${fontName}`;
        const face = new FontFace(fontName, `url(${fontUrl})`);
        await face.load();
        document.fonts.add(face);
        LOADED_FONTS.add(fontName);
        return true;
    } catch (e) {
        console.error(`[Shima Headline] Failed to load font: ${fontName}`, e);
        return false;
    }
}

app.registerExtension({
    name: "Shima.Headline",
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.Headline") {

            // --- Sticker-Style Overrides ---
            node.title = "";
            node.getTitle = function () { return ""; };
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.color = "transparent";
            node.title_color = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = true;
            node.min_height = 10;
            node.min_size = [20, 10];
            node.title_height = 0; // Kill title bar space

            // Hard override for computeSize
            node.computeSize = function () {
                const text = this.widgets?.find(w => w.name === "text")?.value || "";
                const fontSize = this.widgets?.find(w => w.name === "font_size")?.value || 40;
                const lines = text.split("\n");
                const lineHeight = fontSize * 1.05;
                const padding = 5;
                const blockH = (lines.length - 1) * lineHeight + fontSize;
                return [this.size[0] || 200, Math.max(10, blockH + (padding * 2))];
            };

            // Initial sizing
            node.size = [300, 20];

            // --- Initialization ---
            node.properties = node.properties || {};
            if (node.properties.userResized === undefined) node.properties.userResized = false;

            // --- Widget Hiding ---
            function hideWidgets() {
                if (!node.widgets) return;
                const widgetsToHide = ["text", "font_name", "font_size", "alignment", "color", "opacity"];
                widgetsToHide.forEach(name => {
                    const w = node.widgets.find(x => x.name === name);
                    if (w) {
                        w.type = "hidden";
                        w.computeSize = () => [0, 0];
                        w.hidden = true;
                        if (w.label) w.label = "";
                    }
                });
            }
            hideWidgets();
            setTimeout(hideWidgets, 10);
            setTimeout(hideWidgets, 100);
            setTimeout(hideWidgets, 500);

            // Force size on add
            node.onAdded = function () {
                this.flags.no_header = true;
                this.title_height = 0;
                if (!this.properties.userResized) {
                    const size = this.computeSize();
                    this.size[1] = size[1];
                }
            };

            // Prevent default title/body drawing
            node.onDrawForeground = function (ctx) {
                return true;
            };

            // --- Double Click Handler ---
            node.onDblClick = function () {
                showHeadlinePicker(node);
            };

            // Force compact size in background draw if not manually resized
            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed || this.properties.hidden) return;

                const text = this.widgets?.find(w => w.name === "text")?.value || "";
                const fontName = this.widgets?.find(w => w.name === "font_name")?.value || "default";
                const fontSize = this.widgets?.find(w => w.name === "font_size")?.value || 40;
                const alignment = this.widgets?.find(w => w.name === "alignment")?.value || "Center";
                const color = this.widgets?.find(w => w.name === "color")?.value || "#FFFFFF";
                const opacity = this.widgets?.find(w => w.name === "opacity")?.value || 1.0;

                if (!text) return;

                // Ensure font is loaded
                if (fontName !== "default" && !LOADED_FONTS.has(fontName)) {
                    loadFont(fontName).then(() => this.setDirtyCanvas(true, true));
                }

                const lines = text.split("\n");
                const lineHeight = fontSize * 1.05;
                const padding = 5;
                const blockHeight = (lines.length - 1) * lineHeight + fontSize;
                const totalHeight = blockHeight + (padding * 2);

                // Brute force sizing if not user-resized
                if (!this.properties.userResized && Math.abs(this.size[1] - totalHeight) > 1) {
                    this.size[1] = totalHeight;
                }

                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.fillStyle = color;

                const fontFamily = fontName === "default" ? "sans-serif" : `"${fontName}"`;
                ctx.font = `${fontSize}px ${fontFamily}`;
                ctx.textBaseline = "middle";

                const sidePadding = 20;

                // PURE Vertical Center (Centers the entire multi-line block)
                // Offset by half a line height because middle-baseline centers on the line itself
                let startY = (this.size[1] / 2) - ((lines.length - 1) * lineHeight / 2);

                // Draw each line
                lines.forEach((line, i) => {
                    const metrics = ctx.measureText(line);
                    let x = sidePadding;
                    if (alignment === "Center") {
                        x = (this.size[0] - metrics.width) / 2;
                    } else if (alignment === "Right") {
                        x = this.size[0] - metrics.width - sidePadding;
                    }

                    const y = startY + (i * lineHeight);
                    ctx.fillText(line, x, y);
                });

                ctx.restore();
                return true; // Overrides litegraph default box rendering entirely
            };

            // Delay the resize tracker to avoid blocking initial setup
            setTimeout(() => {
                node.onResize = function (size) {
                    if (!this._isSystemResizing) {
                        this.properties.userResized = true;
                    }
                };
            }, 1000);
        }
    }
});

/**
 * Show stylized Headline Picker modal
 */
async function showHeadlinePicker(node) {
    const wText = node.widgets.find(w => w.name === "text");
    const wFont = node.widgets.find(w => w.name === "font_name");
    const wSize = node.widgets.find(w => w.name === "font_size");
    const wAlign = node.widgets.find(w => w.name === "alignment");
    const wColor = node.widgets.find(w => w.name === "color");
    const wOpacity = node.widgets.find(w => w.name === "opacity");

    // Fetch fonts for dropdown
    let fontList = ["default"];
    try {
        const res = await fetch("/shima/fonts");
        if (res.ok) fontList = await res.json();
    } catch (e) { }

    const palette = window.SHIMA_THEME?.palette || {};

    const dialog = document.createElement("dialog");
    dialog.style.cssText = `
        padding: 20px;
        background: #1e1e1e;
        color: #eee;
        border: 1px solid #444;
        border-radius: 12px;
        width: 450px;
        display: flex;
        flex-direction: column;
        gap: 15px;
        z-index: 10001;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        font-family: sans-serif;
    `;

    dialog.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px;">
            <h3 style="margin:0; font-size:18px; color: #4a9eff;">🏝️ Headline Editor</h3>
            <button id="close" style="background:none; border:none; color:#888; cursor:pointer; font-size:20px;">✕</button>
        </div>

        <textarea id="h-text" placeholder="Enter headline text..." style="width:100%; height:100px; padding:10px; background:#111; border:1px solid #444; color:#fff; border-radius:6px; resize:vertical; box-sizing:border-box; font-size:14px; outline:none;">${wText.value}</textarea>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
                <label style="display:block; font-size:11px; color:#888; margin-bottom:4px;">Font Family</label>
                <select id="h-font" style="width:100%; padding:8px; background:#2a2a2a; border:1px solid #444; color:#fff; border-radius:4px; cursor:pointer;">
                    ${fontList.map(f => `<option value="${f}" ${f === wFont.value ? 'selected' : ''}>${f.replace(/\.[^/.]+$/, "").replace(/^\d-/, "")}</option>`).join("")}
                </select>
            </div>
            <div>
                <label style="display:block; font-size:11px; color:#888; margin-bottom:4px;">Alignment</label>
                <div style="display:flex; background:#2a2a2a; border-radius:4px; overflow:hidden; border:1px solid #444;">
                    ${["Left", "Center", "Right"].map(a => `
                        <button class="align-btn ${wAlign.value === a ? 'active' : ''}" data-align="${a}" style="flex:1; padding:8px; background: ${wAlign.value === a ? '#3a5a7c' : 'transparent'}; border:none; color:white; cursor:pointer; font-size:12px;">${a[0]}</button>
                    `).join("")}
                </div>
            </div>
        </div>

        <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <label style="font-size:11px; color:#888;">Font Size</label>
                <span id="h-size-val" style="font-size:11px; color:#4a9eff;">${wSize.value}px</span>
            </div>
            <input type="range" id="h-size" min="10" max="500" value="${wSize.value}" style="width:100%; cursor:pointer;">
        </div>

        <div>
            <label style="display:block; font-size:11px; color:#888; margin-bottom:8px;">Theme Palette</label>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${Object.entries(palette).map(([name, col]) => `
                    <div class="h-color-swatch" data-color="${col}" title="${name}" style="width:24px; height:24px; background:${col}; border-radius:4px; cursor:pointer; border:2px solid ${wColor.value === col ? '#fff' : 'transparent'}; box-sizing:border-box;"></div>
                `).join("")}
                <input type="color" id="h-color-custom" value="${wColor.value}" style="width:24px; height:24px; padding:0; border:none; background:none; cursor:pointer;">
            </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:5px;">
            <button id="cancel" style="padding:10px 20px; background:transparent; border:1px solid #444; color:#aaa; border-radius:6px; cursor:pointer; font-size:14px;">Cancel</button>
            <button id="save" style="padding:10px 25px; background:#3a5a7c; border:none; color:white; border-radius:6px; cursor:pointer; font-weight:bold; font-size:14px;">Apply Changes</button>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    // --- Interactive Listeners ---
    const updateSizeVal = (v) => dialog.querySelector("#h-size-val").textContent = `${v}px`;
    dialog.querySelector("#h-size").addEventListener("input", (e) => updateSizeVal(e.target.value));

    // Align Buttons
    const alignBtns = dialog.querySelectorAll(".align-btn");
    alignBtns.forEach(btn => {
        btn.onclick = () => {
            alignBtns.forEach(b => { b.style.background = "transparent"; b.classList.remove("active"); });
            btn.style.background = "#3a5a7c";
            btn.classList.add("active");
        };
    });

    // Color Swatches
    const swatches = dialog.querySelectorAll(".h-color-swatch");
    swatches.forEach(s => {
        s.onclick = () => {
            swatches.forEach(sw => sw.style.borderColor = "transparent");
            s.style.borderColor = "#fff";
            dialog.querySelector("#h-color-custom").value = s.dataset.color;
        };
    });

    // --- Actions ---
    const close = () => { dialog.close(); dialog.remove(); };
    dialog.querySelector("#close").onclick = close;
    dialog.querySelector("#cancel").onclick = close;

    dialog.querySelector("#save").onclick = () => {
        const newText = dialog.querySelector("#h-text").value;
        const newFont = dialog.querySelector("#h-font").value;
        const newSize = parseInt(dialog.querySelector("#h-size").value);
        const newAlign = dialog.querySelector(".align-btn.active").dataset.align;
        const newColor = dialog.querySelector("#h-color-custom").value;

        // Apply to widgets
        wText.value = newText;
        wFont.value = newFont;
        wSize.value = newSize;
        wAlign.value = newAlign;
        wColor.value = newColor;

        // Trigger callbacks
        if (wText.callback) wText.callback(newText);

        node.setDirtyCanvas(true, true);
        close();
    };

    // Backdrop safety
    dialog.addEventListener("click", (e) => {
        if (e.target === dialog) close();
    });
}
