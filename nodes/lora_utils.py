"""
Shima LoRA Utilities

Provides LoRA metadata reading and model type detection for filtering LoRAs
by compatible base model.

Detection methods (priority order):
1. Safetensors metadata (ss_base_model, modelspec.architecture)
2. Filename patterns (sd15, sdxl, flux, etc.)
3. Folder structure (loras/SDXL/my_lora.safetensors)
"""

import os
import json
import re
from pathlib import Path
from enum import Enum
from typing import Optional, Dict, List, Tuple
from functools import lru_cache

# Try to import folder_paths for ComfyUI
try:
    import folder_paths
    HAS_FOLDER_PATHS = True
except ImportError:
    HAS_FOLDER_PATHS = False


class ModelType(Enum):
    """Supported base model types for LoRA filtering."""
    UNKNOWN = "unknown"
    SD15 = "sd15"
    SD21 = "sd21"
    SDXL = "sdxl"
    FLUX = "flux"
    PONY = "pony"
    ILLUSTRIOUS = "illustrious"
    SVD = "svd"
    QWEN = "qwen"
    
    @classmethod
    def from_string(cls, s: str) -> "ModelType":
        """Convert string to ModelType, with fuzzy matching."""
        s_lower = s.lower().strip()
        
        # Direct matches
        for mt in cls:
            if mt.value == s_lower:
                return mt
        
        # Fuzzy matches
        if any(x in s_lower for x in ["sd1.5", "sd15", "sd_1.5", "1.5"]):
            return cls.SD15
        if any(x in s_lower for x in ["sd2.1", "sd21", "sd_2.1", "2.1"]):
            return cls.SD21
        if any(x in s_lower for x in ["sdxl", "xl_", "_xl", "sd_xl"]):
            return cls.SDXL
        if any(x in s_lower for x in ["flux", "schnell", "dev"]):
            return cls.FLUX
        if any(x in s_lower for x in ["pony", "pdxl"]):
            return cls.PONY
        if any(x in s_lower for x in ["illustrious", "ilxl", "noobai", "noob"]):
            return cls.ILLUSTRIOUS
        if any(x in s_lower for x in ["svd", "stable_video", "video_diffusion"]):
            return cls.SVD
        if any(x in s_lower for x in ["qwen", "qw"]):
            return cls.QWEN
        
        return cls.UNKNOWN


# ============================================================================
# Safetensors Header Reading
# ============================================================================

def read_safetensors_header(filepath: str) -> Optional[Dict]:
    """
    Read the JSON header from a safetensors file without loading tensors.
    
    Returns:
        Dict with header metadata, or None if failed
    """
    try:
        with open(filepath, "rb") as f:
            # First 8 bytes are the header length (little-endian uint64)
            header_len_bytes = f.read(8)
            if len(header_len_bytes) < 8:
                return None
            
            header_len = int.from_bytes(header_len_bytes, "little")
            
            # Sanity check - header shouldn't be larger than 100MB
            if header_len > 100 * 1024 * 1024:
                return None
            
            header_bytes = f.read(header_len)
            header = json.loads(header_bytes.decode("utf-8"))
            
            return header
    except Exception as e:
        print(f"[Shima] Failed to read safetensors header: {e}")
        return None


def get_lora_metadata(filepath: str) -> Dict:
    """
    Extract LoRA metadata from safetensors header.
    
    Returns dict with:
        - base_model: ModelType enum
        - base_model_source: "metadata", "filename", "folder", or "unknown"
        - raw_metadata: original metadata dict
    """
    result = {
        "base_model": ModelType.UNKNOWN,
        "base_model_source": "unknown",
        "raw_metadata": {},
        "filepath": filepath,
        "filename": os.path.basename(filepath),
    }
    
    # Method 1: Safetensors metadata
    header = read_safetensors_header(filepath)
    if header:
        # Look for __metadata__ key (Kohya/A1111 format)
        metadata = header.get("__metadata__", {})
        result["raw_metadata"] = metadata
        
        # Check various metadata keys
        base_model_keys = [
            "ss_base_model",
            "ss_base_model_version", 
            "modelspec.architecture",
            "base_model",
            "base_model_type",
        ]
        
        for key in base_model_keys:
            if key in metadata:
                detected = ModelType.from_string(str(metadata[key]))
                if detected != ModelType.UNKNOWN:
                    result["base_model"] = detected
                    result["base_model_source"] = "metadata"
                    return result
    
    # Method 2: Filename patterns
    filename = os.path.basename(filepath).lower()
    detected = ModelType.from_string(filename)
    if detected != ModelType.UNKNOWN:
        result["base_model"] = detected
        result["base_model_source"] = "filename"
        return result
    
    # Method 3: Folder structure
    # Check parent folders for model type hints
    path_parts = Path(filepath).parts
    for part in reversed(path_parts[:-1]):  # Skip filename
        detected = ModelType.from_string(part)
        if detected != ModelType.UNKNOWN:
            result["base_model"] = detected
            result["base_model_source"] = "folder"
            return result
    
    return result


# ============================================================================
# LoRA Discovery and Caching
# ============================================================================

@lru_cache(maxsize=1)
def get_loras_dir() -> str:
    """Get the LoRAs directory path."""
    if HAS_FOLDER_PATHS:
        return folder_paths.get_folder_paths("loras")[0]
    return os.path.join(os.getcwd(), "models", "loras")


def discover_loras() -> List[Dict]:
    """
    Discover all LoRA files and their metadata.
    
    Returns list of dicts with:
        - filepath: absolute path
        - filename: basename
        - relative_path: path relative to loras folder
        - base_model: ModelType
        - base_model_source: detection method
    """
    loras_dir = get_loras_dir()
    if not os.path.isdir(loras_dir):
        return []
    
    loras = []
    for root, dirs, files in os.walk(loras_dir):
        for file in files:
            if file.endswith((".safetensors", ".ckpt", ".pt")):
                filepath = os.path.join(root, file)
                relative_path = os.path.relpath(filepath, loras_dir)
                
                metadata = get_lora_metadata(filepath)
                metadata["relative_path"] = relative_path
                loras.append(metadata)
    
    return loras


def get_loras_by_model_type(model_type: ModelType) -> List[str]:
    """
    Get list of LoRA relative paths compatible with given model type.
    
    Args:
        model_type: ModelType to filter by
    
    Returns:
        List of relative paths (for ComfyUI dropdown)
    """
    all_loras = discover_loras()
    
    compatible = []
    unknown = []
    
    for lora in all_loras:
        if lora["base_model"] == model_type:
            compatible.append(lora["relative_path"])
        elif lora["base_model"] == ModelType.UNKNOWN:
            unknown.append(lora["relative_path"])
    
    # Sort alphabetically
    compatible.sort()
    unknown.sort()
    
    # Return compatible first, then unknown (user might want to try them)
    return compatible + unknown


def get_all_lora_paths() -> List[str]:
    """Get all LoRA relative paths for dropdown."""
    all_loras = discover_loras()
    paths = [l["relative_path"] for l in all_loras]
    paths.sort()
    return paths


# ============================================================================
# Model Type Display Names
# ============================================================================

MODEL_TYPE_DISPLAY = {
    ModelType.UNKNOWN: "Unknown",
    ModelType.SD15: "SD 1.5",
    ModelType.SD21: "SD 2.1",
    ModelType.SDXL: "SDXL",
    ModelType.FLUX: "Flux",
    ModelType.PONY: "Pony",
    ModelType.ILLUSTRIOUS: "Illustrious/NoobAI",
    ModelType.SVD: "SVD",
    ModelType.QWEN: "Qwen",
}

MODEL_TYPE_LIST = [mt.value for mt in ModelType if mt != ModelType.UNKNOWN]
