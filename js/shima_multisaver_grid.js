import { app } from "../../scripts/app.js";
import { disableUEForInputs } from "./ue_helper.js";
import { createIconGridWidget } from "./grid_widget.js";

/**
 * Shima MultiSaver Grid Menu
 * Replaces boolean toggles with a graphical grid of icons.
 */

// Define Grid Items and their associated widgets
const GRID_ITEMS = [
    { id: "save_original", image: "/extensions/Shima/icons/multisaver_icon_unprocessed_128px.png", default: true },
    { id: "save_lineart", image: "/extensions/Shima/icons/multisaver_icon_lineart_128px.png" },
    { id: "save_canny", image: "/extensions/Shima/icons/multisaver_icon_canny_128px.png" },
    { id: "save_depth", image: "/extensions/Shima/icons/multisaver_icon_depth_128px.png" },
    { id: "save_normal", image: "/extensions/Shima/icons/multisaver_icon_normals_128px.png" },
    { id: "save_palette", image: "/extensions/Shima/icons/multisaver_icon_palette_128px.png" },
    { id: "save_highlight", image: "/extensions/Shima/icons/multisaver_icon_highlights_128px.png" },
    { id: "save_shadow", image: "/extensions/Shima/icons/multisaver_icon_shadows_128px.png" },
    { id: "save_fx", icon: "✨" }
];

// Map toggle names (Grid ID) to their sub-setting widgets
const SUBSET_MAPPING = {
    "save_lineart": ["lineart_resolution", "line_art_invert", "lineart_intensity", "lineart_blur"],
    "save_canny": ["canny_low", "canny_high"],
    "save_depth": ["depth_model"],
    "save_normal": ["normal_model", "normal_strength"],
    "save_palette": ["palette_colors"],
    "save_highlight": ["highlight_threshold"],
    "save_shadow": ["shadow_threshold"],
    "save_fx": [], // No sub-widgets, just toggle
    "save_original": []
};

function createMultiSaverGrid(node) {
    const WIDGET_NAME = "export_grid";

    // Check if widget already exists to avoid duplication
    if (node.widgets && node.widgets.find(w => w.name === WIDGET_NAME)) return;

    const gridWidget = createIconGridWidget(node, WIDGET_NAME, GRID_ITEMS, {
        columns: 3,
        cellHeight: 80,
        iconSize: 64
    });

    // Inject UE Properties (Default to False to prevent recursion)
    const ensureUEProperties = () => {
        disableUEForInputs(node, [
            "external_project",
            "external_folder",
            "external_collision_id",
            "subfolder_path",
            "fx_in"
        ]);
    };
    ensureUEProperties();

    // Helper to sync Grid State -> Boolean Widgets
    const syncBooleans = (activeIds) => {
        GRID_ITEMS.forEach(item => {
            const widgetName = item.id; // The ID matches the boolean widget name usually
            const widget = node.widgets?.find(w => w.name === widgetName);
            if (widget) {
                const shouldBeActive = activeIds.includes(item.id);
                if (widget.value !== shouldBeActive) {
                    widget.value = shouldBeActive;
                    if (widget.callback) widget.callback(widget.value);
                }
            }
        });
    };

    // Helper to toggle visibility of sub-setting widgets
    const updateWidgetVisibility = (activeIds) => {
        const allSubsetWidgets = Object.values(SUBSET_MAPPING).flat();
        let changed = false;

        allSubsetWidgets.forEach(wName => {
            // Find parent ID that controls this widget
            // A widget might be controlled by multiple? (Unlikely here)
            const parentEntries = Object.entries(SUBSET_MAPPING).filter(([pid, children]) => children.includes(wName));

            // Should show if ANY parent is active?
            // Usually 1-to-1 mapping in this list.
            const shouldShow = parentEntries.some(([pid]) => activeIds.includes(pid));

            const widget = node.widgets?.find(w => w.name === wName);
            if (widget) {
                if (shouldShow && widget.type === "hidden") {
                    widget.type = widget.origType || widget.type; // Restore
                    widget.computeSize = widget.origComputeSize; // Direct assignment (fixes undef bug)
                    changed = true;
                } else if (!shouldShow && widget.type !== "hidden") {
                    if (!widget.origType) {
                        widget.origType = widget.type;
                        widget.origComputeSize = widget.computeSize;
                    }
                    widget.type = "hidden";
                    widget.computeSize = () => [0, -4];
                    changed = true;
                }
            }
        });

        if (changed) {
            node.setDirtyCanvas(true, true);
            node.setSize(node.computeSize());
        }
    };

    // Callback handling
    gridWidget.callback = (val) => {
        syncBooleans(val);
        updateWidgetVisibility(val);
    };

    // Initial Sync
    const initialActive = [];
    GRID_ITEMS.forEach(item => {
        const w = node.widgets?.find(w => w.name === item.id);
        if (w && w.value === true) {
            initialActive.push(item.id);
        } else if (!w && item.default) {
            // Assume default if not found
        }
    });

    if (initialActive.length > 0 || node.widgets) {
        gridWidget.value = initialActive;
    }

    // Trigger initial visibility update
    setTimeout(() => {
        updateWidgetVisibility(gridWidget.value);
    }, 100);

    // Insert Widget Logic
    // Insert Grid after "save_mode" or similar anchor
    const anchorName = "save_mode";
    const idx = node.widgets.findIndex(w => w.name === anchorName);
    if (idx !== -1) {
        node.widgets.splice(idx + 1, 0, gridWidget);
    } else {
        node.widgets.unshift(gridWidget);
    }

    // Hide Boolean Toggles AND Clamp user_notes
    setTimeout(() => {
        // Hide toggles
        GRID_ITEMS.forEach(item => {
            const w = node.widgets?.find(w => w.name === item.id);
            if (w && w.type !== "hidden") {
                w.origType = w.type;
                w.type = "hidden";
                w.computeSize = () => [0, -4];
            }
        });

        // Clamp user_notes height
        const notesWidget = node.widgets?.find(w => w.name === "user_notes");
        if (notesWidget) {
            notesWidget.computeSize = (width) => [width, 60]; // Fixed height 60px
        }

        // Force update visibility based on current values
        // This fixes the "Hidden on Load" issue
        // We re-scan the boolean values because gridWidget.value might be stale or empty on first run
        const currentActive = [];
        GRID_ITEMS.forEach(item => {
            const w = node.widgets?.find(w => w.name === item.id);
            // Should we trust the widget value? Yes.
            // Note: w.type is hidden now, but w.value holds the boolean state.
            if (w && w.value === true) {
                currentActive.push(item.id);
            }
        });

        gridWidget.value = currentActive;
        updateWidgetVisibility(currentActive);

        // Resize node to fit
        node.onResize?.(node.size);
        node.setSize(node.computeSize());

    }, 200); // Increased timeout slightly to ensure all widgets loaded

    // Persist visibility state on load
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        origOnConfigure?.call(this, info);
        // Ensure UE Properties survive loading
        ensureUEProperties();

        // Force sync after configuration loaded
        setTimeout(() => {
            const currentActive = [];
            GRID_ITEMS.forEach(item => {
                const w = node.widgets?.find(w => w.name === item.id);
                if (w && w.value === true) {
                    currentActive.push(item.id);
                }
            });
            gridWidget.value = currentActive;
            updateWidgetVisibility(currentActive);
            node.setSize(node.computeSize());
        }, 50);
    };
}

/**
 * Reorder widgets to match desired layout
 */
function reorderWidgets(node) {
    const TOP = [
        "images", "fx_in", "shima.commonparams",
        "external_project", "external_folder", "external_collision_id",
        "subfolder_path", "save_mode", "export_grid"
    ];

    const BOTTOM = [
        "user_notes", "show_used_values"
    ];

    if (node.widgets) {
        node.widgets.sort((a, b) => {
            const aName = a.name;
            const bName = b.name;

            // Check Bottom
            const aBottom = BOTTOM.indexOf(aName);
            const bBottom = BOTTOM.indexOf(bName);

            if (aBottom !== -1 && bBottom !== -1) return aBottom - bBottom;
            if (aBottom !== -1) return 1; // a goes to bottom
            if (bBottom !== -1) return -1; // b goes to bottom

            // Check Top
            const aTop = TOP.indexOf(aName);
            const bTop = TOP.indexOf(bName);

            if (aTop !== -1 && bTop !== -1) return aTop - bTop;
            if (aTop !== -1) return -1; // a goes to top
            if (bTop !== -1) return 1; // b goes to top

            return 0;
        });

        node.setDirtyCanvas(true, true);
        node.setSize(node.computeSize());
    }
}


app.registerExtension({
    name: "Shima.MultiSaverGrid",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Shima.MultiSaver") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }
                createMultiSaverGrid(this);
            };
        }
    }
});
