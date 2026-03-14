import torch
import folder_paths
import comfy.sd
import comfy.utils

class ShimaModelCitizen:
    """
    A unified loader node: Checkpoint + VAE (Optional) + 3 LoRAs.
    Simplifies workflow setup by combining common loader operations.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        checkpoints = folder_paths.get_filename_list("checkpoints")
        vaes = ["Baked VAE"] + folder_paths.get_filename_list("vae")
        loras = ["None"] + folder_paths.get_filename_list("loras")
        
        return {
            "required": {
                # Filter Control
                # Filter Control
                "filter_by_model_type": (["All", "SDXL", "SD1.5", "SD3", "Flux", "SD2.1"], {"default": "All"}),
                
                "ckpt_name": (checkpoints,),
                "vae_name": (vaes, {"default": "Baked VAE"}),
                
                "lora_1_name": (loras, {"default": "None"}),
                "lora_1_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                
                "lora_2_name": (loras, {"default": "None"}),
                "lora_2_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                
                "lora_3_name": (loras, {"default": "None"}),
                "lora_3_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
            },
            "optional": {
                "lora_stack": ("LORA_STACK",),
                "shima.commonparams": ("DICT", {"forceInput": True}),
                "use_commonparams": ("BOOLEAN", {"default": True}),
                "allow_external_linking": ("BOOLEAN", {"default": False}),
                "panelinputs.bndl": ("BNDL", {"forceInput": True, "tooltip": "Overrides panel settings using an external PanelBNDLer node"}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING", "BNDL")
    RETURN_NAMES = ("MODEL", "CLIP", "VAE", "name_string", "modelcitizen.bndl")
    FUNCTION = "load_stack"
    CATEGORY = "Shima/Loaders"

    def load_stack(self, ckpt_name, vae_name, 
                   lora_1_name, lora_1_strength, 
                   lora_2_name, lora_2_strength, 
                   lora_3_name, lora_3_strength,
                   filter_by_model_type="All",
                   lora_stack=None,
                   use_commonparams=False, allow_external_linking=False, **kwargs):
        
        # 0. Intercept PanelInputs overrides
        panelinputs = kwargs.get("panelinputs.bndl")
        if panelinputs:
            ckpt_name = panelinputs.get("ckpt_name", ckpt_name)
            vae_name = panelinputs.get("vae_name", vae_name)
            lora_1_name = panelinputs.get("lora_1_name", lora_1_name)
            lora_1_strength = panelinputs.get("lora_1_strength", lora_1_strength)
            lora_2_name = panelinputs.get("lora_2_name", lora_2_name)
            lora_2_strength = panelinputs.get("lora_2_strength", lora_2_strength)
            lora_3_name = panelinputs.get("lora_3_name", lora_3_name)
            lora_3_strength = panelinputs.get("lora_3_strength", lora_3_strength)
            filter_by_model_type = panelinputs.get("filter_by_model_type", filter_by_model_type)

        # 1. Load Checkpoint
        ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
        out = comfy.sd.load_checkpoint_guess_config(ckpt_path, output_vae=True, output_clip=True, embedding_directory=folder_paths.get_folder_paths("embeddings"))
        model, clip, vae = out[:3]
        
        # 2. VAE Override
        if vae_name != "Baked VAE":
            vae_path = folder_paths.get_full_path("vae", vae_name)
            vae = comfy.sd.VAE(sd=comfy.utils.load_torch_file(vae_path))
            print(f"[Shima] Model Citizen: Overriding VAE with {vae_name}")

        # 3. Apply LoRAs
        # Start with internal configs
        lora_configs = [
            (lora_1_name, lora_1_strength),
            (lora_2_name, lora_2_strength),
            (lora_3_name, lora_3_strength)
        ]
        
        # Append external stack if present
        if lora_stack:
            lora_configs.extend(lora_stack)
        
        active_loras = []
        
        for name, strength in lora_configs:
            if name != "None" and strength != 0:
                lora_path = folder_paths.get_full_path("loras", name)
                if lora_path:
                    model, clip = comfy.sd.load_lora_for_models(model, clip, comfy.utils.load_torch_file(lora_path), strength, strength)
                    # Clean clean name for display
                    base_name = name.rsplit('.', 1)[0]
                    # Shorten if in folder using split
                    if "\\" in base_name: base_name = base_name.split("\\")[-1]
                    if "/" in base_name: base_name = base_name.split("/")[-1]
                    active_loras.append(base_name)
                    print(f"[Shima] Model Citizen: Applied LoRA {base_name} ({strength})")

        # 4. Construct Name String
        # e.g. "SDXL + Detailer + Lighting"
        ckpt_base = ckpt_name.rsplit('.', 1)[0]
        if "\\" in ckpt_base: ckpt_base = ckpt_base.split("\\")[-1]
        
        name_string = ckpt_base
        
        if active_loras:
            name_string += " + " + " + ".join(active_loras)
            
        # 5. Create Model Bundle
        model_bundle = {
            "bndl_type": "modelcitizen",
            "model": model,
            "clip": clip,
            "vae": vae,
            "name_string": name_string
        }
            
        return (model, clip, vae, name_string, model_bundle)

class ShimaLoraStack:
    """
    Extension node for Model Citizen (and others).
    Provides 3 additional LoRA slots and outputs a LORA_STACK.
    """
    @classmethod
    def INPUT_TYPES(cls):
        loras = ["None"] + folder_paths.get_filename_list("loras")
        return {
            "required": {
                "filter_by_model_type": (["All", "SDXL", "SD1.5", "SD3", "Flux", "SD2.1"], {"default": "All"}),
                
                "lora_1_name": (loras, {"default": "None"}),
                "lora_1_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                
                "lora_2_name": (loras, {"default": "None"}),
                "lora_2_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                
                "lora_3_name": (loras, {"default": "None"}),
                "lora_3_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
            },
            "optional": {
                "lora_stack": ("LORA_STACK",), # Chainable!
            }
        }
    
    RETURN_TYPES = ("LORA_STACK",)
    RETURN_NAMES = ("LORA_STACK",)
    FUNCTION = "stack_em"
    CATEGORY = "Shima/Loaders"
    
    def stack_em(self, lora_1_name, lora_1_strength, 
                 lora_2_name, lora_2_strength, 
                 lora_3_name, lora_3_strength,
                 filter_by_model_type="All",
                 lora_stack=None):
        
        # Create list of (name, strength)
        current_stack = [
            (lora_1_name, lora_1_strength),
            (lora_2_name, lora_2_strength),
            (lora_3_name, lora_3_strength)
        ]
        
        # Filter None/0
        params = [x for x in current_stack if x[0] != "None" and x[1] != 0]
        
        # Prepend input stack (so input applies BEFORE these? or AFTER?)
        # Usually stacks append. Input is "previous stack".
        if lora_stack:
            # If we want the previous stack to happen first, we prepend it.
            # But here we are building a LIST of configs to be applied later.
            # So order matters: [Stack, 1, 2, 3] -> applied in that order.
            return (lora_stack + params,)
            
        return (params,)

class ShimaPanelModelCitizen(ShimaModelCitizen):
    """
    Panelized variant of ShimaModelCitizen.
    Frontend Javascript hides all native widgets and renders a sleek PCB chassis + double-click HTML modal.
    """
    CATEGORY = "Shima/Panels"
    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "BNDL")
    RETURN_NAMES = ("MODEL", "CLIP", "VAE", "modelcitizen.bndl")

    @classmethod
    def INPUT_TYPES(cls):
        inputs = ShimaModelCitizen.INPUT_TYPES()
        if "optional" not in inputs:
            inputs["optional"] = {}
        inputs["optional"]["panelinputs.bndl"] = ("BNDL", {"forceInput": True, "tooltip": "Overrides panel settings using an external PanelBNDLer node"})
        return inputs

    def load_stack(self, *args, **kwargs):
        res = super().load_stack(*args, **kwargs)
        # original returns (model, clip, vae, name_string, model_bundle)
        return (res[0], res[1], res[2], res[4])

NODE_CLASS_MAPPINGS = {
    "Shima.ModelCitizen": ShimaModelCitizen,
    "Shima.PanelModelCitizen": ShimaPanelModelCitizen,
    "Shima.LoraStack": ShimaLoraStack,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.ModelCitizen": "Shima Model Citizen",
    "Shima.PanelModelCitizen": "Shima Panel Model Citizen",
    "Shima.LoraStack": "Shima LoRA Stack",
}
