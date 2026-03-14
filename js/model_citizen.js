window.Shima = window.Shima || {};

import { app } from "../../scripts/app.js";
import { addShimaToolbar } from "./shima_topbar.js";

// Keywords for detection
const TYPE_KEYWORDS = {
    "SDXL": ["xl", "sdxl"],
    "SD1.5": ["1.5", "sd15", "v1-5", "15"],
    "SD2.1": ["2.1", "sd21", "v2-1"],
    "Flux": ["flux"],
    "SD3": ["sd3"]
};

// Check if Item matches the model type
function isCompatible(name, modelType) {
    if (!name || name === "None" || name === "Auto") return true;

    // Normalize string
    const lowerName = name.toLowerCase();
    const keywords = TYPE_KEYWORDS[modelType];

    if (!keywords) return true; // Unknown type, show all

    // 1. Check Keywords (Positive Match)
    const hasMatch = keywords.some(k => lowerName.includes(k));
    if (hasMatch) return true;

    // 2. Strict Filtering (Negative Match)
    // If it has keywords of ANOTHER known type -> Exclude.
    let isOtherType = false;
    for (const [otherType, otherKeywords] of Object.entries(TYPE_KEYWORDS)) {
        if (otherType === modelType) continue;
        if (otherKeywords.some(k => lowerName.includes(k))) {
            isOtherType = true;
            break;
        }
    }

    if (isOtherType) return false;

    return true; // Ambiguous -> Show.
}

app.registerExtension({
    name: "Shima.ModelCitizen",
    async nodeCreated(node, app) {
        const targetClasses = ["Shima.ModelCitizen", "Shima.LoraStack"];
        if (!targetClasses.includes(node.comfyClass)) return;

        // 1. Add Shima Toolbar
        // For LoraStack, maybe we don't need all buttons?
        // But commonparams toggle is useful if we ever add it.
        addShimaToolbar(node, ["commonparams", "external_linking"]);

        // 2. Hide the toggle widgets (controlled by toolbar)
        const hideWidget = (widgetName) => {
            const widget = node.widgets?.find(w => w.name === widgetName);
            if (widget && widget.type !== "hidden") {
                widget.origType = widget.type;
                widget.origComputeSize = widget.computeSize;
                widget.type = "hidden";
                widget.computeSize = () => [0, -4];
                widget.hidden = true;
                widget.disabled = true;
            }
        };
        setTimeout(() => {
            hideWidget("use_commonparams");
            hideWidget("allow_external_linking");
        }, 50);

        // 3. Filtering Logic
        // Find Widgets
        // Renamed from model_type to filter_by_model_type
        const typeWidget = node.widgets.find(w => w.name === "filter_by_model_type");
        const ckptWidget = node.widgets.find(w => w.name === "ckpt_name");
        const loraWidgets = node.widgets.filter(w => w.name.startsWith("lora_") && w.name.endsWith("_name"));

        if (!typeWidget) return;

        // Store original options
        const storeOptions = (w) => {
            if (!w._originalOptions) {
                w._originalOptions = [...w.options.values];
            }
        };
        if (ckptWidget) storeOptions(ckptWidget);
        loraWidgets.forEach(storeOptions);

        const filterLists = () => {
            const currentType = typeWidget.value;

            // Helper to apply filter
            const applyFilter = (w) => {
                if (!w._originalOptions) {
                    // Try to capture again if missed (e.g. late load)
                    w._originalOptions = [...w.options.values];
                }

                let filtered;
                if (currentType === "All" || currentType === "Auto") {
                    // "All" is new default. "Auto" kept for legacy/fallback if user has old node.
                    filtered = w._originalOptions;
                } else {
                    filtered = w._originalOptions.filter(item =>
                        item === "None" ||
                        item === "Baked VAE" || // Special case
                        isCompatible(item, currentType)
                    );
                }

                // Update widget options
                w.options.values = filtered;
            };

            // Apply to Checkpoints (if exists)
            if (ckptWidget) applyFilter(ckptWidget);

            // Apply to LoRAs
            loraWidgets.forEach(applyFilter);

            node.setDirtyCanvas(true, true);

            // Resize node to fit visible widgets
            const newSize = node.computeSize();
            node.setSize([Math.max(node.size[0], newSize[0]), newSize[1]]);
        };

        // Attach Listener to filter_by_model_type
        const originalCallback = typeWidget.callback;
        typeWidget.callback = function (v) {
            if (originalCallback) originalCallback.apply(this, arguments);
            filterLists();
        };

        // Run once on load
        setTimeout(() => filterLists(), 100);

        // Enable Use Everywhere broadcasting for modelcitizen.bndl
        // Only target Shima.ModelCitizen, not LoraStack
        if (node.comfyClass === "Shima.ModelCitizen" || node.comfyClass === "Shima.PanelModelCitizen") {
            setTimeout(() => {
                if (!node.properties) node.properties = {};
                node.properties.ue_properties = node.properties.ue_properties || {};

                // Unconditionally force correct broadcast properties
                node.properties.ue_properties.output_not_broadcasting = {
                    "MODEL": true, "CLIP": true, "VAE": true, "name_string": true
                };
                node.properties.ue_properties.input_regex = "modelcitizen.bndl";
                node.properties.ue_properties.version = "7.0"; // Satisfy UE version check
                node.properties["ue_convert"] = true;

                if (app.graph) node.setDirtyCanvas(true, true);
                console.log("[Shima] Enabled exact regex UE broadcasting for Shima.ModelCitizen");
            }, 100);
        }
    }
});

