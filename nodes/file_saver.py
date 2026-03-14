"""
Shima.FileSaver - Comprehensive file saving node

Generates file paths/names and saves images with:
- Collision ID (6-char alphanumeric, toggleable)
- Timestamp (customizable format)
- Project name (for folder organization)
- Prefix/suffix support
- Configurable filename ordering
- Metadata embedding (PNG/WebP)
- Workflow embedding
- Multiple export formats (PNG, JPEG, WebP)
- Preview display toggle
"""

import os
import json
import random
import string
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

import torch

from ..utils.settings_utils import ShimaSettings

# Try to import folder_paths for ComfyUI output directory
try:
    import folder_paths
    HAS_FOLDER_PATHS = True
except ImportError:
    HAS_FOLDER_PATHS = False


class ShimaFileSaver:
    """
    Save images with organized naming, metadata, and workflow embedding.
    
    Combines file naming logic with actual image saving, supporting
    multiple formats and customizable filename ordering.
    """
    
    # Export image types
    EXPORT_IMAGE_TYPES = [
        "Unprocessed",
        "Processed",
        "Lineart",
        "Highlight Map",
        "Shadow Map",
        "Depth Map",
        "Normal",
        "Palette",
    ]
    
    # Export formats
    EXPORT_FORMATS = ["PNG", "JPEG", "WebP"]
    
    # Overwrite modes
    OVERWRITE_MODES = [
        "collision_id",  # Always unique via collision ID
        "increment",     # Append _001, _002, etc.
        "overwrite",     # Overwrite existing file
        "skip",          # Skip save if file exists
    ]
    
    @classmethod
    def INPUT_TYPES(cls):
        # Fetch dynamic settings
        ms_settings = ShimaSettings.get_multisaver()
        ORDER_PRESETS = ms_settings.get("filename_order_presets", ["BN"])
        SEPARATORS = ms_settings.get("separators", ["_"])

        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": "Image to save."
                }),
                # ── Preview ──
                "show_preview": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Display image preview below the node options."
                }),


                
                # ── Master Control ──
                "saver_enabled": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Master on/off switch. If off, node acts as passthrough (no save)."
                }),
                
                # ── Export Settings ──
                "export_image": (cls.EXPORT_IMAGE_TYPES, {
                    "default": "Unprocessed",
                    "tooltip": "Label for the image type being saved. Affects filename and metadata."
                }),
                "user_notes": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Optional notes stored in file metadata. Leave blank to skip."
                }),
                "export_with_metadata": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Embed metadata (timestamp, project, prompts, model, etc.) in file."
                }),
                "export_with_workflow": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Embed full ComfyUI workflow JSON in file (PNG/WebP only)."
                }),
                "export_as": (cls.EXPORT_FORMATS, {
                    "default": "PNG",
                    "tooltip": "Output format. PNG is lossless, JPEG/WebP use quality setting."
                }),
                "export_quality": ("INT", {
                    "default": 95,
                    "min": 1,
                    "max": 100,
                    "step": 1,
                    "tooltip": "Quality for JPEG/WebP (1-100). Ignored for PNG."
                }),
                
                # ── Overwrite Behavior ──
                "overwrite_mode": (cls.OVERWRITE_MODES, {
                    "default": "collision_id",
                    "tooltip": "How to handle existing files: collision_id (unique), increment, overwrite, or skip."
                }),
                
                # ── Naming Components ── (ordered by folder depth)
                "base_folder": ("STRING", {
                    "default": "output",
                    "tooltip": "Base output folder (relative to ComfyUI root or absolute path)."
                }),
                "project_name": ("STRING", {
                    "default": "project",
                    "tooltip": "Project Name / Folder - used as subfolder and in filename."
                }),
                "base_name": ("STRING", {
                    "default": "",
                    "tooltip": "User-supplied base filename. Leave blank to omit."
                }),
                
                # ── Collision ID ──
                "collision_id_enabled": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Add 6-char random ID to prevent overwrites."
                }),
                "collision_id_mode": (["new_each_run", "fixed"], {
                    "default": "new_each_run",
                    "tooltip": "new_each_run = unique files; fixed = same ID across runs."
                }),
                
                # ── Timestamp ──
                "timestamp_enabled": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Add timestamp to filename."
                }),
                "timestamp_format": ("STRING", {
                    "default": "%Y%m%d_%H%M%S",
                    "tooltip": "Python strftime format (e.g., %Y%m%d_%H%M%S)."
                }),
                
                # ── Prefix/Suffix ──
                "prefix": ("STRING", {
                    "default": "",
                    "tooltip": "Text to prepend to filename. Skip if blank."
                }),
                "suffix": ("STRING", {
                    "default": "",
                    "tooltip": "Text to append before extension. Skip if blank."
                }),
                
                # ── Filename Order ──
                "filename_order": (ORDER_PRESETS, {
                    "default": "PRE,PRJ,BN,ET,SUF,TS,CID" if "PRE,PRJ,BN,ET,SUF,TS,CID" in ORDER_PRESETS else ORDER_PRESETS[0],
                    "tooltip": "Order of filename components. PRE=Prefix, PRJ=Project, BN=BaseName, ET=ExportType, SUF=Suffix, TS=Timestamp, CID=CollisionID."
                }),
                "separator": (SEPARATORS, {
                    "default": "_" if "_" in SEPARATORS else SEPARATORS[0],
                    "tooltip": "Character between filename parts."
                }),
                
                # ── Preview ──
                "show_preview": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Display image preview below the node options."
                }),

            },
            "optional": {
                # ── Shima Integration ──
                "shima.commonparams": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Configuration bundle from Shima.Commons (overrides settings)."
                }),
                
                # ── External Overrides ──
                "external_project": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Override project name from external source."
                }),
                "external_folder": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Override base folder from external source."
                }),
                "external_collision_id": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Use specific collision ID (for matched outputs)."
                }),
                "subfolder_path": ("STRING", {
                    "forceInput": True,
                    "default": "",
                    "tooltip": "Optional subfolder path (useful for batch mirroring)."
                }),
                # Shima Integration (Widgets)
                "use_commonparams": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "If True, use settings from Shima.Commons bundle (Project, Folder, etc.)"
                }),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
                "show_used_values": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Show actual values being used (debug)"
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }
    
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING", "IMAGE")
    RETURN_NAMES = ("full_path", "folder_path", "filename", "collision_id", "timestamp", "image")
    OUTPUT_TOOLTIPS = (
        "Complete path including folder and filename with extension.",
        "Folder path only.",
        "Filename with extension.",
        "The collision ID used (for matching related outputs).",
        "The timestamp used.",
        "Passthrough of input image."
    )
    
    FUNCTION = "save"
    CATEGORY = "Shima/Output"
    OUTPUT_NODE = True
    
    DESCRIPTION = "Save images with organized naming, metadata embedding, and optional preview."

    # Class-level storage for fixed collision IDs
    _fixed_ids = {}
    
    def save(
        self,
        images,
        saver_enabled: bool,
        export_image: str,
        user_notes: str,
        export_with_metadata: bool,
        export_with_workflow: bool,
        export_as: str,
        export_quality: int,
        overwrite_mode: str,
        base_name: str,
        project_name: str,
        base_folder: str,
        collision_id_enabled: bool,
        collision_id_mode: str,
        timestamp_enabled: bool,
        timestamp_format: str,
        prefix: str,
        suffix: str,
        filename_order: str,
        separator: str,
        show_preview: bool,
        unique_id: str = "",
        prompt = None,
        extra_pnginfo = None,
        external_project: str = None,
        external_folder: str = None,
        external_collision_id: str = None,
        subfolder_path: str = "",
        use_commonparams: bool = True,
        **kwargs,
    ):
        # Handle input name with dot
        shima_commonparams = kwargs.get("shima.commonparams", None)
        
        # Override with Bundle if present (Higher priority than manual overrides)
        if use_commonparams and shima_commonparams:
            external_project = shima_commonparams.get("project_name", external_project)
            external_folder = shima_commonparams.get("save_path", external_folder)
            external_collision_id = shima_commonparams.get("collision_id", external_collision_id)
            # FileSaver doesn't support 'export_labels' processing yet, but it supports renaming via project/folder
            # Timestamp check
            # bundle_timestamp = shima_commonparams.get("timestamp")
            
        # If saver is disabled, just passthrough
        if not saver_enabled:
            return ("", "", "", "", "", images)

        # Check for blocked content (all black image)
        # This is an "In-Band Signal" from NSFW/Safety nodes
        is_blocked = False
        if isinstance(images, torch.Tensor):
            if torch.count_nonzero(images) == 0:
                is_blocked = True
        elif isinstance(images, np.ndarray):
            if np.count_nonzero(images) == 0:
                is_blocked = True

        if is_blocked:
            print(f"[Shima.FileSaver] Skipping save: Input image is blocked (all black).")
            # Return empty strings for paths but pass through the black image
            return ("", "", "", "", "", images)
        
        # Use external values if provided
        final_project = external_project if external_project else project_name
        final_folder = external_folder if external_folder else base_folder
        
        # Resolve base folder to absolute path
        if HAS_FOLDER_PATHS and not os.path.isabs(final_folder):
            final_folder = os.path.join(folder_paths.get_output_directory(), final_folder)
        
        # Generate timestamp
        if timestamp_enabled:
            # Check bundle first
            bundle_timestamp = shima_commonparams.get("timestamp") if (use_commonparams and shima_commonparams) else None
            
            if bundle_timestamp:
                timestamp = bundle_timestamp
            else:
                try:
                    timestamp = datetime.now().strftime(timestamp_format)
                except:
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        else:
            timestamp = ""
        
        # Generate or retrieve collision ID
        if external_collision_id:
            collision_id = external_collision_id
        elif collision_id_enabled:
            if collision_id_mode == "fixed":
                if unique_id not in self._fixed_ids:
                    self._fixed_ids[unique_id] = self._generate_id()
                collision_id = self._fixed_ids[unique_id]
            else:
                collision_id = self._generate_id()
        else:
            collision_id = ""
        
        # Map export_image to short code for filename
        export_type_short = self._get_export_type_short(export_image)
        
        # Build filename from order string
        filename = self._build_filename(
            order=filename_order,
            separator=separator,
            prefix=prefix,
            project=final_project,
            base_name=base_name,
            export_type=export_type_short,
            suffix=suffix,
            timestamp=timestamp,
            collision_id=collision_id,
        )
        
        # Determine extension
        ext = self._get_extension(export_as)
        filename_with_ext = f"{filename}.{ext}"
        
        # Build folder path (include project as subfolder, then subfolder_path)
        # Format: Base / Project / Subfolder
        parts = [final_folder]
        if final_project:
            parts.append(final_project)
        if subfolder_path:
            parts.append(subfolder_path)
            
        folder_path = os.path.join(*parts)
        
        # Ensure folder exists
        os.makedirs(folder_path, exist_ok=True)
        
        # Build full path
        full_path = os.path.join(folder_path, filename_with_ext)
        
        # Handle overwrite mode
        full_path = self._handle_overwrite(full_path, overwrite_mode, ext)
        
        # If skip mode and file exists, don't save
        if full_path is None:
            return ("", "", "", collision_id, timestamp, images)
        
        # Update filename_with_ext after potential changes
        filename_with_ext = os.path.basename(full_path)
        
        # Save image
        self._save_image(
            image=images,
            path=full_path,
            export_as=export_as,
            quality=export_quality,
            export_with_metadata=export_with_metadata,
            export_with_workflow=export_with_workflow,
            user_notes=user_notes,
            export_image=export_image,
            project_name=final_project,
            base_name=base_name,
            collision_id=collision_id,
            timestamp=timestamp,
            prompt=prompt,
            extra_pnginfo=extra_pnginfo,
        )
        
        # Formatting used values for UI display
        source = "CommonParams" if (use_commonparams and shima_commonparams) else "Widget"
        used_values_text = [
            f"Source: {source}",
            f"Path: {full_path}",
            f"Project: {final_project}",
            f"Format: {export_as}",
            f"ID: {collision_id}" if collision_id_enabled else "ID: (Disabled)"
        ]

        return {
            "ui": {
                "used_values": used_values_text,
            },
            "result": (full_path, folder_path, filename_with_ext, collision_id, timestamp, images)
        }
    
    def _build_filename(
        self,
        order: str,
        separator: str,
        prefix: str,
        project: str,
        base_name: str,
        export_type: str,
        suffix: str,
        timestamp: str,
        collision_id: str,
    ) -> str:
        """Build filename from order string and components."""
        # Map codes to values
        code_map = {
            "PRE": prefix,
            "PRJ": project,
            "BN": base_name,
            "ET": export_type,
            "SUF": suffix,
            "TS": timestamp,
            "CID": collision_id,
        }
        
        # Parse order string
        codes = [c.strip() for c in order.split(",")]
        
        # Build components list, skipping empty values
        components = []
        for code in codes:
            value = code_map.get(code, "")
            if value:
                components.append(value)
        
        # Join with separator
        filename = separator.join(components)
        
        # Fallback if empty
        if not filename:
            filename = "output"
        
        # Sanitize filename (remove invalid characters)
        filename = self._sanitize_filename(filename)
        
        return filename
    
    def _get_export_type_short(self, export_image: str) -> str:
        """Convert export image type to short code for filename."""
        mapping = {
            "Unprocessed": "raw",
            "Processed": "proc",
            "Lineart": "line",
            "Highlight Map": "hi",
            "Shadow Map": "shd",
            "Depth Map": "depth",
            "Normal": "norm",
            "Palette": "pal",
        }
        return mapping.get(export_image, export_image.lower().replace(" ", "_"))
    
    def _get_extension(self, export_as: str) -> str:
        """Get file extension for format."""
        return export_as.lower()
    
    def _handle_overwrite(self, path: str, mode: str, ext: str) -> str:
        """Handle file collision based on overwrite mode."""
        if not os.path.exists(path):
            return path
        
        if mode == "overwrite":
            return path
        elif mode == "skip":
            return None
        elif mode == "increment":
            # Find next available number
            base = path[:-len(ext)-1]  # Remove .ext
            counter = 1
            while os.path.exists(f"{base}_{counter:03d}.{ext}"):
                counter += 1
            return f"{base}_{counter:03d}.{ext}"
        else:
            # collision_id mode - should already be unique, but just in case
            return path
    
    def _sanitize_filename(self, filename: str) -> str:
        """Remove invalid filename characters."""
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, "_")
        return filename
    
    def _save_image(
        self,
        image,
        path: str,
        export_as: str,
        quality: int,
        export_with_metadata: bool,
        export_with_workflow: bool,
        user_notes: str,
        export_image: str,
        project_name: str,
        base_name: str,
        collision_id: str,
        timestamp: str,
        prompt,
        extra_pnginfo,
    ):
        """Save image to disk with optional metadata."""
        # Convert from ComfyUI tensor format to PIL
        # ComfyUI IMAGE format: [batch, height, width, channels] with values 0-1
        if isinstance(image, torch.Tensor):
            image_np = image.cpu().numpy()
        else:
            image_np = image
        
        # Handle batch - save first image
        if len(image_np.shape) == 4:
            image_np = image_np[0]
        
        # Convert to 8-bit
        image_np = (image_np * 255).clip(0, 255).astype(np.uint8)
        
        # Create PIL image
        pil_image = Image.fromarray(image_np)
        
        # Prepare metadata
        metadata = None
        if export_as == "PNG":
            metadata = PngInfo()
            
            if export_with_metadata:
                # Add Shima metadata
                shima_meta = {
                    "export_type": export_image,
                    "project": project_name,
                    "base_name": base_name,
                    "collision_id": collision_id,
                    "timestamp": timestamp,
                }
                if user_notes.strip():
                    shima_meta["user_notes"] = user_notes
                
                metadata.add_text("shima", json.dumps(shima_meta))
            
            if export_with_workflow:
                if prompt is not None:
                    metadata.add_text("prompt", json.dumps(prompt))
                if extra_pnginfo is not None:
                    for key, value in extra_pnginfo.items():
                        metadata.add_text(key, json.dumps(value))
        
        # Save based on format
        if export_as == "PNG":
            pil_image.save(path, pnginfo=metadata)
        elif export_as == "JPEG":
            # Convert to RGB if RGBA
            if pil_image.mode == "RGBA":
                pil_image = pil_image.convert("RGB")
            pil_image.save(path, quality=quality, optimize=True)
        elif export_as == "WebP":
            # WebP supports metadata via XMP
            if export_with_metadata or export_with_workflow:
                # For now, save as WebP with quality only
                # TODO: Add XMP metadata support
                pass
            pil_image.save(path, quality=quality, method=6)
    
    @staticmethod
    def _generate_id(length: int = 6) -> str:
        """Generate a random alphanumeric ID."""
        chars = string.ascii_uppercase + string.digits
        return ''.join(random.choice(chars) for _ in range(length))


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.FileSaver": ShimaFileSaver,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.FileSaver": "Shima File Saver",
}
