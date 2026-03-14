import { app } from "../../scripts/app.js";
import { disableUEForInputs } from "./ue_helper.js";

app.registerExtension({
    name: "Shima.FileSaver",
    async nodeCreated(node, app) {
        if (node.comfyClass !== "Shima.FileSaver") return;

        // Disable Use Everywhere for standard file saver inputs to prevent unwanted defaults
        disableUEForInputs(node, [
            "external_project",
            "external_folder",
            "external_collision_id",
            "subfolder_path"
        ]);

        // Ensure properties persist on save/load
        // The helper modifies node.properties which are serialized automatically.
    }
});
