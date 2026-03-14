"""
Shima.Preview - Enhanced preview with Copy, Edit, and Save buttons

Features:
- Standard image preview with passthrough
- Copy to clipboard (via JS Clipboard API)
- Send to external editor
- Save to filesystem with workflow/metadata
- Integrates with FileNamer for consistent naming
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


class ShimaPreview:
    """
    Enhanced preview node with interactive buttons.
    
    Buttons (rendered via JS after execution):
    - 📋 Copy: Copy image to clipboard
    - 🖼️ Edit: Open in external editor
    - 💾 Save: Save to filesystem with workflow/metadata
    """
    
    # Class-level storage for last preview info (for button actions)
    _last_preview = {
        "images": [],
        "paths": [],
        "filename": "",
        "folder": "",
        "workflow": None,
        "prompt": None,
    }
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": "Images to preview."
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
    
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("images", "preview_paths")
    OUTPUT_TOOLTIPS = ("Passthrough of input images.", "Paths to preview images (semicolon separated).")
    
    FUNCTION = "preview"
    CATEGORY = "Shima/Image"
    OUTPUT_NODE = True
    
    DESCRIPTION = "Preview with Copy, Edit, and Save buttons. Connect FileNamer for organized saving."
    
    def preview(
        self,
        images,
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
        
        # Save images temporarily for preview
        results = []
        temp_paths = []
        
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
            temp_filename = f"ShimaPreview_{unique_id}_{i:05d}.png"
            temp_path = os.path.join(temp_dir, temp_filename)
            
            img = Image.fromarray(img_np)
            img.save(temp_path)
            
            temp_paths.append(temp_path)
            results.append({
                "filename": temp_filename,
                "subfolder": "",
                "type": "temp",
            })
        
        # Store for button actions
        ShimaPreview._last_preview = {
            "images": images,
            "paths": temp_paths,
            "filename": filename or f"shima_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "folder": folder_path or (folder_paths.get_output_directory() if HAS_COMFY else os.getcwd()),
            "save_with_workflow": save_with_workflow,
            "save_with_metadata": save_with_metadata,
            "workflow": extra_pnginfo.get("workflow") if extra_pnginfo else None,
            "prompt": prompt,
            "node_id": unique_id,
        }
        
        # Build paths string for output
        paths_string = ";".join(temp_paths)
        
        # Return UI info and passthrough
        return {
            "ui": {
                "images": results,
                "shima_preview": {
                    "node_id": unique_id,
                    "has_filename": filename is not None,
                    "has_folder": folder_path is not None,
                },
            },
            "result": (images, paths_string),
        }
    
    @classmethod
    def save_current(cls, focused_index=-1, folder=None):
        """
        Save the last previewed batch to disk.
        
        Args:
            focused_index (int): Index of image to save, or -1 for all
            folder (str): Optional override for save folder
        
        Returns:
            dict with success status and saved paths
        """
        preview = cls._last_preview
        if not preview or preview.get("images") is None or len(preview.get("paths", [])) == 0:
            return {"success": False, "error": "No images to save"}
        
        saved_paths = []
        target_folder = folder if folder else preview["folder"]
        base_filename = preview["filename"]
        
        # Ensure folder exists
        os.makedirs(target_folder, exist_ok=True)
        
        # Determine which paths to save
        paths_to_save = preview["paths"]
        if focused_index >= 0 and focused_index < len(paths_to_save):
            paths_to_save = [(focused_index, paths_to_save[focused_index])]
        else:
            paths_to_save = list(enumerate(paths_to_save))
        
        for i, temp_path in paths_to_save:
            try:
                # Load temp image
                img = Image.open(temp_path)
                
                # Build metadata
                metadata = PngInfo()
                
                if preview.get("save_with_workflow") and preview.get("workflow"):
                    metadata.add_text("workflow", json.dumps(preview["workflow"]))
                
                if preview.get("save_with_metadata") and preview.get("prompt"):
                    metadata.add_text("prompt", json.dumps(preview["prompt"]))
                
                # Generate final filename
                if len(preview["paths"]) > 1:
                    filename = f"{base_filename}_{i:03d}.png"
                else:
                    filename = f"{base_filename}.png"
                
                # Handle collision
                save_path = os.path.join(target_folder, filename)
                counter = 1
                while os.path.exists(save_path):
                    name, ext = os.path.splitext(filename)
                    save_path = os.path.join(target_folder, f"{name}_{counter:03d}{ext}")
                    counter += 1
                
                # Save with metadata
                img.save(save_path, pnginfo=metadata)
                saved_paths.append(save_path)
                
            except Exception as e:
                return {"success": False, "error": str(e)}
        
        return {
            "success": True,
            "saved_paths": saved_paths,
            "count": len(saved_paths),
        }


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.Preview": ShimaPreview,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Preview": "Shima Preview",
}
