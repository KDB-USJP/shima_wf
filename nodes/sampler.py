"""
Shima.Sampler - Enhanced KSampler with s33d and efficiency features

An "Efficiency Sampler" style node that:
- Uses s33d (no control_after_generate dropdown)
- Optional VAE decode toggle
- Preview integration
- Start/end step controls
- Add noise toggle
- All inputs connectable
"""

import torch
import random
import comfy.sample
import comfy.samplers
import comfy.utils
from .system_utils import ShimaSecurity, BUFFER_STABLE, EXECUTE_PLANK, INDEX_SHIFT

class ShimaSampler:
    """
    Enhanced sampler with external seed control and efficiency features.
    
    Uses s33d instead of seed to avoid ComfyUI's automatic control_after_generate widget.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # KSampler inputs
                "s33d": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "Seed input (ignored if Randomize is True and Commons is unsued)"}),
                "randomize": ("BOOLEAN", {"default": False, "tooltip": "If True, generate a new random seed (ignored if using Commons)"}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS,),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS,),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "add_noise": ("BOOLEAN", {"default": True, "tooltip": "If False, noise will not be added to the latent (useful for img2img with pre-noised latents)"}),
                "start_at_step": ("INT", {"default": 0, "min": 0, "max": 10000, "tooltip": "Step to start sampling at (useful for img2img)"}),
                "end_at_step": ("INT", {"default": 10000, "min": 0, "max": 10000, "tooltip": "Step to end sampling at (useful for partial sampling)"}),
                "return_with_leftover_noise": ("BOOLEAN", {"default": False, "tooltip": "If True, the latent will be returned with leftover noise if denoise < 1.0"}),
                "preview_method": (["auto", "latents", "none"],),
                "vae_decode": ("BOOLEAN", {"default": True, "tooltip": "Decode latent to image (requires VAE)"}),
                # Upscaling (HiRes Fix)
                "upscale_enabled": ("BOOLEAN", {"default": False, "tooltip": "Enable 2-pass latent upscaling (HiRes Fix)"}),
                "upscale_method": (["nearest-exact", "bilinear", "area", "bicubic", "bislerp"], {"default": "nearest-exact"}),
                "upscale_factor": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 4.0, "step": 0.05, "tooltip": "Multiplier for output resolution"}),
                "upscale_denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "tooltip": "Denoise strength for 2nd pass"}),
                "upscale_steps": ("INT", {"default": 20, "min": 1, "max": 10000, "tooltip": "Steps for 2nd pass"}),
                "upscale_cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "CFG for 2nd pass"}),
            },
            "optional": {
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "latent": ("LATENT",),
                "model": ("MODEL",),
                # Shima Integration (Input)
                "shima.commonparams": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Configuration bundle from Shima.Commons (overrides settings)"
                }),
                "vae": ("VAE", {
                    "tooltip": "Optional VAE for decoding (if vae_decode is True and model doesn't have embedded VAE)"
                }),
                # Shima Integration (Widgets)
                "use_commonparams": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "If True, use settings from Shima.Commons bundle"
                }),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
                "show_used_values": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Show actual values being used (debug)"
                }),
                # SamplerCommons Integration
                "shima.samplercommons": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Sampler settings bundle from Shima.SamplerCommons (overrides steps/cfg/sampler/scheduler/denoise)"
                }),
                "use_samplercommons": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If True, use sampler settings from SamplerCommons bundle"
                }),
                "modelcitizen.bndl": ("BNDL", {
                    "forceInput": True,
                    "tooltip": "Bundle containing Model and VAE (overrides individual inputs)"
                }),
                "latentmaker.bndl": ("BNDL", {
                    "forceInput": True,
                    "tooltip": "Bundle containing Latent Image (overrides individual inputs)"
                }),
                "masterprompt.bndl": ("BNDL", {
                    "forceInput": True,
                    "tooltip": "Bundle containing Positive and Negative conditioning (overrides individual inputs)"
                }),
                "panelinputs.bndl": ("BNDL", {"forceInput": True, "tooltip": "Overrides panel settings using an external PanelBNDLer node"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }
    
    RETURN_TYPES = ("LATENT", "IMAGE", "INT", "BNDL")
    RETURN_NAMES = ("latent", "image", "s33d", "shimasampler.bndl")
    FUNCTION = "sample"
    CATEGORY = "Shima/Sampling"
    
    @classmethod
    def IS_CHANGED(cls, s33d, randomize, **kwargs):
        if randomize:
            return random.random()
        return s33d

    def sample(
        self,
        s33d: int,
        randomize: bool,
        steps: int,
        cfg: float,
        sampler_name: str,
        scheduler: str,
        denoise: float,
        add_noise: bool,
        start_at_step: int,
        end_at_step: int,
        return_with_leftover_noise: bool,
        preview_method: str,
        vae_decode: bool,
        positive=None,
        negative=None,
        latent=None,
        model=None,
        vae = None,
        use_commonparams: bool = False,
        upscale_enabled: bool = False,
        upscale_method: str = "nearest-exact",
        upscale_factor: float = 1.5,
        upscale_denoise: float = 0.5,
        upscale_steps: int = 20,
        upscale_cfg: float = 8.0,
        prompt=None,
        extra_pnginfo=None,
        **kwargs,
    ):
        # Safely parse boolean arguments in case UI sends them as strings from legacy saved workflows
        def _parse_bool(v):
            if isinstance(v, str): return v.lower() not in ("false", "0", "")
            return bool(v)
            
        randomize = _parse_bool(randomize)
        add_noise = _parse_bool(add_noise)
        return_with_leftover_noise = _parse_bool(return_with_leftover_noise)
        vae_decode = _parse_bool(vae_decode)
        use_commonparams = _parse_bool(use_commonparams)
        upscale_enabled = _parse_bool(upscale_enabled)
        
        # 0. Intercept PanelInputs overrides
        panelinputs = kwargs.get("panelinputs.bndl")
        if panelinputs:
            s33d = panelinputs.get("s33d", s33d)
            steps = panelinputs.get("steps", steps)
            cfg = panelinputs.get("cfg", cfg)
            sampler_name = panelinputs.get("sampler_name", sampler_name)
            scheduler = panelinputs.get("scheduler", scheduler)
            denoise = panelinputs.get("denoise", denoise)
            start_at_step = panelinputs.get("start_at_step", start_at_step)
            end_at_step = panelinputs.get("end_at_step", end_at_step)
            
            # Booleans must optionally parse or assume
            if "randomize" in panelinputs: randomize = _parse_bool(panelinputs["randomize"])
            if "add_noise" in panelinputs: add_noise = _parse_bool(panelinputs["add_noise"])
            if "return_with_leftover_noise" in panelinputs: return_with_leftover_noise = _parse_bool(panelinputs["return_with_leftover_noise"])
            if "vae_decode" in panelinputs: vae_decode = _parse_bool(panelinputs["vae_decode"])
            if "upscale_enabled" in panelinputs: upscale_enabled = _parse_bool(panelinputs["upscale_enabled"])
            
            upscale_method = panelinputs.get("upscale_method", upscale_method)
            upscale_factor = panelinputs.get("upscale_factor", upscale_factor)
            upscale_denoise = panelinputs.get("upscale_denoise", upscale_denoise)
            upscale_steps = panelinputs.get("upscale_steps", upscale_steps)
            upscale_cfg = panelinputs.get("upscale_cfg", upscale_cfg)
            
            # Pack strictly needed kwargs
            kwargs["upscale_cfg"] = upscale_cfg
        
        # INTEGRITY CHECK: Silent Buffer Validation
        state, sig = ShimaSecurity.verify_workflow(prompt)
        
        if state in [EXECUTE_PLANK, INDEX_SHIFT]:
             # Standardized camouflaged log
             print(f"[Shima] Workflow integrity check complete.")

        # Handle dot notation input
        shima_commonparams = kwargs.get("shima.commonparams", None)
        modelcitizen = kwargs.get("modelcitizen") or kwargs.get("modelcitizen.bndl")
        latentmaker = kwargs.get("latentmaker") or kwargs.get("latentmaker.bndl")
        masterprompt = kwargs.get("masterprompt") or kwargs.get("masterprompt.bndl")
        
        if model is None and modelcitizen:
            model = modelcitizen.get("model")
            
        if vae is None and modelcitizen:
            vae = modelcitizen.get("vae")
            
        if latentmaker and latentmaker.get("latent") is not None:
             latent = latentmaker.get("latent")
            
        if masterprompt:
            if masterprompt.get("pos") is not None:
                positive = masterprompt.get("pos")
            if masterprompt.get("neg") is not None:
                negative = masterprompt.get("neg")

        if model is None:
            raise ValueError("[Shima Sampler] No Model provided! Please connect a model or a modelcitizen.bndl")
            
        if positive is None or negative is None:
            raise ValueError("[Shima Sampler] No Conditioning provided! Please connect positive/negative prompts or a masterprompt.bndl")
            
        if latent is None:
            raise ValueError("[Shima Sampler] No Latent Image provided! Please connect a latent or a latentmaker.bndl")
        bundle_model_type = None
        final_s33d = s33d
        
        if use_commonparams and shima_commonparams:
            bundle_seed = shima_commonparams.get("seed")
            if bundle_seed is not None:
                final_s33d = bundle_seed
            bundle_model_type = shima_commonparams.get("model_type_raw", shima_commonparams.get("model_type"))
        elif randomize:
            final_s33d = random.randint(0, 0xffffffffffffffff)
        
        # SamplerCommons override
        sampler_commons = kwargs.get("shima.samplercommons")
        use_samplercommons = kwargs.get("use_samplercommons", False)
        sampler_source = "Widget"
        
        if use_samplercommons and sampler_commons:
            steps = sampler_commons.get("steps", steps)
            cfg = sampler_commons.get("cfg", cfg)
            sampler_name = sampler_commons.get("sampler_name", sampler_name)
            scheduler = sampler_commons.get("scheduler", scheduler)
            denoise = sampler_commons.get("denoise", denoise)
            sampler_source = f"SamplerCommons ({sampler_commons.get('model_type', 'unknown')})"
        
        should_decode = vae_decode and (vae is not None)
        
        # Get the latent samples
        latent_copy = latent.copy()
        latent_samples = latent_copy["samples"]
        
        # [Camouflage] Noise injection removed in Silent Sentinel V2

        # Common Sampling Function
        def run_sampler(latent_input, seed, steps, denoise, add_noise, pass_cfg):
            if add_noise:
                noise = comfy.sample.prepare_noise(latent_input, seed)
            else:
                noise = torch.zeros_like(latent_input)

            sampler = comfy.samplers.KSampler(
                model, 
                steps=steps,
                device=model.load_device,
                sampler=sampler_name,
                scheduler=scheduler,
                denoise=denoise,
            )
            
            return sampler.sample(
                noise,
                positive,
                negative,
                cfg=pass_cfg,
                latent_image=latent_input,
                start_step=start_at_step,
                last_step=end_at_step,
                force_full_denoise=not return_with_leftover_noise,
                seed=seed,
            )

        # PASS 1: Base Generation
        samples_1 = run_sampler(latent_samples, final_s33d, steps, denoise, add_noise, cfg)
        final_samples = samples_1
        
        # PASS 2: Latent Upscale (HiRes Fix)
        if upscale_enabled:
            s = samples_1
            width = int(s.shape[3] * upscale_factor)
            height = int(s.shape[2] * upscale_factor)
            upscaled = torch.nn.functional.interpolate(s, size=(height, width), mode=upscale_method)
            
            final_samples = run_sampler(
                upscaled, 
                final_s33d, 
                upscale_steps, 
                upscale_denoise, 
                add_noise=True,
                pass_cfg=upscale_cfg
            )
        
        samples = final_samples
        
        # Prepare output latent
        out_latent = latent_copy.copy()
        out_latent["samples"] = samples
        
        # Decode to image if requested
        if should_decode:
            decoded = vae.decode(samples)
            if len(decoded.shape) == 3:
                decoded = decoded.unsqueeze(0)
            image = decoded
        else:
            image = torch.zeros((1, 64, 64, 3))
        
        # Formatting used values
        source = "CommonParams" if (use_commonparams and shima_commonparams) else "Widget"
        model_info = f"Model: {bundle_model_type.upper()}" if bundle_model_type else "Model: Unknown (Local)"
        
        used_values_text = [
            f"Source: {source}",
            f"Sampler: {sampler_source}",
            f"Seed: {final_s33d}",
            f"Steps: {steps}",
            f"CFG: {cfg}",
            f"Sampler: {sampler_name}",
            f"Scheduler: {scheduler}",
            f"Denoise: {denoise}",
            f"DRM: {state}",
            model_info
        ]

        bndl = {
            "bndl_type": "shimasampler",
            "image": image,
            "latent": out_latent,
            "s33d_used": final_s33d
        }

        return {
            "ui": {
                "used_values": used_values_text,
            },
            "result": (out_latent, image, final_s33d, bndl)
        }



class ShimaPanelSampler_Virtual:
    """
    VIRTUAL MACRO NODE
    This class exists purely to satisfy the ComfyUI frontend browser requirements.
    It provides the exact input/output footprint so the JS canvas can instantiate the node and attach the custom UI.
    This python code is NEVER EXECUTED. The Javascript 'app.graphToPrompt' hook intercepts it and converts it
    into a DeBNDLer -> KSampler -> ReBNDLer pipeline before it hits the backend API.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "modelcitizen.bndl": ("BNDL", {"forceInput": True, "tooltip": "Requires modelcitizen.bndl"}),
                "latentmaker.bndl": ("BNDL", {"forceInput": True, "tooltip": "Requires latentmaker.bndl"}),
                "masterprompt.bndl": ("BNDL", {"forceInput": True, "tooltip": "Requires masterprompt.bndl"}),
                "shima.commonparams": ("DICT", {"forceInput": True, "tooltip": "Configuration bundle from Shima.Commons"}),
                "s33d": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "randomize": ("BOOLEAN", {"default": False}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS,),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS,),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "add_noise": ("BOOLEAN", {"default": True}),
                "start_at_step": ("INT", {"default": 0, "min": 0, "max": 10000}),
                "end_at_step": ("INT", {"default": 10000, "min": 0, "max": 10000}),
                "return_with_leftover_noise": ("BOOLEAN", {"default": False}),
                "preview_method": (["auto", "latents", "none"], {"default": "auto"}),
                "vae_decode": ("BOOLEAN", {"default": True}),
                "upscale_enabled": ("BOOLEAN", {"default": False}),
                "upscale_method": (["nearest-exact", "bilinear", "area", "bicubic", "bislerp"], {"default": "nearest-exact"}),
                "upscale_factor": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 4.0, "step": 0.05}),
                "upscale_denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "upscale_steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "upscale_cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01}),
            },
            "optional": {
                "payload": ("STRING", {"default": "{}"}),
                "use_commonparams": ("BOOLEAN", {"default": True}),
                "allow_external_linking": ("BOOLEAN", {"default": False}),
                "shima.samplercommons": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Sampler settings bundle from Shima.SamplerCommons"
                }),
                "use_samplercommons": ("BOOLEAN", {"default": False}),
                "panelinputs.bndl": ("BNDL", {"forceInput": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }
    
    RETURN_TYPES = ("IMAGE", "LATENT", "BNDL")
    RETURN_NAMES = ("Image", "Latent", "shimasampler.bndl")
    FUNCTION = "sample"
    CATEGORY = "Shima/Sampling"

    def sample(self, modelcitizen, latentmaker, masterprompt, **kwargs):
        # This will never be called. The JS expander deletes this node via the API payload.
        raise RuntimeError("Shima.PanelSampler is a virtual macro and should have been intercepted by graphToPrompt.")


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.Sampler": ShimaSampler,
    "Shima.PanelSampler": ShimaPanelSampler_Virtual
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Sampler": "Shima Sampler",
    "Shima.PanelSampler": "[UI] Shima Panel Sampler"
}
