/**
 * Utility to manage Use Everywhere (UE) properties for nodes.
 * Specifically used to disable UE connections for certain inputs to prevent recursion or unwanted connections.
 */

/**
 * Disables Use Everywhere (UE) for a list of input names on a node.
 * This sets the 'input_ue_unconnectable' property to true for each input.
 * 
 * @param {LGraphNode} node - The node instance
 * @param {string[]} inputNames - Array of input names to disable UE for
 */
export function disableUEForInputs(node, inputNames) {
    if (!node || !inputNames || inputNames.length === 0) return;

    // Ensure properties structure exists
    node.properties = node.properties || {};
    node.properties["ue_properties"] = node.properties["ue_properties"] || {};

    if (!node.properties["ue_properties"]["input_ue_unconnectable"]) {
        node.properties["ue_properties"]["input_ue_unconnectable"] = {};
    }

    const targetProp = node.properties["ue_properties"]["input_ue_unconnectable"];

    inputNames.forEach(key => {
        // Only set if not already defined (preserve user overrides if any? logic implies force set usually)
        // Replicating original logic: if undefined, set true.
        if (targetProp[key] === undefined) {
            targetProp[key] = true;
        }
    });
}
