import { app } from "../../scripts/app.js";

function getUniqueNodeId(prompt) {
    let id = 10000;
    while (prompt[id.toString()]) {
        id++;
    }
    return id.toString();
}

app.registerExtension({
    name: "Shima.MacroExpander",
    async setup() {
        const origGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = async function () {
            // Let ComfyUI do the initial serialization of the canvas
            let p;
            try {
                p = await origGraphToPrompt.apply(this, arguments);
            } catch (e) {
                // If it fails (e.g., disconnected nodes), pass the error up
                throw e;
            }

            if (!p || !p.output) return p;
            const prompt = p.output;
            console.log("[Shima.Macro] RAW PRE-EXPANSION PROMPT:", JSON.parse(JSON.stringify(prompt)));

            // Find all Shima.PanelSampler instances in the serialized prompt
            const panelNodes = [];
            for (const [id, node] of Object.entries(prompt)) {
                if (node.class_type === "Shima.PanelSampler") {
                    panelNodes.push({ id, node });
                }
            }

            for (const panel of panelNodes) {
                const panelId = panel.id;
                const panelData = panel.node;

                // 1. Generate new ID for the backend node
                const kSampler_Id = getUniqueNodeId(prompt);
                // Pre-claim it so we don't collide on the next one
                prompt[kSampler_Id] = { "class_type": "Dummy" };

                // 2. Extract configuration directly from the node's native inputs
                const cfg = panelData.inputs || {};

                // 3. Construct Shima.Sampler (The monolithic backend handler)
                // It natively supports BNDL inputs so we pass them directly from the panel.
                const samplerInputs = {
                    "modelcitizen.bndl": panelData.inputs["modelcitizen.bndl"] || panelData.inputs["modelcitizen_bndl"] || panelData.inputs["modelcitizen"],
                    "masterprompt.bndl": panelData.inputs["masterprompt.bndl"] || panelData.inputs["masterprompt_bndl"] || panelData.inputs["masterprompt"],
                    "latentmaker.bndl": panelData.inputs["latentmaker.bndl"] || panelData.inputs["latentmaker_bndl"] || panelData.inputs["latentmaker"],
                };

                // Forward the shima_commonparams wire if it exists
                if (cfg["shima.commonparams"]) {
                    samplerInputs["shima.commonparams"] = cfg["shima.commonparams"];
                }

                // Forward the shima.samplercommons wire if it exists
                if (cfg["shima.samplercommons"]) {
                    samplerInputs["shima.samplercommons"] = cfg["shima.samplercommons"];
                }

                // Forward the panelinputs.bndl wire if it exists
                if (cfg["panelinputs.bndl"]) {
                    samplerInputs["panelinputs.bndl"] = cfg["panelinputs.bndl"];
                }

                // Forward ALL native widget variables straight to Shima.Sampler
                const standardKeys = [
                    "s33d", "randomize", "steps", "cfg", "sampler_name", "scheduler",
                    "denoise", "add_noise", "start_at_step", "end_at_step", "return_with_leftover_noise",
                    "preview_method", "vae_decode", "upscale_enabled", "upscale_method",
                    "upscale_factor", "upscale_denoise", "upscale_steps", "upscale_cfg",
                    "use_commonparams", "use_samplercommons", "allow_external_linking"
                ];

                for (const key of standardKeys) {
                    if (cfg[key] !== undefined) samplerInputs[key] = cfg[key];
                }

                const shimaSampler = {
                    class_type: "Shima.Sampler",
                    inputs: samplerInputs
                };
                prompt[kSampler_Id] = shimaSampler;

                // 4. Reroute outbound connections.
                // Panel Outputs:         0 = Image (IMAGE), 1 = Latent (LATENT), 2 = shimasampler.bndl (BNDL)
                // Shima.Sampler Outputs: 0 = LATENT,         1 = IMAGE,           2 = s33d (INT), 3 = BNDL

                for (const targetId of Object.keys(prompt)) {
                    if (targetId === panelId) continue;
                    const targetNode = prompt[targetId];
                    if (!targetNode || !targetNode.inputs) continue;

                    for (const [inputKey, linkData] of Object.entries(targetNode.inputs)) {
                        if (Array.isArray(linkData) && linkData[0] === panelId) {
                            const outputIndex = linkData[1];
                            if (outputIndex === 0) {
                                // Panel output 0 (Image) -> Shima.Sampler output 1 (IMAGE)
                                targetNode.inputs[inputKey] = [kSampler_Id, 1];
                            } else if (outputIndex === 1) {
                                // Panel output 1 (Latent) -> Shima.Sampler output 0 (LATENT)
                                targetNode.inputs[inputKey] = [kSampler_Id, 0];
                            } else if (outputIndex === 2) {
                                // Panel output 2 (shimasampler.bndl) -> Shima.Sampler output 3 (BNDL)
                                targetNode.inputs[inputKey] = [kSampler_Id, 3];
                            }
                        }
                    }
                }

                // 7. Erase the Panel from existence! 
                // The python backend will never know it existed.
                delete prompt[panelId];
            }

            console.log("[Shima.Macro] Intercepted execution payload, expanded Panel Samplers.");
            console.log("[Shima.Macro] FINAL POST-EXPANSION PROMPT:", JSON.parse(JSON.stringify(prompt)));
            p.output = prompt;
            return p;
        };
    }
});
