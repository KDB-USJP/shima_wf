class ShimaPanelBNDLer:
    """
    Monolithic utility node that aggregates inputs for all Shima UI Panels.
    Combines connected inputs into a single 'panelinputs' BNDL dictionary.
    """
    @classmethod
    def INPUT_TYPES(cls):
        # We define all possible panel inputs as optional forceInput pins.
        # Dummy STRING inputs are used as visual separators in the graph.
        return {
            "required": {},
            "optional": {
                # --- MODEL CITIZEN ---
                "====== MODEL CITIZEN ======": ("*", {"forceInput": True}),
                "ckpt_name": ("STRING", {"forceInput": True}),
                "vae_name": ("STRING", {"forceInput": True}),
                "lora_1_name": ("STRING", {"forceInput": True}),
                "lora_1_strength": ("FLOAT", {"forceInput": True}),
                "lora_2_name": ("STRING", {"forceInput": True}),
                "lora_2_strength": ("FLOAT", {"forceInput": True}),
                "lora_3_name": ("STRING", {"forceInput": True}),
                "lora_3_strength": ("FLOAT", {"forceInput": True}),
                "filter_by_model_type": ("STRING", {"forceInput": True}),
                
                # --- MASTER PROMPT ---
                "====== MASTER PROMPT ======": ("*", {"forceInput": True}),
                "positive": ("STRING", {"forceInput": True}),
                "negative": ("STRING", {"forceInput": True}),
                "clip_l_weight": ("FLOAT", {"forceInput": True}),
                "clip_g_weight": ("FLOAT", {"forceInput": True}),
                "t5_weight": ("FLOAT", {"forceInput": True}),
                "positive_l": ("STRING", {"forceInput": True}),
                "positive_g": ("STRING", {"forceInput": True}),
                "positive_t5": ("STRING", {"forceInput": True}),
                "negative_l": ("STRING", {"forceInput": True}),
                "negative_g": ("STRING", {"forceInput": True}),
                "negative_t5": ("STRING", {"forceInput": True}),
                "flux_guidance": ("FLOAT", {"forceInput": True}),
                "lumina_sysprompt": ("STRING", {"forceInput": True}),
                
                # --- LATENT MAKER ---
                "====== LATENT MAKER ======": ("*", {"forceInput": True}),
                "width": ("INT", {"forceInput": True}),
                "height": ("INT", {"forceInput": True}),
                "batch_size": ("INT", {"forceInput": True}),
                "scale": ("FLOAT", {"forceInput": True}),
                "aspect_ratio": ("STRING", {"forceInput": True}),
                "orientation": ("STRING", {"forceInput": True}),
                
                # --- SHIMA SAMPLER ---
                "====== SHIMA SAMPLER ======": ("*", {"forceInput": True}),
                "s33d": ("INT", {"forceInput": True}),
                "steps": ("INT", {"forceInput": True}),
                "cfg": ("FLOAT", {"forceInput": True}),
                "sampler_name": ("STRING", {"forceInput": True}),
                "scheduler": ("STRING", {"forceInput": True}),
                "denoise": ("FLOAT", {"forceInput": True}),
                "start_at_step": ("INT", {"forceInput": True}),
                "end_at_step": ("INT", {"forceInput": True}),
                "randomize": ("BOOLEAN", {"forceInput": True}),
                "add_noise": ("BOOLEAN", {"forceInput": True}),
                "return_with_leftover_noise": ("BOOLEAN", {"forceInput": True}),
                "vae_decode": ("BOOLEAN", {"forceInput": True}),
                "upscale_enabled": ("BOOLEAN", {"forceInput": True}),
                "upscale_method": ("STRING", {"forceInput": True}),
                "upscale_factor": ("FLOAT", {"forceInput": True}),
                "upscale_denoise": ("FLOAT", {"forceInput": True}),
                "upscale_steps": ("INT", {"forceInput": True}),
                "upscale_cfg": ("FLOAT", {"forceInput": True}),
                
                # --- CONTROL AGENT ---
                "====== CTRL ======": ("*", {"forceInput": True}),
                "control_type": (["canny", "depth", "pose", "lineart", "scribble", "color"], {"forceInput": True}),
                "strength": ("FLOAT", {"forceInput": True}),
                "fit_method": (["crop to fit", "pad to fit", "stretch"], {"forceInput": True}),
                "bypass_preprocessing": ("BOOLEAN", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("BNDL",)
    RETURN_NAMES = ("panelinputs.bndl",)
    FUNCTION = "bundle_inputs"
    CATEGORY = "Shima/Panels"

    def bundle_inputs(self, **kwargs):
        # We strip out the dummy visual separators and None values
        bundle = {"bndl_type": "panelinputs"}
        
        for key, value in kwargs.items():
            if not key.startswith("======") and value is not None:
                bundle[key] = value
                
        # If a shima.commonparams bundle was wired in, extract its contents
        # so they override panel settings accurately
        commonparams = bundle.get("shima.commonparams", {})
        if isinstance(commonparams, dict) and commonparams.get("bndl_type") != "panelinputs":
            if "width" in commonparams:
                bundle["width"] = commonparams["width"]
            if "height" in commonparams:
                bundle["height"] = commonparams["height"]
            if "seed" in commonparams:
                bundle["s33d"] = commonparams["seed"]
            if "timestamp" in commonparams:
                bundle["timestamp"] = commonparams["timestamp"]
            if "collision_id" in commonparams:
                bundle["collision_id"] = commonparams["collision_id"]
            if "model_type_raw" in commonparams:
                # Need the raw type so models resolve presets accurately
                bundle["filter_by_model_type"] = commonparams["model_type_raw"]
                bundle["model_type"] = commonparams["model_type"]
                
        return (bundle,)

NODE_CLASS_MAPPINGS = {
    "Shima.PanelBNDLer": ShimaPanelBNDLer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.PanelBNDLer": "Shima Panel BNDLer",
}
