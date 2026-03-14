import { app } from "../../scripts/app.js";
import { addShimaToolbar } from "./shima_topbar.js";

/**
 * MasterPrompt Widgets - Dynamic Visibility Logic
 * 
 * Hides/Shows weight sliders AND text boxes based on selected model_type.
 * Toolbar with toggle icons provided by shima_topbar.js
 */

const MODEL_CONFIGS = {
    "sd1.5": ["clip_l_weight", "positive_l", "negative_l"],
    "sd2.x": ["clip_g_weight", "positive_g", "negative_g"],
    "sdxl": ["clip_l_weight", "positive_l", "negative_l",
        "clip_g_weight", "positive_g", "negative_g"],
    "pony": ["clip_l_weight", "positive_l", "negative_l",
        "clip_g_weight", "positive_g", "negative_g"],
    "illustrious": ["clip_l_weight", "positive_l", "negative_l",
        "clip_g_weight", "positive_g", "negative_g"],
    "sd3": ["clip_l_weight", "positive_l", "negative_l",
        "clip_g_weight", "positive_g", "negative_g",
        "t5_weight", "positive_t5", "negative_t5"],
    "flux": ["clip_l_weight", "positive_l", "negative_l",
        "t5_weight", "positive_t5", "negative_t5",
        "flux_guidance"],
    "auraflow": ["clip_g_weight", "positive_g", "negative_g",
        "t5_weight", "positive_t5", "negative_t5"],
    "hunyuan": ["clip_l_weight", "positive_l", "negative_l",
        "t5_weight", "positive_t5", "negative_t5"],
    "lumina2": ["lumina_sysprompt"],  // Gemma-2-2B single encoder, no CLIP sub-encoders
    "chroma": ["t5_weight", "positive_t5", "negative_t5",
        "flux_guidance"],
    "hidream": ["clip_l_weight", "positive_l", "negative_l",
        "clip_g_weight", "positive_g", "negative_g",
        "t5_weight", "positive_t5", "negative_t5"],
    "z-image-base": [],  // Qwen3-4B single encoder, no CLIP sub-encoders
    "z-image-turbo": [],  // Qwen3-4B single encoder, CFG locked at 1.0
};

const ALL_CONTROLLED_WIDGETS = [
    "clip_l_weight", "positive_l", "negative_l",
    "clip_g_weight", "positive_g", "negative_g",
    "t5_weight", "positive_t5", "negative_t5",
    "flux_guidance",
    "lumina_sysprompt"
];

app.registerExtension({
    name: "Shima.MasterPromptWidgets",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.MasterPrompt") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }

                // Add toolbar with toggle icons
                addShimaToolbar(this, ["commonparams", "external_linking", "show_values"]);

                // Fields to show in display
                const fields = ["model_type"];
                setupUsedValuesDisplay(this, fields);

                // Hide the toggle widgets (now controlled by toolbar)
                const hideWidget = (widgetName) => {
                    const widget = this.widgets?.find(w => w.name === widgetName);
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

                // Find the widgets
                const modelWidget = this.widgets.find(w => w.name === "model_type");

                if (modelWidget) {
                    const updateVisibility = (modelType) => {
                        const showList = MODEL_CONFIGS[modelType.toLowerCase()] || ALL_CONTROLLED_WIDGETS;

                        ALL_CONTROLLED_WIDGETS.forEach(widgetName => {
                            const widget = this.widgets.find(w => w.name === widgetName);

                            if (!widget) return;

                            const shouldShow = showList.includes(widgetName);

                            // Store original type if not stored
                            if (!shouldShow && widget.type !== "hidden" && !widget.origType) {
                                widget.origType = widget.type;
                                widget.origComputeSize = widget.computeSize;
                            }

                            if (shouldShow) {
                                if (widget.origType) {
                                    widget.type = widget.origType;
                                    widget.computeSize = widget.origComputeSize;
                                    widget.hidden = false;
                                    widget.disabled = false;
                                    delete widget.origType;
                                    delete widget.origComputeSize;
                                }
                            } else {
                                widget.type = "hidden";
                                widget.computeSize = () => [0, -4];
                                widget.hidden = true;
                                widget.disabled = true;
                            }
                        });

                        // Resize node to fit
                        // Allow resizing for values display too
                        const newSize = this.computeSize();

                        // Respect values display height if active
                        let extraHeight = 0;
                        if (this.shimaUsedValuesWidget && this.shimaUsedValuesWidget.computeSize) {
                            extraHeight = this.shimaUsedValuesWidget.computeSize()[1];
                        }

                        // REFINEMENT: Respect the existing size if it's larger than the minimum required (Persistence fix)
                        const targetH = Math.max(this.size[1], newSize[1] + extraHeight);
                        this.setSize([this.size[0], targetH]);
                        this.setDirtyCanvas(true);
                    };

                    // Hook callback
                    const origCallback = modelWidget.callback;
                    modelWidget.callback = function (value) {
                        updateVisibility(value);
                        if (origCallback) origCallback.call(this, value);
                    };

                    // Initial update
                    setTimeout(() => updateVisibility(modelWidget.value), 100);
                }

                // Enable Use Everywhere broadcasting for masterprompt.bndl
                setTimeout(() => {
                    if (!this.properties) this.properties = {};
                    this.properties.ue_properties = this.properties.ue_properties || {};

                    // Unconditionally force correct broadcast properties
                    this.properties.ue_properties.output_not_broadcasting = {
                        "positive": true, "negative": true, "CLIP_L_ONLY": true,
                        "CLIP_G_ONLY": true, "T5_ONLY": true, "pos_string": true, "neg_string": true
                    };
                    this.properties.ue_properties.input_regex = "masterprompt.bndl";
                    this.properties.ue_properties.version = "7.0"; // Satisfy UE version check
                    this.properties["ue_convert"] = true;

                    if (app.graph) this.setDirtyCanvas(true, true);
                    console.log("[Shima] Enabled exact regex UE broadcasting for Shima.MasterPrompt");
                }, 100);
            };
        }
    }
});

/**
 * Local Copy of setupUsedValuesDisplay (Safe from import issues)
 * Adjusted to accept fields array directly
 */
function setupUsedValuesDisplay(node, fields) {
    if (!fields) return;

    // Create container for the text display
    const container = document.createElement("div");
    container.className = "shima-used-values-display";
    container.style.cssText = `
        background: #1a1a1a;
        color: #888;
        padding: 8px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        border-top: 1px solid #333;
        white-space: pre-wrap;
        line-height: 1.4;
        display: none;
        overflow-y: auto;
        max-height: 200px;
    `;
    container.textContent = "Values will appear after execution...";

    // Add as a DOM widget (non-serialized)
    const widget = node.addDOMWidget("used_values_display", "div", container, {
        serialize: false,
        hideOnZoom: false
    });

    if (widget) {
        widget.computeSize = () => [node.size[0] - 20, 0];
    }

    // Store references
    node.shimaUsedValuesWidget = widget;

    // Update function to refresh display
    const updateDisplay = () => {
        const showWidget = node.widgets?.find(w => w.name === "show_used_values");
        const isVisible = showWidget?.value === true;

        container.style.display = isVisible ? "block" : "none";

        // If visible, update content
        if (isVisible) {
            if (node._shimaLastUiValues && node._shimaLastUiValues.length > 0) {
                container.textContent = node._shimaLastUiValues.join("\n");
            } else {
                container.textContent = "No execution data yet.\nRun workflow to see used values.";
            }
        }

        if (widget) {
            widget.computeSize = () => [node.size[0] - 20, isVisible ? 120 : 0];
        }

        node.setDirtyCanvas(true, true);
    };

    // Hook into show_used_values widget callback
    setTimeout(() => {
        const showWidget = node.widgets?.find(w => w.name === "show_used_values");
        if (showWidget) {
            const origCallback = showWidget.callback;
            showWidget.callback = function (value) {
                if (origCallback) origCallback.call(this, value);
                updateDisplay();
                // Trigger resize (preserve user-stretched size)
                const newSize = node.computeSize();
                const targetH = Math.max(node.size[1], newSize[1]);
                node.setSize([Math.max(node.size[0], newSize[0]), targetH]);
            };
            updateDisplay();
        }
    }, 100);

    // Also update after execution
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (origOnExecuted) origOnExecuted.call(this, message);

        if (message) {
            const values = message.used_values || message.values || (message.ui && (message.ui.used_values || message.ui.values));
            if (values) {
                node._shimaLastUiValues = values;
            }
        }

        updateDisplay();
        const newSize = node.computeSize();
        const targetH = Math.max(node.size[1], newSize[1]);
        node.setSize([Math.max(node.size[0], newSize[0]), targetH]);
    };
}
