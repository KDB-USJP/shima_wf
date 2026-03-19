import json
import os
from pathlib import Path

class ShimaDependencyGenerator:
    """ Acts as a 'Workflow Audit' tool that scans the current prompt for model dependencies. """
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "scan_now": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("json_stub",)
    FUNCTION = "generate_stub"
    CATEGORY = "Shima/Utilities"
    OUTPUT_NODE = True

    def generate_stub(self, scan_now, prompt=None, extra_pnginfo=None):
        if not scan_now or not prompt:
            return ("{}",)
            
        print(f"[Shima.Debug] Dependency Generator scanning prompt (v2 architecture)...")

        output = {"official_dependencies": []}

        def resolve_value(val):
            if isinstance(val, list) and len(val) == 2:
                # We return None for links as we prefer widget-based scanning
                return None
            return val

        def add_dep(name, node_type, category):
            if not name or not isinstance(name, str) or name in ["None", "Baked VAE"]:
                return
            
            # Avoid duplicate entries
            clean_id = name.replace("\\", "/")
            if any(d["id"] == clean_id for d in output["official_dependencies"]):
                return

            output["official_dependencies"].append({
                "id": clean_id,
                "filename": os.path.basename(name),
                "type": category,
                "save_path": "default",
                "url": "https://INSERT_URL_HERE",
                "description": f"Auto-detected dependency from {node_type}."
            })

        for node_id, node_data in prompt.items():
            node_type = node_data.get("class_type")
            inputs = node_data.get("inputs", {})
            
            # Checkpoint Loaders
            if node_type in ["CheckpointLoaderSimple", "CheckpointLoader", "GGUFLoader", "CheckpointLoader+"]:
                add_dep(resolve_value(inputs.get("ckpt_name")), node_type, "Checkpoint")
            
            # LoRA Loaders
            elif node_type in ["LoraLoader", "LoraLoaderModelOnly", "PowerLoraLoader"]:
                add_dep(resolve_value(inputs.get("lora_name")), node_type, "LoRA")
            
            # VAE Loaders
            elif node_type == "VAELoader":
                add_dep(resolve_value(inputs.get("vae_name")), node_type, "VAE")
            
            # ControlNet Loaders
            elif node_type in ["ControlNetLoader", "ControlNetLoaderAdvanced"]:
                add_dep(resolve_value(inputs.get("control_net_name")), node_type, "ControlNet")

            # Shima Multi-Loaders
            elif node_type in ["Shima.ModelCitizen", "Shima.PanelModelCitizen", "Shima.PanelBNDLer"]:
                add_dep(resolve_value(inputs.get("ckpt_name")), node_type, "Checkpoint")
                add_dep(resolve_value(inputs.get("vae_name")), node_type, "VAE")
                for i in range(1, 4):
                    add_dep(resolve_value(inputs.get(f"lora_{i}_name")), node_type, "LoRA")

        result_json = json.dumps(output, indent=4)
        return {"ui": {"text": [result_json]}, "result": (result_json,)}

class ShimaDependencyInstaller:
    """ Consumes a JSON stub to allowed users to view and install missing dependencies. """
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "json_data": ("STRING", {"multiline": True, "default": "{}"}),
            },
            "optional": {
                "json_stub": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("json_out",)
    FUNCTION = "install_logic"
    CATEGORY = "Shima/Utilities"
    OUTPUT_NODE = True

    def install_logic(self, json_data, json_stub=None):
        # If a stub is connected, it overrides the internal data for this run
        final_data = json_stub if json_stub and json_stub != "{}" else json_data
        return {"ui": {"text": [final_data]}, "result": (final_data,)}

NODE_CLASS_MAPPINGS = {
    "Shima.DependencyGenerator": ShimaDependencyGenerator,
    "Shima.DependencyInstaller": ShimaDependencyInstaller
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.DependencyGenerator": "🏝️ Dependency Generator",
    "Shima.DependencyInstaller": "📦 Dependency Installer"
}
