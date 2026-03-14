import { app } from "../../scripts/app.js";

/**
 * Shima Dymo Label - Frontend Extension
 * Embossed plastic tape aesthetic for industrial labeling.
 */

app.registerExtension({
    name: "Shima.DymoLabel",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.DymoLabel") {
            nodeType.title_mode = LiteGraph.NO_TITLE;
            nodeType.collapsable = false;
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass === "Shima.DymoLabel") {
            node.properties = node.properties || { font: "Courier, 'Courier New', monospace" };
            node.bgcolor = "transparent";
            node.boxcolor = "transparent";
            node.shima_ignore_color = true;
            node.flags = node.flags || {};
            node.flags.no_header = true;
            node.resizable = false;

            // Random jitter between -2 and 2 degrees, recalculated when content changes
            node._jitter_angle = (Math.random() * 4 - 2) * (Math.PI / 180);
            node.properties.jitter = true;

            // Hide widgets
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

            // Dynamic Sizing
            node.computeSize = function () {
                const text = this.widgets?.find(w => w.name === "text")?.value || "";
                const fontSize = this.widgets?.find(w => w.name === "font_size")?.value || 18;
                const font = this.properties.font || "Courier, 'Courier New', monospace";
                const lines = text.split("\n");
                const lineHeight = fontSize * 1.4;

                let maxW = 40;
                const tempCtx = document.createElement("canvas").getContext("2d");
                tempCtx.font = `bold ${fontSize}px ${font}`;
                lines.forEach(line => {
                    maxW = Math.max(maxW, tempCtx.measureText(line.toUpperCase()).width);
                });

                // Recalculate jitter whenever size/text changes to ensure variety
                this._jitter_angle = (Math.random() * 4 - 2) * (Math.PI / 180);

                return [maxW + 40, Math.max(30, lines.length * lineHeight + 20)];
            };

            node.onDrawBackground = function (ctx) {
                if (this.flags.collapsed || this.properties.hidden) return;

                // Always on Top Logic
                const nodes = app.graph._nodes;
                const idx = nodes.indexOf(this);
                if (idx !== -1 && idx < nodes.length - 1) {
                    nodes.splice(idx, 1);
                    nodes.push(this);
                }

                const textWidget = this.widgets?.find(w => w.name === "text");
                const text = textWidget?.value || "";
                const baseColor = this.widgets?.find(w => w.name === "base_color")?.value || "#222";
                const fontSize = this.widgets?.find(w => w.name === "font_size")?.value || 18;
                const font = this.properties.font || "Courier, 'Courier New', monospace";
                const useJitter = this.widgets?.find(w => w.name === "jitter")?.value ?? true;
                const [w, h] = this.size;
                const lines = text.split("\n");

                ctx.save();

                // Apply Jitter
                if (useJitter) {
                    ctx.translate(w / 2, h / 2);
                    ctx.rotate(this._jitter_angle);
                    ctx.translate(-w / 2, -h / 2);
                }

                // 1. Tape Border
                ctx.beginPath();
                const r = 3;
                ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
                ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
                ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
                ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
                ctx.closePath();

                const tapeGrad = ctx.createLinearGradient(0, 0, 0, h);
                tapeGrad.addColorStop(0, "rgba(255,255,255,0.15)");
                tapeGrad.addColorStop(0.1, baseColor);
                tapeGrad.addColorStop(0.5, baseColor);
                tapeGrad.addColorStop(0.9, baseColor);
                tapeGrad.addColorStop(1, "rgba(0,0,0,0.35)");
                ctx.fillStyle = tapeGrad;
                ctx.fill();

                // 2. Embossed Text
                ctx.font = `bold ${fontSize}px ${font}`;
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";

                const lineHeight = fontSize * 1.4;
                const startY = (h / 2) - ((lines.length - 1) * lineHeight / 2);

                lines.forEach((line, i) => {
                    const py = startY + (i * lineHeight);
                    const label = line.toUpperCase();
                    ctx.fillStyle = "rgba(0,0,0,0.6)";
                    ctx.fillText(label, w / 2 + 1, py + 1.5);
                    ctx.fillStyle = "rgba(255,255,255,0.4)";
                    ctx.fillText(label, w / 2 - 0.5, py - 0.5);
                    ctx.fillStyle = "#fcfcfc";
                    ctx.fillText(label, w / 2, py);
                });

                ctx.restore();
            };

            node.onDblClick = function () {
                showDymoModal(this);
            };

            node.getExtraMenuOptions = function (_, options) {
                options.push({
                    content: "Shima: Configure Label...",
                    callback: () => showDymoModal(this)
                });
            };
        }
    }
});

function showDymoModal(node) {
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000;";

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: #111; color: #eee; padding: 30px; border-radius: 12px;
        z-index: 10001; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        border: 1px solid #333; min-width: 380px; font-family: sans-serif;
    `;

    panel.innerHTML = `<h2 style='margin-top:0'>Dymo Label Config</h2>`;

    const createInput = (label, type, value, step = 1) => {
        const row = document.createElement("div");
        row.style.marginBottom = "15px";
        row.innerHTML = `<b style='font-size:12px; color:#aaa; display:block; margin-bottom:5px;'>${label}</b>`;
        const el = document.createElement(type === "textarea" ? "textarea" : (type === "select" ? "select" : "input"));
        if (type !== "textarea" && type !== "select") el.type = type;
        if (step && type !== "select") el.step = step;
        el.value = value;
        el.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444; box-sizing:border-box;";
        if (type === "textarea") el.style.height = "60px";
        row.appendChild(el);
        panel.appendChild(row);
        return el;
    };

    const textW = node.widgets?.find(w => w.name === "text");
    const colorW = node.widgets?.find(w => w.name === "base_color");
    const sizeW = node.widgets?.find(w => w.name === "font_size");
    const jitterW = node.widgets?.find(w => w.name === "jitter");

    const tIn = createInput("Label Text", "textarea", textW?.value || "");
    const fIn = createInput("Custom Font", "text", node.properties.font || "");
    const cIn = createInput("Tape Color", "color", colorW?.value || "#000000");

    // Size & Jitter Row
    const sjRow = document.createElement("div");
    sjRow.style.display = "flex"; sjRow.style.gap = "15px"; sjRow.style.marginBottom = "20px";

    const sBox = document.createElement("div"); sBox.style.flex = "1";
    sBox.innerHTML = "<b style='font-size:12px; color:#aaa; display:block; margin-bottom:5px;'>Size</b>";
    const sIn = document.createElement("input"); sIn.type = "number"; sIn.value = sizeW?.value || 18;
    sIn.style.cssText = "width:100%; padding:10px; background:#222; color:white; border:1px solid #444;";
    sBox.appendChild(sIn);

    const jBox = document.createElement("div"); jBox.style.flex = "1";
    jBox.innerHTML = "<b style='font-size:12px; color:#aaa; display:block; margin-bottom:5px;'>Jitter Angle</b>";
    const jIn = document.createElement("select");
    jIn.style.cssText = "width:100%; padding:10px; background:#222; color:white; border: 1px solid #444;";
    [{ k: true, v: "Enabled" }, { k: false, v: "Disabled" }].forEach(o => {
        const opt = document.createElement("option"); opt.value = o.k; opt.innerText = o.v;
        if (o.k === jitterW?.value) opt.selected = true;
        jIn.appendChild(opt);
    });
    jBox.appendChild(jIn);

    sjRow.appendChild(sBox); sjRow.appendChild(jBox);
    panel.appendChild(sjRow);

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:20px;";

    const apply = document.createElement("button");
    apply.innerText = "Save Changes";
    apply.style.cssText = "background:#0084ff; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:bold;";
    apply.onclick = () => {
        if (textW) textW.value = tIn.value;
        if (colorW) colorW.value = cIn.value;
        if (sizeW) sizeW.value = parseInt(sIn.value) || 18;
        if (jitterW) jitterW.value = jIn.value === "true";
        node.properties.font = fIn.value || "Courier, 'Courier New', monospace";
        node.setSize(node.computeSize());
        node.setDirtyCanvas(true);
        cleanup();
    };

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
