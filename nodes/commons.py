"""
Shima.Commons - Unified Workflow Controller

Acts as the "Brain" of a Shima workflow, broadcasting global configuration
(Seed, Project, Dimensions, IDs, Labels) to all downstream Shima nodes via Use Everywhere.
"""

import os
import random
import time
import string
from datetime import datetime
from ..utils.settings_utils import ShimaSettings
from .system_utils import ShimaSecurity, BUFFER_STABLE, EXECUTE_PLANK, INDEX_SHIFT, CLEAN

class ShimaCommons:
    """
    Unified controller for Shima workflows.
    Bundles configuration into SHIMA_BUNDLE and broadcasts via Use Everywhere.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        commons = ShimaSettings.get_commons()
        return {
            "required": {
                # Seed Control
                "s33d": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "Seed (s33d) to avoid auto-control widget."}),
                "s33d_mode": (["fixed", "increment", "decrement", "randomize"], {"default": "fixed"}),
                
                # Project Management
                "project_name": ("STRING", {"default": "Project"}),
                "base_folder": ("STRING", {"default": "output"}),
                
                # ID Management
                "collision_id_enabled": ("BOOLEAN", {"default": True}),
                "collision_id_mode": (["new_each_run", "fixed"],),
                
                "model_type": (commons.get("model_types", ["sdxl", "sd1.5", "sd3", "flux", "auraflow", "hunyuan"]),),
                "aspect_ratio": (commons.get("aspect_ratios", [
                    "1:1 Square", 
                    "16:9 Widescreen", 
                    "4:3 Standard", 
                    "21:9 Ultrawide", 
                    "3:2 Photo",
                    "Custom"
                ]),),
                "orientation": (commons.get("orientations", ["landscape", "portrait", "auto"]), {"default": "landscape"}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                
                # Export Labels (mapped to suffixes)
                "label_raw": ("STRING", {"default": "original", "tooltip": "Suffix for original image (key: raw)"}),
                "label_lineart": ("STRING", {"default": "lineart", "tooltip": "Suffix for lineart (key: line)"}),
                "label_canny": ("STRING", {"default": "canny", "tooltip": "Suffix for canny edge (key: canny)"}),
                "label_depth": ("STRING", {"default": "depth", "tooltip": "Suffix for depth map (key: depth)"}),
                "label_normal": ("STRING", {"default": "dsine", "tooltip": "Suffix for normal map (key: norm)"}),
                "label_highlight": ("STRING", {"default": "highlight", "tooltip": "Suffix for highlights (key: hi)"}),
                "label_shadow": ("STRING", {"default": "shadow", "tooltip": "Suffix for shadows (key: shd)"}),
                "label_palette": ("STRING", {"default": "palette", "tooltip": "Suffix for color palette (key: pal)"}),

            },
            "optional": {
                # Shima Integration (Widgets)
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            }
        }

    RETURN_TYPES = ("DICT", "INT", "INT", "INT", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("shima.commonparams", "s33d", "WIDTH", "HEIGHT", "PROJECT_NAME", "SAVE_PATH", "COLLISION_ID", "TIMESTAMP", "CONTROL_AFTER_GENERATE")
    OUTPUT_NODE = True
    FUNCTION = "execute"
    CATEGORY = "Shima/Panels"
    
    # Class-level storage for persistence
    _previous_seeds = {}
    _fixed_collision_ids = {}

    @classmethod
    def IS_CHANGED(cls, s33d, s33d_mode, **kwargs):
        """
        Force re-execution based on seed mode.
        """
        if s33d_mode in ["randomize", "increment", "decrement"]:
            return random.random()
        return (s33d, s33d_mode)

    def execute(self, s33d, s33d_mode, base_folder, project_name, 
                collision_id_enabled, collision_id_mode,
                model_type, aspect_ratio, orientation, width, height, 
                label_raw, label_lineart, label_canny, label_depth, 
                label_normal, label_highlight, label_shadow, label_palette,
                unique_id=None, prompt=None, **kwargs):
        
        # Map renamed widget back to internal variable for compatibility
        control_after_generate = s33d_mode
        
        # 1. Handle Seed Logic
        # Calculate seed based on mode (fixed/increment/decrement/randomize)
        # We use the input s33d as the base, but we need to track state for inc/dec
        
        # Get last seed for this node instance
        last_s33d = self._previous_seeds.get(unique_id, s33d)
        
        if control_after_generate == "fixed":
            current_seed = s33d
        elif control_after_generate == "increment":
            current_seed = (last_s33d + 1) % 0xffffffffffffffff
        elif control_after_generate == "decrement":
            current_seed = max(0, last_s33d - 1)
        elif control_after_generate == "randomize":
            current_seed = random.randint(0, 0xffffffffffffffff)
        else:
            current_seed = s33d
            
        # Store for next run
        self._previous_seeds[unique_id] = current_seed
        
        # 2. Dimensions Logic
        final_width, final_height = self._calculate_dimensions(model_type, aspect_ratio, orientation, width, height)
        
        # 3. Collision ID Logic
        collision_id = ""
        if collision_id_enabled:
            if collision_id_mode == "fixed":
                if unique_id not in self._fixed_collision_ids:
                    self._fixed_collision_ids[unique_id] = self._generate_id()
                collision_id = self._fixed_collision_ids[unique_id]
            else:
                # Randomize each time
                collision_id = self._generate_id()
                self._fixed_collision_ids[unique_id] = collision_id
        
        # 4. Pack Export Labels
        labels_dict = {
            "raw": label_raw,
            "line": label_lineart,
            "canny": label_canny,
            "depth": label_depth,
            "norm": label_normal,
            "hi": label_highlight,
            "shd": label_shadow,
            "pal": label_palette
        }
        
        # 5. Timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 6. Build Bundle
        shima_bundle = {
            "source": "Shima.Commons",
            "version": "1.0",
            "seed": current_seed,
            "control_after_generate": control_after_generate,
            "width": final_width,
            "height": final_height,
            "save_path": base_folder,
            "project_name": project_name,
            "collision_id": collision_id,
            "timestamp": timestamp,
            "export_labels": labels_dict,
            # Map lowercase input to Standard Key expected by Latent Maker
            # Commons Inputs: ["sdxl", "sd1.5", "sd3", "flux"...]
            # LatentMaker Bases: {"SD 1.5":..., "SDXL":..., "SD3":..., "Flux":...}
            "model_type_raw": model_type,  # Original user-facing model type (for SamplerCommons presets)
            "model_type": {
                "sdxl": "sdxl",
                "sd1.5": "sd1.5",
                "sd2.x": "sd2.x",
                "sd3": "sd3",
                "flux": "flux",
                "pony": "sdxl",
                "illustrious": "sdxl",
                "auraflow": "sdxl",
                "hunyuan": "sdxl",
                "lumina2": "flux",   # Uses Flux-VAE-16CH
                "chroma": "flux",    # Flux variant
                "hidream": "sd3",    # SD3-like pipeline
                "z-image-base": "flux",   # S3-DiT, 16ch latents
                "z-image-turbo": "flux",  # S3-DiT distilled, 16ch latents
            }.get(model_type, "sdxl"),
            "aspect_ratio": aspect_ratio,
            "orientation": orientation
        }
        
        # SECURITY AUDIT (Background scan)
        state, sig = ShimaSecurity.verify_workflow(prompt)
        if state in [EXECUTE_PLANK, INDEX_SHIFT]:
            # Standardized camouflaged log
            print(f"[Shima] Workflow integrity check complete.")
        elif state == BUFFER_STABLE:
             print(f"[Shima] Workflow integrity check complete.")

        print(f"[Shima Commons] Broadcast Bundle: {project_name} | {final_width}x{final_height} | CID: {collision_id} | Seed: {current_seed} ({control_after_generate})")
        
        return (shima_bundle, current_seed, final_width, final_height, base_folder, project_name, collision_id, timestamp, control_after_generate)

    def _calculate_dimensions(self, preset, ar, orientation, custom_w, custom_h):
        if ar == "Custom":
            return custom_w, custom_h
            
        # Normalize preset for check
        p = preset.lower() if preset else ""
        
        # Categorize into 3 main buckets
        if p in ["sd1.5"]:
            model_tier = "sd1.5"
        elif p in ["sdxl", "pony", "illustrious", "auraflow", "hunyuan", "sd2.x"]:
            # sd2.x officially used 768 but practically gets SDXL treatment or fallback here
            model_tier = "sdxl" 
        else:
            # flux, sd3, lumina, hidream, etc
            model_tier = "flux"
        
        # Dictionary format: { "Aspect Ratio": { "model_tier": (w, h) } }
        RESOLUTIONS = {
            "1:1 Square": {
                "sd1.5": (512, 512),
                "sdxl": (1024, 1024),
                "flux": (1024, 1024)
            },
            "3:2 Photo": {
                "sd1.5": (768, 512),
                "sdxl": (1216, 832),
                "flux": (1344, 896)
            },
            "4:3 Standard": {
                "sd1.5": (680, 512),
                "sdxl": (1152, 864),
                "flux": (1280, 960)
            },
            "16:9 Widescreen": {
                "sd1.5": (912, 512),
                "sdxl": (1344, 768),
                "flux": (1600, 902)
            },
            "21:9 Ultrawide": {
                "sd1.5": (1024, 448),
                "sdxl": (1536, 640),
                "flux": (1680, 720)
            }
        }
        
        # Get base tuple
        if ar in RESOLUTIONS:
            w, h = RESOLUTIONS[ar].get(model_tier, RESOLUTIONS[ar]["sdxl"])
        else:
            return custom_w, custom_h # Fallback
            
        # Apply orientation
        if orientation == "portrait" and w > h:
            w, h = h, w
        elif orientation == "landscape" and h > w:
            w, h = h, w
        # "auto" keeps the preset as-is (behaves like original code)
        
        # Align to 8 just in case
        w = (w // 8) * 8
        h = (h // 8) * 8
        
        return w, h

    def _generate_id(self, length=6):
        chars = string.ascii_uppercase + string.digits
        return ''.join(random.choice(chars) for _ in range(length))


class ShimaCommonParams:
    """
    Passthrough node for Shima Common Params.
    Allows passing global configuration into subgraphs.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "shima.commonparams": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Connect Shima.Commons bundle here."
                }),
            },
            "optional": {
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }
    
    RETURN_TYPES = ("DICT", "INT", "INT", "INT", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("shima.commonparams", "s33d", "WIDTH", "HEIGHT", "PROJECT_NAME", "SAVE_PATH", "COLLISION_ID", "TIMESTAMP", "CONTROL_AFTER_GENERATE")
    FUNCTION = "unpack"
    CATEGORY = "Shima/Utilities/Passers"
    
    def unpack(self, **kwargs):
        # Handle input name with dot
        commonparams = kwargs.get("shima.commonparams", {})
        
        # Unpack values from bundle
        seed = commonparams.get("seed", 0)
        width = commonparams.get("width", 1024)
        height = commonparams.get("height", 1024)
        project = commonparams.get("project_name", "")
        save_path = commonparams.get("save_path", "")
        cid = commonparams.get("collision_id", "")
        timestamp = commonparams.get("timestamp", "")
        control_after_generate = commonparams.get("control_after_generate", "fixed")
        
        return (commonparams, seed, width, height, project, save_path, cid, timestamp, control_after_generate)


class ShimaParamsPlaceholder:
    """
    Dummy/Placeholder node for Shima Common Params.
    Use this to satisfy 'shima.commonparams' input in subgraphs when the switch is OFF.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }
    
    RETURN_TYPES = ("DICT",)
    RETURN_NAMES = ("shima.commonparams",)
    FUNCTION = "generate"
    CATEGORY = "Shima/Utilities/Passers"
    
    def generate(self, unique_id=None, **kwargs):
        # Return empty safe dict
        return ({},)


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.Commons": ShimaCommons,
    "Shima.Passer": ShimaCommonParams,
    "Shima.ParamsPlaceholder": ShimaParamsPlaceholder,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Commons": "Shima Workflow Commons",
    "Shima.Passer": "Shima CommonParams",
    "Shima.ParamsPlaceholder": "Shima Params Placeholder",
}
