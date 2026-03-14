import { app } from "../../scripts/app.js";

/**
 * Shima Backdrop Node - Frontend Extension
 * Purely aesthetic node that sits behind all others.
 * Supports gradients, alpha/opacity, and custom backgrounds with Scaling Modes.
 */

const ASSET_PATH = "/shima/assets/customBG/";
const ImageCache = new Map();

function getBackdropImage(filename) {
    if (!filename || filename === "None") return null;
    if (ImageCache.has(filename)) return ImageCache.get(filename);
    const img = new Image();
    img.src = `${ASSET_PATH}${filename}`;
    ImageCache.set(filename, img);
    return img;
}

app.registerExtension({
    name: "Shima.Backdrop",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.Backdrop") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.Backdrop") {
            node.properties = node.properties || {};
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = true;

            // Nuclear Widget/Label Erasure
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

            // Force to back on creation
            if (app.graph && app.graph._nodes) {
                const idx = app.graph._nodes.indexOf(node);
                if (idx > 0) {
                    app.graph._nodes.splice(idx, 1);
                    app.graph._nodes.unshift(node);
                }
            }

            // --- Z-Index Lock ---
            const moveToBack = () => {
                if (!app.graph || !app.graph._nodes) return;
                const idx = app.graph._nodes.indexOf(node);
                if (idx > 0) {
                    app.graph._nodes.splice(idx, 1);
                    app.graph._nodes.unshift(node);
                }
            };

            node.onSelected = moveToBack;
            node.onDeselected = moveToBack;
            node.onDragEnd = moveToBack;

            // --- Rendering ---
            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) return;

                const [w, h] = this.size;
                const r = 12; // Comfy-like corner radius
                const opacity = this.properties.opacity !== undefined ? this.properties.opacity : 1.0;
                const target = this.properties.opacity_target || "Both";

                ctx.save();
                // Draw Rounded Rectangle Path
                ctx.beginPath();
                ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
                ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
                ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
                ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
                ctx.closePath();
                ctx.clip();

                // 1. Draw Gradient
                const useGradOp = (target === "Both" || target === "Gradient");
                ctx.save();
                if (useGradOp) ctx.globalAlpha = opacity;
                const top = this.properties.color_top || "#1a1a1a";
                const bot = this.properties.color_bottom || "#141414";
                const grad = ctx.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0, top);
                grad.addColorStop(1, bot);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.restore();

                // 2. Draw Image (Optional)
                const imgName = this.properties.bg_image;
                if (imgName && imgName !== "None") {
                    const img = getBackdropImage(imgName);
                    if (img && img.complete) {
                        const mode = this.properties.scaling_mode || "Stretch";
                        const sx = this.properties.image_scale_x || 1.0;
                        const sy = this.properties.image_scale_y || 1.0;
                        const offX = this.properties.offset_x || 0;
                        const offY = this.properties.offset_y || 0;
                        const useImgOp = (target === "Both" || target === "Image");

                        let drawW, drawH, ox, oy;
                        if (mode === "Stretch") {
                            drawW = w * sx; drawH = h * sy;
                            ox = (w - drawW) / 2 + offX; oy = (h - drawH) / 2 + offY;
                        } else {
                            const imgRatio = img.width / img.height;
                            const nodeRatio = w / h;
                            if (mode === "Cover") {
                                if (imgRatio > nodeRatio) {
                                    drawH = h * sy; drawW = drawH * imgRatio * sx;
                                } else {
                                    drawW = w * sx; drawH = (drawW / imgRatio) * sy;
                                }
                            } else if (mode === "Fit") {
                                if (imgRatio > nodeRatio) {
                                    drawW = w * sx; drawH = (drawW / imgRatio) * sy;
                                } else {
                                    drawH = h * sy; drawW = drawH * imgRatio * sx;
                                }
                            }
                            ox = (w - drawW) / 2 + offX; oy = (h - drawH) / 2 + offY;
                        }

                        ctx.save();
                        if (useImgOp) ctx.globalAlpha = opacity;
                        ctx.drawImage(img, ox, oy, drawW, drawH);
                        ctx.restore();
                    }
                }

                // 3. Subtle Border
                ctx.strokeStyle = "rgba(255,255,255,0.05)";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.restore();
            };

            // --- Interaction ---
            node.onDblClick = function () {
                showBackdropModal(this);
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Shima: Configure Backdrop...",
                    callback: () => showBackdropModal(this)
                });
            };
        }
    }
});

async function showBackdropModal(node) {
    let images = ["None"];
    try {
        const resp = await fetch("/shima/assets/backdrops");
        const list = await resp.json();
        images = ["None", ...list];
    } catch (e) {
        console.error("[Shima] Failed to fetch backdrop list", e);
    }

    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000;";

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: #111; color: #eee; padding: 30px; border-radius: 12px;
        z-index: 10001; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        border: 1px solid #333; min-width: 380px; font-family: sans-serif;
    `;

    panel.innerHTML = `<h2 style='margin-top:0'>Backdrop Config</h2>`;
    const controls = [];

    const createRow = (label, content) => {
        const row = document.createElement("div");
        row.style.marginBottom = "15px";
        row.innerHTML = `<b style='font-size:13px; color:#aaa;'>${label}</b><br>`;
        row.appendChild(content);
        panel.appendChild(row);
    };

    // Colors
    const colorCont = document.createElement("div");
    colorCont.style.display = "flex"; colorCont.style.gap = "10px";
    const cTop = document.createElement("input");
    cTop.type = "color"; cTop.value = node.properties.color_top || "#1a1a1a";
    cTop.style.cssText = "flex:1; height:40px; border:none; background:none; cursor:pointer;";
    const cBot = document.createElement("input");
    cBot.type = "color"; cBot.value = node.properties.color_bottom || "#141414";
    cBot.style.cssText = "flex:1; height:40px; border:none; background:none; cursor:pointer;";
    colorCont.appendChild(cTop); colorCont.appendChild(cBot);
    createRow("Gradient (Top / Bottom)", colorCont);
    controls.push(() => {
        node.properties.color_top = cTop.value;
        node.properties.color_bottom = cBot.value;
    });

    // Opacity
    const opRow = document.createElement("div");
    opRow.style.marginBottom = "15px";

    const opHeader = document.createElement("div");
    opHeader.style.display = "flex"; opHeader.style.justifyContent = "space-between";
    opHeader.innerHTML = `<b style='font-size:13px; color:#aaa;'>Opacity / Alpha</b><span id='op-val' style='color:#0084ff; font-size:12px;'>${(node.properties.opacity || 1.0).toFixed(1)}</span>`;
    opRow.appendChild(opHeader);

    const opInput = document.createElement("input");
    opInput.type = "range"; opInput.min = "0.0"; opInput.max = "1.0"; opInput.step = "0.05";
    opInput.value = node.properties.opacity !== undefined ? node.properties.opacity : 1.0;
    opInput.style.width = "100%";
    opInput.oninput = (e) => document.getElementById("op-val").textContent = parseFloat(e.target.value).toFixed(1);
    opRow.appendChild(opInput);
    panel.appendChild(opRow);
    controls.push(() => node.properties.opacity = parseFloat(opInput.value));

    // Opacity Target
    const tSel = document.createElement("select");
    tSel.style.cssText = "width:100%; padding:10px; margin-top:5px; background:#222; color:white; border:1px solid #444;";
    ["Both", "Gradient", "Image"].forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.innerText = t;
        if (t === (node.properties.opacity_target || "Both")) opt.selected = true;
        tSel.appendChild(opt);
    });
    createRow("Apply opacity setting to:", tSel);
    controls.push(() => node.properties.opacity_target = tSel.value);

    // Image Selector
    const iSel = document.createElement("select");
    iSel.style.cssText = "width:100%; padding:10px; margin-top:5px; background:#222; color:white; border:1px solid #444;";
    images.forEach(img => {
        const opt = document.createElement("option");
        opt.value = img; opt.innerText = img;
        if (img === node.properties.bg_image) opt.selected = true;
        iSel.appendChild(opt);
    });
    createRow("Background Image", iSel);
    controls.push(() => node.properties.bg_image = iSel.value);

    // Scaling Mode
    const mSel = document.createElement("select");
    mSel.style.cssText = "width:100%; padding:10px; margin-top:5px; background:#222; color:white; border:1px solid #444;";
    ["Stretch", "Fit", "Cover"].forEach(m => {
        const opt = document.createElement("option");
        opt.value = m; opt.innerText = m;
        if (m === node.properties.scaling_mode) opt.selected = true;
        mSel.appendChild(opt);
    });
    createRow("Scaling Mode", mSel);
    controls.push(() => node.properties.scaling_mode = mSel.value);

    // Image Scaling
    const scaleCont = document.createElement("div");
    scaleCont.style.display = "flex"; scaleCont.style.gap = "10px";
    const sx = document.createElement("input");
    sx.type = "number"; sx.step = "0.1"; sx.value = node.properties.image_scale_x || 1.0;
    sx.style.cssText = "width:45%; padding:10px; background:#222; color:white; border:1px solid #444;";
    const sy = document.createElement("input");
    sy.type = "number"; sy.step = "0.1"; sy.value = node.properties.image_scale_y || 1.0;
    sy.style.cssText = "width:45%; padding:10px; background:#222; color:white; border:1px solid #444;";
    scaleCont.appendChild(sx); scaleCont.appendChild(sy);
    createRow("Fine Scaling Offset (X / Y)", scaleCont);
    controls.push(() => {
        node.properties.image_scale_x = parseFloat(sx.value);
        node.properties.image_scale_y = parseFloat(sy.value);
    });

    // Position Offsets
    const offCont = document.createElement("div");
    offCont.style.display = "flex"; offCont.style.gap = "10px";
    const ox = document.createElement("input");
    ox.type = "number"; ox.step = "1"; ox.value = node.properties.offset_x || 0;
    ox.style.cssText = "width:45%; padding:10px; background:#222; color:white; border:1px solid #444;";
    const oy = document.createElement("input");
    oy.type = "number"; oy.step = "1"; oy.value = node.properties.offset_y || 0;
    oy.style.cssText = "width:45%; padding:10px; background:#222; color:white; border:1px solid #444;";
    offCont.appendChild(ox); offCont.appendChild(oy);
    createRow("Position Offsets (X / Y Pixels)", offCont);
    controls.push(() => {
        node.properties.offset_x = parseInt(ox.value) || 0;
        node.properties.offset_y = parseInt(oy.value) || 0;
    });

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:30px;";
    const apply = document.createElement("button");
    apply.innerText = "Apply Changes";
    apply.style.cssText = "background:#0084ff; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:bold;";
    apply.onclick = () => { controls.forEach(c => c()); node.setDirtyCanvas(true); cleanup(); };
    const cancel = document.createElement("button");
    cancel.innerText = "Cancel";
    cancel.style.cssText = "background:#333; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer;";
    const cleanup = () => { document.body.removeChild(shade); document.body.removeChild(panel); };
    cancel.onclick = cleanup;
    shade.onclick = cleanup;

    footer.appendChild(cancel); footer.appendChild(apply);
    panel.appendChild(footer);
    document.body.appendChild(shade);
    document.body.appendChild(panel);
}
