/**
 * Shima Route Suite - JavaScript Extension
 * 
 * Connection layout utilities adapted from rgthree-comfy (MIT License)
 * Copyright (c) 2023 Regis Gaughan, III (rgthree)
 * https://github.com/rgthree/rgthree-comfy
 * 
 * See docs/THIRD_PARTY_LICENSES.md for full license text.
 * 
 * Shima extends this to support multi-IO routing (2-5 slots per side).
 */

window.Shima = window.Shima || {};

import { app } from "../../scripts/app.js";

// ============================================================================
// Constants (from rgthree-comfy/web/comfyui/utils.js)
// ============================================================================

const PADDING = 0;

const LAYOUT_LABEL_TO_DATA = {
    Left: [LiteGraph.LEFT, [0, 0.5], [PADDING, 0]],
    Right: [LiteGraph.RIGHT, [1, 0.5], [-PADDING, 0]],
    Top: [LiteGraph.UP, [0.5, 0], [0, PADDING]],
    Bottom: [LiteGraph.DOWN, [0.5, 1], [0, -PADDING]]
};

const LAYOUT_LABEL_OPPOSITES = {
    Left: "Right",
    Right: "Left",
    Top: "Bottom",
    Bottom: "Top"
};

const LAYOUT_CLOCKWISE = ["Top", "Right", "Bottom", "Left"];

// All valid layout combinations for Shima nodes
const LAYOUT_OPTIONS = [
    ["Left", "Right"],
    ["Left", "Top"],
    ["Left", "Bottom"],
    ["Right", "Left"],
    ["Right", "Top"],
    ["Right", "Bottom"],
    ["Top", "Left"],
    ["Top", "Right"],
    ["Top", "Bottom"],
    ["Bottom", "Left"],
    ["Bottom", "Right"],
    ["Bottom", "Top"]
];

// Node sizing
const SLOT_SIZE = 25;
const MIN_NODE_SIZE = 35;

// ============================================================================
// Helper Functions (from rgthree-comfy)
// ============================================================================

function toggleConnectionLabel(cxn, hide = true) {
    if (hide) {
        if (!cxn.has_old_label) {
            cxn.has_old_label = true;
            cxn.old_label = cxn.label;
        }
        cxn.label = " ";
    } else if (!hide && cxn.has_old_label) {
        cxn.has_old_label = false;
        cxn.label = cxn.old_label;
        cxn.old_label = undefined;
    }
    return cxn;
}

// ============================================================================
// Menu System (from rgthree-comfy)
// ============================================================================

function addMenuItemOnExtraMenuOptions(node, config, menuOptions, after = "Shape") {
    let idx = menuOptions
        .slice()
        .reverse()
        .findIndex((option) => option?.isRgthree);
    if (idx == -1) {
        idx = menuOptions.findIndex((option) => option?.content?.includes(after)) + 1;
        if (!idx) {
            idx = menuOptions.length - 1;
        }
        menuOptions.splice(idx, 0, null);
        idx++;
    } else {
        idx = menuOptions.length - idx;
    }

    const subMenuOptions = typeof config.subMenuOptions === "function"
        ? config.subMenuOptions(node)
        : config.subMenuOptions;

    menuOptions.splice(idx, 0, {
        content: typeof config.name == "function" ? config.name(node) : config.name,
        has_submenu: !!(subMenuOptions?.length),
        isRgthree: true,
        callback: (value, _options, event, parentMenu, _node) => {
            if (!!(subMenuOptions?.length)) {
                new LiteGraph.ContextMenu(
                    subMenuOptions.map((option) => (option ? { content: option } : null)),
                    {
                        event,
                        parentMenu,
                        callback: (subValue, _options, _event, _parentMenu, _node) => {
                            if (config.property) {
                                node.properties = node.properties || {};
                                node.properties[config.property] = config.prepareValue
                                    ? config.prepareValue(subValue.content || "", node)
                                    : subValue.content || "";
                            }
                            config.callback && config.callback(node, subValue?.content);
                        },
                    }
                );
                return;
            }
            if (config.property) {
                node.properties = node.properties || {};
                node.properties[config.property] = config.prepareValue
                    ? config.prepareValue(node.properties[config.property], node)
                    : !node.properties[config.property];
            }
            config.callback && config.callback(node, value?.content);
        },
    });
}

function addMenuItem(node, _app, config, after = "Shape") {
    const oldGetExtraMenuOptions = node.prototype.getExtraMenuOptions;
    node.prototype.getExtraMenuOptions = function (canvas, menuOptions) {
        oldGetExtraMenuOptions && oldGetExtraMenuOptions.apply(this, [canvas, menuOptions]);
        addMenuItemOnExtraMenuOptions(this, config, menuOptions, after);
    };
}

// ============================================================================
// Connection Position (from rgthree-comfy - EXTENDED for multi-slot)
// ============================================================================

function getConnectionPosForLayout(node, isInput, slotNumber, out) {
    out = out || new Float32Array(2);

    node.properties = node.properties || {};
    const layout = node.properties["connections_layout"] ||
        node.defaultConnectionsLayout || ["Left", "Right"];
    const collapseConnections = node.properties["collapse_connections"] || false;
    const offset = node.constructor.layout_slot_offset ?? LiteGraph.NODE_SLOT_HEIGHT * 0.5;

    let side = isInput ? layout[0] : layout[1];
    let data = LAYOUT_LABEL_TO_DATA[side];

    const slotList = node[isInput ? "inputs" : "outputs"];
    const slotCount = slotList ? slotList.length : 1;
    const cxn = slotList ? slotList[slotNumber] : null;

    if (!cxn) {
        console.log("[Shima] No connection found", isInput, slotNumber);
        return out;
    }

    // Handle disabled slots
    if (cxn.disabled) {
        if (cxn.color_on !== "#666665") {
            cxn._color_on_org = cxn._color_on_org || cxn.color_on;
            cxn._color_off_org = cxn._color_off_org || cxn.color_off;
        }
        cxn.color_on = "#666665";
        cxn.color_off = "#666665";
    } else if (cxn.color_on === "#666665") {
        cxn.color_on = cxn._color_on_org || undefined;
        cxn.color_off = cxn._color_off_org || undefined;
    }

    const displaySlot = collapseConnections
        ? 0
        : slotNumber - slotList.reduce((count, ioput, index) => {
            count += index < slotNumber && ioput.hidden ? 1 : 0;
            return count;
        }, 0);

    cxn.dir = data[0];

    // Check if this is a Reroute-style node (single slot) or multi-slot
    const isRerouteStyle = node.constructor?.type?.includes("Reroute") || slotCount === 1;

    // L-shape detection: input and output are on perpendicular sides
    // For outputs in L-shapes, we need to reverse the slot order to prevent crossing
    const inputSide = layout[0];
    const outputSide = layout[1];

    // Define which layouts need output reversal for clean L-shapes
    // These are layouts where outputs should be reversed to match input flow
    const lShapeReversals = [
        ["Left", "Top"],      // Left inputs top-to-bottom, Top outputs need right-to-left
        ["Left", "Bottom"],   // Left inputs top-to-bottom, Bottom outputs need right-to-left  
        ["Right", "Top"],     // Right inputs top-to-bottom, Top outputs need left-to-right (already correct? depends)
        ["Right", "Bottom"],  // Right inputs top-to-bottom, Bottom outputs need left-to-right
        ["Top", "Right"],     // Top inputs left-to-right, Right outputs need bottom-to-top
        ["Bottom", "Right"],  // Bottom inputs left-to-right, Right outputs need top-to-bottom
    ];

    // Check if current layout is an L-shape that needs reversal
    const needsReversal = !isInput && !isRerouteStyle &&
        lShapeReversals.some(([inS, outS]) => inputSide === inS && outputSide === outS);

    // Calculate effective slot for positioning (reversed for L-shapes)
    const effectiveSlot = needsReversal ? (slotCount - 1 - displaySlot) : displaySlot;

    if (side === "Left") {
        if (node.flags?.collapsed) {
            out[0] = node.pos[0];
            out[1] = node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT * 0.5;
        } else {
            toggleConnectionLabel(cxn, !isInput || collapseConnections || !!node.hideSlotLabels);
            out[0] = node.pos[0] + offset;
            if (isRerouteStyle) {
                out[1] = node.pos[1] + node.size[1] * 0.5;
            } else {
                // Multi-slot: distribute evenly along the height
                const spacing = node.size[1] / (slotCount + 1);
                out[1] = node.pos[1] + spacing * (effectiveSlot + 1);
            }
        }
    }
    else if (side === "Right") {
        if (node.flags?.collapsed) {
            const w = node._collapsed_width || LiteGraph.NODE_COLLAPSED_WIDTH;
            out[0] = node.pos[0] + w;
            out[1] = node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT * 0.5;
        } else {
            toggleConnectionLabel(cxn, isInput || collapseConnections || !!node.hideSlotLabels);
            out[0] = node.pos[0] + node.size[0] + 1 - offset;
            if (isRerouteStyle) {
                out[1] = node.pos[1] + node.size[1] * 0.5;
            } else {
                const spacing = node.size[1] / (slotCount + 1);
                out[1] = node.pos[1] + spacing * (effectiveSlot + 1);
            }
        }
    }
    else if (side === "Top") {
        toggleConnectionLabel(cxn, true);
        if (isRerouteStyle) {
            out[0] = node.pos[0] + node.size[0] * 0.5;
        } else {
            const spacing = node.size[0] / (slotCount + 1);
            out[0] = node.pos[0] + spacing * (effectiveSlot + 1);
        }
        out[1] = node.pos[1] + offset;
    }
    else if (side === "Bottom") {
        toggleConnectionLabel(cxn, true);
        if (isRerouteStyle) {
            out[0] = node.pos[0] + node.size[0] * 0.5;
        } else {
            const spacing = node.size[0] / (slotCount + 1);
            out[0] = node.pos[0] + spacing * (effectiveSlot + 1);
        }
        out[1] = node.pos[1] + node.size[1] - offset;
    }

    return out;
}

// ============================================================================
// Connection Layout Support (from rgthree-comfy)
// ============================================================================

function addConnectionLayoutSupport(node, _app, options = LAYOUT_OPTIONS, callback) {
    // Add menu item for layout selection
    addMenuItem(node, _app, {
        name: "Connections Layout",
        property: "connections_layout",
        subMenuOptions: options.map((option) => option[0] + (option[1] ? " -> " + option[1] : "")),
        prepareValue: (value, node) => {
            const values = String(value).split(" -> ");
            if (!values[1] && !node.outputs?.length) {
                values[1] = LAYOUT_LABEL_OPPOSITES[values[0]];
            }
            if (!LAYOUT_LABEL_TO_DATA[values[0]] || !LAYOUT_LABEL_TO_DATA[values[1]]) {
                throw new Error(`New Layout invalid: [${values[0]}, ${values[1]}]`);
            }
            return values;
        },
        callback: (node) => {
            callback && callback(node);
            node.graph?.setDirtyCanvas(true, true);
        },
    });

    // Override connection position methods
    node.prototype.getConnectionPos = function (isInput, slotNumber, out) {
        return getConnectionPosForLayout(this, isInput, slotNumber, out);
    };
    node.prototype.getInputPos = function (slotNumber) {
        return getConnectionPosForLayout(this, true, slotNumber, [0, 0]);
    };
    node.prototype.getOutputPos = function (slotNumber) {
        return getConnectionPosForLayout(this, false, slotNumber, [0, 0]);
    };
}

// ============================================================================
// Type Detection and Coloring
// ============================================================================

function getLinkColorForType(type) {
    if (typeof LGraphCanvas !== 'undefined' && LGraphCanvas?.link_type_colors?.[type]) {
        return LGraphCanvas.link_type_colors[type];
    }
    return "#999999";
}

// Updated getConnectedType function with recursion protection
function getConnectedType(node, inputIndex, visited = new Set()) {
    if (!node.inputs?.[inputIndex]?.link) return "*";
    const link = app.graph.links[node.inputs[inputIndex].link];
    if (!link) return "*";
    const sourceNode = app.graph.getNodeById(link.origin_id);
    if (!sourceNode?.outputs?.[link.origin_slot]) return "*";

    // Check for circular reference using node ID
    if (visited.has(sourceNode.id)) {
        console.warn("[Shima] Circular reroute reference detected, breaking chain");
        return "*";
    }

    let type = sourceNode.outputs[link.origin_slot].type;

    // Follow reroute chains with recursion protection
    if (type === "*" && sourceNode.comfyClass?.startsWith("Shima.Route")) {
        visited.add(sourceNode.id);
        return getConnectedType(sourceNode, link.origin_slot, visited);
    }

    return type || "*";
}


function updateTypeColors(node) {
    if (!node.inputs || !node.outputs) return;

    const types = [];

    node.inputs.forEach((input, idx) => {
        const type = getConnectedType(node, idx);
        types.push(type);

        const color = getLinkColorForType(type);

        input.type = type;
        input.color_on = color;

        if (node.outputs[idx]) {
            node.outputs[idx].type = type;
            node.outputs[idx].color_on = color;

            for (const linkId of (node.outputs[idx].links || [])) {
                const link = app.graph.links[linkId];
                if (link) link.color = color;
            }
        }

        if (input.link) {
            const link = app.graph.links[input.link];
            if (link) link.color = color;
        }
    });

    node.properties.connected_types = types;
    return types;
}

// ============================================================================
// Node Setup
// ============================================================================

function setupRouteNode(node) {
    if (node._shimaRouteSetup) return;
    node._shimaRouteSetup = true;

    // Initialize properties
    node.properties = node.properties || {};
    node.properties.connections_layout = node.properties.connections_layout || ["Left", "Right"];
    node.properties.connected_types = node.properties.connected_types || [];

    node.hideSlotLabels = true;
    node.defaultConnectionsLayout = ["Left", "Right"];

    // Calculate square size
    const slotCount = node.inputs ? node.inputs.length : 1;
    const nodeSize = Math.max(MIN_NODE_SIZE, slotCount * SLOT_SIZE);
    node.size = [nodeSize, nodeSize];

    node.computeSize = function () {
        const count = this.inputs ? this.inputs.length : 1;
        const size = Math.max(MIN_NODE_SIZE, count * SLOT_SIZE);
        return [size, size];
    };

    // Hide slot labels
    node.inputs?.forEach(input => { input.label = " "; });
    node.outputs?.forEach(output => { output.label = " "; });

    // Set initial directions
    const layout = node.properties.connections_layout;
    const inputData = LAYOUT_LABEL_TO_DATA[layout[0]];
    const outputData = LAYOUT_LABEL_TO_DATA[layout[1]];
    node.inputs?.forEach(input => { input.dir = inputData[0]; });
    node.outputs?.forEach(output => { output.dir = outputData[0]; });

    // Restore colors from saved types
    if (node.properties.connected_types.length > 0) {
        node.properties.connected_types.forEach((type, idx) => {
            const color = getLinkColorForType(type);
            if (node.outputs?.[idx]) {
                node.outputs[idx].type = type;
                node.outputs[idx].color_on = color;
            }
            if (node.inputs?.[idx]) {
                node.inputs[idx].type = type;
                node.inputs[idx].color_on = color;
            }
        });
    }

    // Hook connection changes
    const originalOnConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function (type, index, connected, link_info) {
        updateTypeColors(this);
        this.setDirtyCanvas(true, true);
        if (originalOnConnectionsChange) {
            originalOnConnectionsChange.call(this, type, index, connected, link_info);
        }
    };

    // Initial type update
    setTimeout(() => {
        updateTypeColors(node);
        node.setDirtyCanvas(true, true);
    }, 50);
}

// ============================================================================
// Extension Registration
// ============================================================================

app.registerExtension({
    name: "Shima.RouteNodes",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (!nodeData.name?.startsWith("Shima.Route")) return;

        const slotCount = parseInt(nodeData.name.replace("Shima.Route", "")) || 1;

        // NO_TITLE for minimal look
        nodeType.title_mode = LiteGraph.NO_TITLE;
        nodeType.collapsable = false;
        nodeType.layout_slot_offset = 5;  // Match RGThree

        // Square size based on slot count
        const nodeSize = Math.max(MIN_NODE_SIZE, slotCount * SLOT_SIZE);
        nodeType.size = [nodeSize, nodeSize];

        // Apply connection layout support using RGThree's pattern
        addConnectionLayoutSupport(nodeType, app, LAYOUT_OPTIONS);
    },

    async nodeCreated(node) {
        if (!node.comfyClass?.startsWith("Shima.Route")) return;
        setupRouteNode(node);
    },

    async loadedGraphNode(node) {
        if (!node.comfyClass?.startsWith("Shima.Route")) return;
        setTimeout(() => setupRouteNode(node), 100);
    }
});

console.log("[Shima] Route Suite extension loaded (with RGThree-style positioning)");
