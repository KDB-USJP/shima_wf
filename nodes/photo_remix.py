import torch
import comfy.sd
import comfy.utils
import nodes
import folder_paths
import math

class ShimaPhotoRemix:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "s33d": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "randomize": ("BOOLEAN", {"default": False}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step":0.1, "round": 0.01}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, ),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, ),
                "denoise": ("FLOAT", {"default": 0.60, "min": 0.0, "max": 1.0, "step": 0.01}),
                "resolution_mode": (["Source", "SDXL Buckets", "SD1.5 Buckets", "Custom"], {"default": "Source"}),
            },
            "optional": {
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "model": ("MODEL",),
                "vae": ("VAE",),
                "shima.commonparams": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Configuration bundle from Shima.Commons (overrides settings)"
                }),
                "use_commonparams": ("BOOLEAN", {"default": True, "tooltip": "If True, use settings from Shima.Commons bundle"}),
                "modelcitizen.bndl": ("BNDL", {
                    "forceInput": True,
                    "tooltip": "Bundle containing Model, CLIP, and VAE (overrides individual inputs)"
                }),
                "masterprompt.bndl": ("BNDL", {
                    "forceInput": True,
                    "tooltip": "Bundle containing Positive and Negative conditioning (overrides individual inputs)"
                }),
                "bucket_width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}), 
                "bucket_height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
                "show_used_values": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Show actual values being used (debug)"
                }),
                "shima.samplercommons": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Sampler settings bundle from Shima.SamplerCommons (overrides sampler settings)"
                }),
            },
            "hidden": {
            }
        }

    RETURN_TYPES = ("IMAGE", "LATENT",)
    RETURN_NAMES = ("image", "latent")
    FUNCTION = "remix"
    CATEGORY = "Shima/Image"

    @classmethod
    def IS_CHANGED(cls, s33d, randomize, **kwargs):
        if randomize:
            import random
            return random.random()
        return s33d

    def remix(self, image, s33d, randomize, steps, cfg, sampler_name, scheduler, denoise, resolution_mode, positive=None, negative=None, model=None, vae=None, bucket_width=1024, bucket_height=1024, use_commonparams=True, **kwargs):
        # Handle dot notation / BNDL / Legacy inputs
        shima_commonparams = kwargs.get("shima.commonparams", None)
        samplercommons = kwargs.get("shima.samplercommons", None)
        modelcitizen = kwargs.get("modelcitizen") or kwargs.get("modelcitizen.bndl") or kwargs.get("modelbundle", None)
        masterprompt = kwargs.get("masterprompt") or kwargs.get("masterprompt.bndl")

        # --- SEED RESOLUTION ---
        active_seed = s33d
        if use_commonparams and shima_commonparams:
            active_seed = shima_commonparams.get("seed", s33d)
        elif randomize:
            import random
            active_seed = random.randint(0, 0xffffffffffffffff)

        if samplercommons:
            steps = samplercommons.get("steps", steps)
            cfg = samplercommons.get("cfg", cfg)
            sampler_name = samplercommons.get("sampler_name", sampler_name)
            scheduler = samplercommons.get("scheduler", scheduler)
            denoise = samplercommons.get("denoise", denoise)
        
        # Priority Logic: Explicit Input > BNDL > Error
        if model is None and modelcitizen:
            model = modelcitizen.get("model")
            
        if vae is None and modelcitizen:
            vae = modelcitizen.get("vae")
            
        if masterprompt:
            if positive is None and masterprompt.get("pos") is not None:
                positive = masterprompt.get("pos")
            if negative is None and masterprompt.get("neg") is not None:
                negative = masterprompt.get("neg")
            
        if model is None:
            raise ValueError("[Shima PhotoRemix] No Model provided! Please connect 'model' input or a 'modelcitizen.bndl'.")
            
        if vae is None:
             raise ValueError("[Shima PhotoRemix] No VAE provided! Please connect 'vae' input or a 'modelcitizen.bndl'.")
             
        if positive is None or negative is None:
            raise ValueError("[Shima PhotoRemix] No Conditioning provided! Please connect positive/negative prompts or a 'masterprompt.bndl'.")

        # 1. Resolution Handling
        # ----------------------
        _, h, w, _ = image.shape
        target_w, target_h = w, h

        if resolution_mode == "Source":
            # Ensure multiple of 8 (standard VAE requirement)
            target_w = (w // 8) * 8
            target_h = (h // 8) * 8
        
        elif resolution_mode == "SDXL Buckets" or resolution_mode == "SD1.5 Buckets":
            # Simple bucketing strategy: Maintain aspect ratio, scale area to target
            # SDXL ~1024*1024 = 1,048,576 pixels
            # SD1.5 ~512*512 = 262,144 pixels
            
            target_area = 1024 * 1024 if resolution_mode == "SDXL Buckets" else 512 * 512
            current_area = w * h
            
            scale_factor = math.sqrt(target_area / current_area)
            target_w = int(w * scale_factor)
            target_h = int(h * scale_factor)
            
            # Snap to multiples of 64 for better compatibility (especially SDXL)
            target_w = round(target_w / 64) * 64
            target_h = round(target_h / 64) * 64
            
        elif resolution_mode == "Custom":
            # Use hidden widgets if populated (passed via frontend logic ideally, or standard params)
            # For now, let's assume if Custom is picked, we might want to respect CommonParams or specific inputs
            # But getting "hidden" inputs from JS is tricky unless they are physically on the node.
            # Simplified: Use Source behavior as fallback or use bucket_width/height if provided validly
            if bucket_width > 0 and bucket_height > 0:
                target_w = bucket_width
                target_h = bucket_height
            else:
                 target_w = (w // 8) * 8
                 target_h = (h // 8) * 8

        # Resize Image if needed
        if target_w != w or target_h != h:
            # Upscale/Downscale using standard comfy method
            # Image is [B, H, W, C]
            # Permute to [B, C, H, W] for interpolation
            s = image.movedim(-1, 1)
            s = comfy.utils.common_upscale(s, target_w, target_h, "bicubic", "center")
            s = s.movedim(1, -1)
            resized_image = s
        else:
            resized_image = image

        # 2. VAE Encode
        # -------------
        # VAE Encode logic (from nodes.py VAEEncode)
        # Pixel -> Latent
        latent = vae.encode(resized_image[:,:,:,:3])
        latent_image = {"samples": latent}

        # 3. Sampling
        # -----------
        # Use common_ksampler logic (available in nodes.py but we can call standard ksampler)
        # We need to calculate start_step from denoise
        
        # Logic from KSampler.sample
        # force_full_denoise = False (standard for img2img usually, but Comfy KSampler handles 'denoise' param mostly in sigmas)
        # Actually, standard KSampler uses standard sampling function which takes denoise.
        
        # 3. Sampling
        # -----------
        # Use direct comfy.samplers logic for maximum control
        
        # 3. Sampling
        # -----------
        # Use nodes.common_ksampler for reliability (handles noise, steps, and updates automatically)
        
        try:
            sampled_ret = nodes.common_ksampler(
                model, 
                active_seed, 
                steps, 
                cfg, 
                sampler_name, 
                scheduler, 
                positive, 
                negative, 
                latent_image, 
                denoise=denoise
            )
            sampled_latent = sampled_ret[0]
            
        except Exception as e:
            print(f"[Shima PhotoRemix] Sampling Error: {e}")
            raise e

        # 4. VAE Decode
        common_decoder = nodes.VAEDecode()
        result_image = common_decoder.decode(vae, sampled_latent)[0]

        # 5. Execution Transparency
        used_values = [
            f"Seed: {active_seed}",
            f"Steps: {steps}",
            f"CFG: {cfg}",
            f"Sampler: {sampler_name}",
            f"Scheduler: {scheduler}",
            f"Denoise: {denoise:.2f}",
            f"Res: {target_w}x{target_h} ({resolution_mode})"
        ]
        
        if use_commonparams and shima_commonparams:
            used_values.insert(0, "Source: CommonParams Sync")
        elif randomize:
            used_values.insert(0, "Source: Local Randomization")
        else:
            used_values.insert(0, "Source: Manual s33d")

        return {"ui": {"used_values": used_values}, "result": (result_image, sampled_latent)}
