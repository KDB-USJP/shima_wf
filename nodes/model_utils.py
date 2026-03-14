"""
Shima Model Utilities

Provides checkpoint model type detection for auto-configuring sampler settings.

Detection methods:
1. ComfyUI model config (if available)
2. Tensor shape analysis
3. Filename pattern matching
"""

import os
from typing import Optional, Dict, Tuple
from dataclasses import dataclass

# Import shared ModelType enum
from .lora_utils import ModelType

# Try to import ComfyUI modules
try:
    import comfy.sd
    import comfy.model_management
    HAS_COMFY = True
except ImportError:
    HAS_COMFY = False


# ============================================================================
# Model Settings Configuration
# ============================================================================

@dataclass
class ModelSettings:
    """Recommended settings for a model type."""
    cfg: float
    steps: int
    scheduler: str
    sampler: str
    clip_skip: int = 1
    
    def to_dict(self) -> Dict:
        return {
            "cfg": self.cfg,
            "steps": self.steps,
            "scheduler": self.scheduler,
            "sampler": self.sampler,
            "clip_skip": self.clip_skip,
        }


# Default settings for each model type
MODEL_DEFAULTS: Dict[ModelType, ModelSettings] = {
    ModelType.SD15: ModelSettings(
        cfg=7.0,
        steps=25,
        scheduler="normal",
        sampler="euler_ancestral",
        clip_skip=1,
    ),
    ModelType.SD21: ModelSettings(
        cfg=7.0,
        steps=25,
        scheduler="normal",
        sampler="euler_ancestral",
        clip_skip=1,
    ),
    ModelType.SDXL: ModelSettings(
        cfg=7.0,
        steps=25,
        scheduler="normal",
        sampler="dpmpp_2m",
        clip_skip=2,
    ),
    ModelType.FLUX: ModelSettings(
        cfg=1.0,
        steps=20,
        scheduler="simple",
        sampler="euler",
        clip_skip=1,
    ),
    ModelType.PONY: ModelSettings(
        cfg=7.0,
        steps=25,
        scheduler="normal",
        sampler="euler_ancestral",
        clip_skip=2,
    ),
    ModelType.ILLUSTRIOUS: ModelSettings(
        cfg=5.0,
        steps=28,
        scheduler="normal",
        sampler="euler_ancestral",
        clip_skip=2,
    ),
    ModelType.SVD: ModelSettings(
        cfg=3.0,
        steps=25,
        scheduler="normal",
        sampler="euler",
        clip_skip=1,
    ),
    ModelType.QWEN: ModelSettings(
        cfg=7.0,
        steps=25,
        scheduler="normal",
        sampler="euler",
        clip_skip=1,
    ),
    ModelType.UNKNOWN: ModelSettings(
        cfg=7.0,
        steps=25,
        scheduler="normal",
        sampler="euler_ancestral",
        clip_skip=1,
    ),
}


# ============================================================================
# Model Type Detection
# ============================================================================

def detect_model_type_from_model(model) -> ModelType:
    """
    Detect model type from a loaded ComfyUI model object.
    
    Args:
        model: ComfyUI MODEL object
    
    Returns:
        ModelType enum
    """
    if not HAS_COMFY:
        return ModelType.UNKNOWN
    
    try:
        # Get model config if available
        model_config = getattr(model, "model_config", None)
        if model_config is None and hasattr(model, "model"):
            model_config = getattr(model.model, "model_config", None)
        
        if model_config:
            config_name = type(model_config).__name__.lower()
            
            # Match config class names
            if "flux" in config_name:
                return ModelType.FLUX
            if "sdxl" in config_name or "xl" in config_name:
                return ModelType.SDXL
            if "sd21" in config_name or "sd2" in config_name:
                return ModelType.SD21
            if "svd" in config_name or "video" in config_name:
                return ModelType.SVD
            if "sd15" in config_name or "sd1" in config_name:
                return ModelType.SD15
        
        # Try to detect from model structure
        model_obj = getattr(model, "model", model)
        diffusion_model = getattr(model_obj, "diffusion_model", None)
        
        if diffusion_model:
            # Check for Flux-specific structure
            if hasattr(diffusion_model, "double_blocks"):
                return ModelType.FLUX
            
            # Check channel count for SDXL vs SD1.5
            in_channels = getattr(diffusion_model, "in_channels", 4)
            if in_channels == 4:
                # Could be SD1.5, SDXL, or Pony
                # Check for SDXL by looking at model dimensions
                first_block = None
                if hasattr(diffusion_model, "input_blocks"):
                    first_block = diffusion_model.input_blocks
                elif hasattr(diffusion_model, "down_blocks"):
                    first_block = diffusion_model.down_blocks
                
                if first_block and len(first_block) > 0:
                    # SDXL typically has larger initial channels
                    # This is a heuristic - may need refinement
                    pass
    
    except Exception as e:
        print(f"[Shima] Model detection error: {e}")
    
    return ModelType.UNKNOWN


def detect_model_type_from_path(filepath: str) -> ModelType:
    """
    Detect model type from checkpoint filepath.
    
    Args:
        filepath: Path to checkpoint file
    
    Returns:
        ModelType enum
    """
    filename = os.path.basename(filepath).lower()
    path_lower = filepath.lower()
    
    # Check filename patterns
    patterns = [
        (["flux", "schnell"], ModelType.FLUX),
        (["pony", "pdxl"], ModelType.PONY),
        (["illustrious", "ilxl", "noobai", "noob"], ModelType.ILLUSTRIOUS),
        (["sdxl", "_xl_", "_xl.", "xl-"], ModelType.SDXL),
        (["sd21", "sd_2.1", "sd-2.1", "2.1"], ModelType.SD21),
        (["svd", "stable_video"], ModelType.SVD),
        (["qwen"], ModelType.QWEN),
        (["sd15", "sd_1.5", "sd-1.5", "1.5"], ModelType.SD15),
    ]
    
    for keywords, model_type in patterns:
        if any(kw in filename or kw in path_lower for kw in keywords):
            return model_type
    
    # Check folder structure
    from pathlib import Path
    path_parts = Path(filepath).parts
    for part in reversed(path_parts[:-1]):
        part_lower = part.lower()
        for keywords, model_type in patterns:
            if any(kw in part_lower for kw in keywords):
                return model_type
    
    return ModelType.UNKNOWN


def get_model_settings(model_type: ModelType) -> ModelSettings:
    """Get recommended settings for a model type."""
    return MODEL_DEFAULTS.get(model_type, MODEL_DEFAULTS[ModelType.UNKNOWN])


# ============================================================================
# Sampler and Scheduler Lists
# ============================================================================

# Common samplers available in ComfyUI
SAMPLERS = [
    "euler",
    "euler_ancestral",
    "heun",
    "heunpp2",
    "dpm_2",
    "dpm_2_ancestral",
    "lms",
    "dpm_fast",
    "dpm_adaptive",
    "dpmpp_2s_ancestral",
    "dpmpp_sde",
    "dpmpp_sde_gpu",
    "dpmpp_2m",
    "dpmpp_2m_sde",
    "dpmpp_2m_sde_gpu",
    "dpmpp_3m_sde",
    "dpmpp_3m_sde_gpu",
    "ddpm",
    "lcm",
    "ipndm",
    "ipndm_v",
    "deis",
    "uni_pc",
    "uni_pc_bh2",
]

# Common schedulers
SCHEDULERS = [
    "normal",
    "karras",
    "exponential",
    "sgm_uniform",
    "simple",
    "ddim_uniform",
    "beta",
]
