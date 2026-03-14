"""
Shima.SamplerCommons - Model-Aware Sampler Preset System

Broadcasts recommended sampler settings (steps, cfg, sampler_name, scheduler, denoise)
based on model_type from CommonParams. Connected Shima.Sampler nodes can consume
the bundle via a use_samplercommons toggle.
"""

import comfy.samplers


# =============================================================================
# Industry-standard sampler presets per model type
# =============================================================================
MODEL_SAMPLER_PRESETS = {
    "sd1.5":          {"steps": 20, "cfg": 7.0,  "sampler_name": "euler",           "scheduler": "normal",      "denoise": 1.0},
    "sd2.x":          {"steps": 20, "cfg": 7.0,  "sampler_name": "euler",           "scheduler": "normal",      "denoise": 1.0},
    "sdxl":           {"steps": 20, "cfg": 7.0,  "sampler_name": "euler",           "scheduler": "normal",      "denoise": 1.0},
    "pony":           {"steps": 25, "cfg": 7.0,  "sampler_name": "euler_ancestral", "scheduler": "normal",      "denoise": 1.0},
    "illustrious":    {"steps": 25, "cfg": 7.0,  "sampler_name": "euler_ancestral", "scheduler": "normal",      "denoise": 1.0},
    "sd3":            {"steps": 28, "cfg": 4.0,  "sampler_name": "euler",           "scheduler": "sgm_uniform", "denoise": 1.0},
    "flux":           {"steps": 20, "cfg": 1.0,  "sampler_name": "euler",           "scheduler": "simple",      "denoise": 1.0},
    "chroma":         {"steps": 20, "cfg": 1.0,  "sampler_name": "euler",           "scheduler": "simple",      "denoise": 1.0},
    "auraflow":       {"steps": 25, "cfg": 3.5,  "sampler_name": "euler",           "scheduler": "normal",      "denoise": 1.0},
    "hunyuan":        {"steps": 25, "cfg": 6.0,  "sampler_name": "euler",           "scheduler": "normal",      "denoise": 1.0},
    "lumina2":        {"steps": 30, "cfg": 4.0,  "sampler_name": "euler",           "scheduler": "normal",      "denoise": 1.0},
    "hidream":        {"steps": 28, "cfg": 5.0,  "sampler_name": "euler",           "scheduler": "sgm_uniform", "denoise": 1.0},
    "z-image-base":   {"steps": 30, "cfg": 4.5,  "sampler_name": "euler",           "scheduler": "simple",      "denoise": 1.0},
    "z-image-turbo":  {"steps": 8,  "cfg": 1.0,  "sampler_name": "euler",           "scheduler": "simple",      "denoise": 1.0},
}

DEFAULT_PRESET = {"steps": 20, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}


class ShimaSamplerCommons:
    """
    Model-aware sampler preset broadcaster.
    
    When use_commonparams is ON and a CommonParams bundle is connected,
    automatically fills sampler settings with industry-standard presets
    based on model_type. Outputs a shima.samplercommons dict bundle
    that Shima.Sampler nodes can consume.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Sampler settings (user can tweak; overridden by presets when commonparams is active)
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000, "tooltip": "Number of sampling steps"}),
                "cfg": ("FLOAT", {"default": 7.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "Classifier-Free Guidance scale"}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "Sampling algorithm"}),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, {"tooltip": "Noise scheduler"}),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01, "tooltip": "Denoise strength (1.0 for txt2img)"}),
            },
            "optional": {
                # Shima Integration
                "shima.commonparams": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Configuration bundle from Shima.Commons (provides model_type for auto-presets)"
                }),
                "use_commonparams": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "If True, auto-fill sampler settings from model_type presets"
                }),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
                "show_used_values": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Show actual values being used (debug)"
                }),
            }
        }

    RETURN_TYPES = ("DICT", "INT", "FLOAT", "STRING", "STRING", "FLOAT")
    RETURN_NAMES = ("shima.samplercommons", "steps", "cfg", "sampler_name", "scheduler", "denoise")
    OUTPUT_TOOLTIPS = (
        "Sampler settings bundle for Shima.Sampler",
        "Number of sampling steps",
        "CFG scale",
        "Sampler algorithm name",
        "Scheduler name",
        "Denoise strength",
    )
    OUTPUT_NODE = True
    FUNCTION = "execute"
    CATEGORY = "Shima/Sampling"
    DESCRIPTION = "Model-aware sampler presets. Auto-configures steps, cfg, sampler, scheduler, and denoise based on model type."

    def execute(self, steps, cfg, sampler_name, scheduler, denoise, **kwargs):
        import json
        # Handle dot notation input
        shima_commonparams = kwargs.get("shima.commonparams", None)
        use_commonparams = kwargs.get("use_commonparams", False)

        # Determine model_type (for display and JS preset sync)
        model_type = "unknown"
        if use_commonparams and shima_commonparams:
            model_type = shima_commonparams.get("model_type_raw",
                         shima_commonparams.get("model_type", "sdxl")).lower()

        # ALWAYS use widget values — JS handles updating them to presets
        # when model_type changes. User tweaks are respected.
        source = f"Widget ({model_type})" if model_type != "unknown" else "Widget"

        # Build output bundle from widget values
        sampler_bundle = {
            "source": "Shima.SamplerCommons",
            "model_type": model_type,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": sampler_name,
            "scheduler": scheduler,
            "denoise": denoise,
        }

        # Used values for UI display
        used_values_text = [
            f"Source: {source}",
            f"Steps: {steps}",
            f"CFG: {cfg}",
            f"Sampler: {sampler_name}",
            f"Scheduler: {scheduler}",
            f"Denoise: {denoise}",
        ]

        # Send preset in UI for JS to apply on model_type change
        preset = MODEL_SAMPLER_PRESETS.get(model_type, None)
        preset_json = json.dumps(preset) if preset else ""

        print(f"[SamplerCommons] {source} | Steps:{steps} CFG:{cfg} Sampler:{sampler_name} Sched:{scheduler} Denoise:{denoise}")

        return {
            "ui": {
                "used_values": used_values_text,
                "model_type": [model_type],
                "preset": [preset_json],
            },
            "result": (sampler_bundle, steps, cfg, sampler_name, scheduler, denoise)
        }


class ShimaSamplerCommonsPasser:
    """
    Passthrough/Unpacker node for Shima Sampler Commons.
    Allows splitting the samplercommons bundle into individual outputs.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "shima.samplercommons": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Connect Shima.SamplerCommons bundle here."
                }),
            },
            "optional": {
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }

    RETURN_TYPES = ("DICT", "INT", "FLOAT", "STRING", "STRING", "FLOAT")
    RETURN_NAMES = ("shima.samplercommons", "steps", "cfg", "sampler_name", "scheduler", "denoise")
    FUNCTION = "unpack"
    CATEGORY = "Shima/Utilities/Passers"

    def unpack(self, **kwargs):
        bundle = kwargs.get("shima.samplercommons", {})

        steps = bundle.get("steps", 20)
        cfg = bundle.get("cfg", 7.0)
        sampler_name = bundle.get("sampler_name", "euler")
        scheduler = bundle.get("scheduler", "normal")
        denoise = bundle.get("denoise", 1.0)

        return (bundle, steps, cfg, sampler_name, scheduler, denoise)


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.SamplerCommons": ShimaSamplerCommons,
    "Shima.SamplerCommonsPasser": ShimaSamplerCommonsPasser,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.SamplerCommons": "Shima Sampler Commons",
    "Shima.SamplerCommonsPasser": "Shima Sampler Commons Passer",
}
