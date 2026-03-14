"""
Shima.CarouselPreview - Multi-group image preview with navigation

Displays groups of images (from MultiSaver) with carousel navigation.
Each group contains all output types for one batch item.
"""

import os
import re
import json
from pathlib import Path
from typing import Dict, List, Tuple

import torch
import numpy as np
from PIL import Image

# Try to import ComfyUI dependencies
try:
    import folder_paths
    HAS_COMFY = True
except ImportError:
    HAS_COMFY = False


class ShimaCarouselPreview:
    """
    Carousel preview for browsing multiple groups of images.
    
    Parses paths from MultiSaver and groups them by batch index,
    allowing navigation between batches.
    """
    
    # Class storage for preview state
    _preview_state = {}
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "saved_paths": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Comma-separated paths from MultiSaver saved_paths output"
                }),
            },
            "optional": {
                "images": ("IMAGE", {
                    "tooltip": "Optional direct image input for preview"
                }),
                
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("group_info",)
    OUTPUT_TOOLTIPS = ("Information about current group",)
    
    FUNCTION = "preview"
    CATEGORY = "Shima/Image"
    OUTPUT_NODE = True
    
    DESCRIPTION = "Carousel preview for browsing multiple groups of images from MultiSaver. Navigate between batch groups with prev/next buttons."
    
    def preview(
        self,
        saved_paths: str,
        images=None,
        unique_id=None,
        **kwargs,
    ):
        # Try parsing as JSON (new MultiSaver format)
        groups = {}
        paths = []
        is_json = False
        
        if saved_paths and saved_paths.strip().startswith("{"):
            try:
                data = json.loads(saved_paths)
                if isinstance(data, dict) and data.get("type") == "shima_v1":
                    groups = data.get("groups", {})
                    paths = data.get("all_paths", [])
                    is_json = True
            except json.JSONDecodeError:
                pass
        
        # Fallback to legacy string parsing
        if not is_json and saved_paths:
            paths = [p.strip() for p in re.split(r'[,;]', saved_paths) if p.strip()]
            groups = self._group_by_batch(paths)
        
        # Get temp directory for previews
        if HAS_COMFY:
            temp_dir = folder_paths.get_temp_directory()
        else:
            temp_dir = os.path.join(os.getcwd(), "temp")
            os.makedirs(temp_dir, exist_ok=True)
        
        # Store state for JS access
        ShimaCarouselPreview._preview_state[unique_id] = {
            "groups": groups,
            "paths": paths,
            "current_group": 0,
        }
        
        # Build preview results for UI with group tracking
        results = []
        group_keys = list(groups.keys())
        group_images = {}  # Map group index -> list of image indices in results array
        current_image_idx = 0
        
        for group_idx, group_key in enumerate(group_keys):
            group_paths = groups[group_key]
            group_image_indices = []
            
            for path in group_paths:
                if os.path.exists(path):
                    # Copy to temp for preview
                    filename = os.path.basename(path)
                    temp_filename = f"ShimaCarousel_{unique_id}_{filename}"
                    temp_path = os.path.join(temp_dir, temp_filename)
                    
                    # Copy file to temp
                    img = Image.open(path)
                    img.save(temp_path)
                    
                    results.append({
                        "filename": temp_filename,
                        "subfolder": "",
                        "type": "temp",
                    })
                    group_image_indices.append(current_image_idx)
                    current_image_idx += 1
            
            group_images[group_idx] = group_image_indices
        
        # Build group info string
        group_info = f"Groups: {len(groups)} | Total: {len(paths)}"
        
        return {
            "ui": {
                "images": results,
                # Wrap in list to prevent ComfyUI from flattening dict to keys
                "shima_carousel": [{
                    "node_id": unique_id,
                    "groups": group_keys,
                    "group_images": group_images,  # Maps group_idx -> [image_indices]
                    "group_count": len(groups),
                    "total_images": len(results),
                }],
            },
            "result": (group_info,),
        }
    
    def _group_by_batch(self, paths: List[str]) -> Dict[str, List[str]]:
        """
        Group paths by batch identifier (timestamp + collision ID).
        
        Filename format from MultiSaver: {prefix}_{type}_{timestamp}_{CID}.png
        Example: test_raw_20260125_005406_MIHEQV.png
                 test_line_20260125_005406_MIHEQV.png
        
        Group key: timestamp_CID (e.g., "20260125_005406_MIHEQV")
        """
        groups = {}
        
        for path in paths:
            basename = os.path.basename(path)
            name_without_ext = os.path.splitext(basename)[0]
            
            # Pattern: prefix_type_YYYYMMDD_HHMMSS_CID
            # Extract the timestamp_CID portion as group key
            # Look for pattern: \d{8}_\d{6}_\w+ at the end
            match = re.search(r'(\d{8}_\d{6}_\w+)$', name_without_ext)
            if match:
                group_key = match.group(1)
            else:
                # Fallback: try to find any 6-char alphanumeric at end (CID)
                match = re.search(r'_([A-Z0-9]{6})$', name_without_ext)
                if match:
                    group_key = match.group(1)
                else:
                    # Last fallback: use full name
                    group_key = name_without_ext
            
            print(f"[Shima Carousel] '{basename}' -> group '{group_key}'")
            
            if group_key not in groups:
                groups[group_key] = []
            groups[group_key].append(path)
        
        print(f"[Shima Carousel] Found {len(groups)} groups: {list(groups.keys())}")
        return groups
    
    @classmethod
    def get_current_group(cls, node_id: str) -> dict:
        """Get current group info for a node."""
        return cls._preview_state.get(node_id, {})
    
    @classmethod
    def set_group_index(cls, node_id: str, index: int):
        """Set current group index for navigation."""
        if node_id in cls._preview_state:
            groups = cls._preview_state[node_id].get("groups", {})
            cls._preview_state[node_id]["current_group"] = max(0, min(index, len(groups) - 1))


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.CarouselPreview": ShimaCarouselPreview,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.CarouselPreview": "Shima Carousel Preview",
}
