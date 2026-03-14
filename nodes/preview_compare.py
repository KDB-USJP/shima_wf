"""
Shima.PreviewCompare - Before/After image comparison with slider

Features:
- Two IMAGE inputs (Left / Right) with before/after slider
- Draggable vertical divider for side-by-side comparison
- Click left/right of slider to select which image for toolbar actions
- Copy, Edit, Save buttons act on selected side
- Integrates with FileNamer + CommonParams for consistent naming
"""

import os
import json
from datetime import datetime
from typing import Optional

import torch
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

# Try to import ComfyUI modules
try:
    import folder_paths
    HAS_COMFY = True
except ImportError:
    HAS_COMFY = False


class ShimaPreviewCompare:
    """
    Before/after image comparison with interactive slider.
    
    Toolbar buttons act on the selected side (left/right):
    - 📋 Copy: Copy selected image to clipboard
    - 🖼️ Edit: Open selected image in external editor
    - 💾 Save: Save selected image to filesystem
    """
    
    # Class-level storage for last preview info (for button actions)
    _last_preview = {
        "left_images": [],
        "right_images": [],
        "left_paths": [],
        "right_paths": [],
        "filename": "",
        "folder": "",
        "workflow": None,
        "prompt": None,
    }
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "left": ("IMAGE", {
                    "tooltip": "Left-side image (Before)."
                }),
                "right": ("IMAGE", {
                    "tooltip": "Right-side image (After)."
                }),
            },
            "optional": {
                # Shima Integration (Input)
                "shima.commonparams": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Configuration bundle from Shima.Commons (for Save defaults)."
                }),

                # FileNamer integration
                "filename": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Filename from FileNamer (for Save button)."
                }),
                "folder_path": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Folder path from FileNamer (for Save button)."
                }),
                # Save options
                "save_with_workflow": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Embed workflow in saved image."
                }),
                "save_with_metadata": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Embed generation metadata in saved image."
                }),

                # Shima Integration (Widgets)
                "use_commonparams": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Use Shima.Commons settings if connected"
                }),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }
    
    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("left", "right")
    OUTPUT_TOOLTIPS = ("Passthrough of left input.", "Passthrough of right input.")
    
    FUNCTION = "compare"
    CATEGORY = "Shima/Image"
    OUTPUT_NODE = True
    
    DESCRIPTION = "Before/after comparison with draggable slider. Click left/right to select which image for Copy/Edit/Save."
    
    def _save_temp_images(self, images, prefix, unique_id, temp_dir):
        """Save a batch of images to temp and return results + paths."""
        results = []
        paths = []
        
        for i, image in enumerate(images):
            # Convert tensor to numpy
            if isinstance(image, torch.Tensor):
                img_np = image.cpu().numpy()
            else:
                img_np = image
            
            # Ensure [H, W, C] with 0-255 range
            if img_np.max() <= 1.0:
                img_np = (img_np * 255).clip(0, 255)
            img_np = img_np.astype(np.uint8)
            
            # Save temp preview
            temp_filename = f"ShimaCompare{prefix}_{unique_id}_{i:05d}.png"
            temp_path = os.path.join(temp_dir, temp_filename)
            
            img = Image.fromarray(img_np)
            img.save(temp_path)
            
            paths.append(temp_path)
            results.append({
                "filename": temp_filename,
                "subfolder": "",
                "type": "temp",
            })
        
        return results, paths
    
    def compare(
        self,
        left,
        right,
        filename: str = None,
        folder_path: str = None,
        save_with_workflow: bool = True,
        save_with_metadata: bool = True,
        prompt=None,
        extra_pnginfo=None,
        unique_id=None,
        use_commonparams: bool = False,
        **kwargs,
    ):
        # Handle input name with dot
        shima_commonparams = kwargs.get("shima.commonparams", None)
        
        # Apply Shima Bundle defaults for Save button
        # ONLY if switch is ON
        if use_commonparams and shima_commonparams:
            # If folder_path not provided, construct from bundle (save_path/project_name)
            if not folder_path:
                bundle_path = shima_commonparams.get("save_path", "")
                project = shima_commonparams.get("project_name", "")
                if bundle_path and project:
                    folder_path = os.path.join(bundle_path, project)
                elif bundle_path:
                    folder_path = bundle_path
            
            # If filename not provided, construct from bundle info
            if not filename:
                project = shima_commonparams.get("project_name", "shima")
                timestamp = shima_commonparams.get("timestamp", datetime.now().strftime('%Y%m%d_%H%M%S'))
                cid = shima_commonparams.get("collision_id", "")
                
                parts = [project, timestamp]
                if cid:
                    parts.append(cid)
                filename = "_".join(parts)

        # Get temp directory for preview
        if HAS_COMFY:
            temp_dir = folder_paths.get_temp_directory()
        else:
            temp_dir = os.path.join(os.getcwd(), "temp")
            os.makedirs(temp_dir, exist_ok=True)
        
        # Save both sides to temp
        left_results, left_paths = self._save_temp_images(left, "L", unique_id, temp_dir)
        right_results, right_paths = self._save_temp_images(right, "R", unique_id, temp_dir)
        
        # Store for button actions
        ShimaPreviewCompare._last_preview = {
            "left_images": left,
            "right_images": right,
            "left_paths": left_paths,
            "right_paths": right_paths,
            "filename": filename or f"shima_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "folder": folder_path or (folder_paths.get_output_directory() if HAS_COMFY else os.getcwd()),
            "save_with_workflow": save_with_workflow,
            "save_with_metadata": save_with_metadata,
            "workflow": extra_pnginfo.get("workflow") if extra_pnginfo else None,
            "prompt": prompt,
            "node_id": unique_id,
        }
        
        # Return UI info and passthrough
        # NOTE: We intentionally omit 'images' from UI so ComfyUI doesn't render
        # its own built-in preview thumbnails — our custom JS slider handles display.
        return {
            "ui": {
                "shima_compare": [{
                    "node_id": unique_id,
                    "left_count": len(left_results),
                    "right_count": len(right_results),
                    "left_filenames": [r["filename"] for r in left_results],
                    "right_filenames": [r["filename"] for r in right_results],
                    "has_filename": filename is not None,
                    "has_folder": folder_path is not None,
                }],
            },
            "result": (left, right),
        }


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.PreviewCompare": ShimaPreviewCompare,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.PreviewCompare": "Shima Preview Compare",
}
