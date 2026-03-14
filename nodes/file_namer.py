"""
Shima.FileNamer - Comprehensive file naming node

Generates file paths and names with:
- Collision ID (6-char alphanumeric, toggleable)
- Timestamp (customizable format)
- Project name (for folder organization)
- Base name for user-supplied filename
- Prefix/suffix support
- Configurable filename ordering
- Customizable separator
- All inputs connectable for maximum flexibility
"""

import os
import random
import string
from datetime import datetime
from ..utils.settings_utils import ShimaSettings


class ShimaFileNamer:
    """
    Generate file names and paths with collision protection and organization.
    
    Outputs complete path information for use with saver nodes.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        # Fetch dynamic settings
        ms_settings = ShimaSettings.get_multisaver()
        ORDER_PRESETS = ms_settings.get("filename_order_presets", ["BN"])
        SEPARATORS = ms_settings.get("separators", ["_"])

        return {
            "required": {
                # ── Naming Components ── (ordered by folder depth)
                "base_folder": ("STRING", {
                    "default": "output",
                    "tooltip": "Base output folder (relative to ComfyUI root or absolute path)."
                }),
                "project_name": ("STRING", {
                    "default": "project",
                    "tooltip": "Project name - used as subfolder and in filename."
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
                
                # ── Output Type Label ──
                "output_type": ("STRING", {
                    "default": "",
                    "tooltip": "Label for output type (e.g., 'rgb', 'depth', 'mask'). Skip if blank."
                }),
                
                # ── Filename Order ──
                "filename_order": (ORDER_PRESETS, {
                    "default": "PRE,PRJ,BN,ET,SUF,TS,CID" if "PRE,PRJ,BN,ET,SUF,TS,CID" in ORDER_PRESETS else ORDER_PRESETS[0],
                    "tooltip": "Order of filename components. PRE=Prefix, PRJ=Project, BN=BaseName, ET=OutputType, SUF=Suffix, TS=Timestamp, CID=CollisionID."
                }),
                "separator": (SEPARATORS, {
                    "default": "_" if "_" in SEPARATORS else SEPARATORS[0],
                    "tooltip": "Character between filename parts."
                }),
                
                # ── User Notes (for metadata in downstream savers) ──
                "user_notes": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Optional notes to pass to downstream saver nodes for metadata."
                }),
            },
            "optional": {
                # External overrides
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
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("full_path", "folder_path", "filename", "collision_id", "timestamp", "user_notes")
    OUTPUT_TOOLTIPS = (
        "Complete path including folder and filename (no extension).",
        "Folder path only.",
        "Filename only (no extension).",
        "The collision ID used (for matching related outputs).",
        "The timestamp used.",
        "User notes passthrough for downstream savers."
    )
    
    FUNCTION = "generate"
    CATEGORY = "Shima/Utilities"
    
    DESCRIPTION = "Generate organized file names with collision protection, timestamps, configurable ordering, and project folders."

    # Class-level storage for fixed collision IDs
    _fixed_ids = {}
    
    def generate(
        self,
        base_name: str,
        project_name: str,
        base_folder: str,
        collision_id_enabled: bool,
        collision_id_mode: str,
        timestamp_enabled: bool,
        timestamp_format: str,
        prefix: str,
        suffix: str,
        output_type: str,
        filename_order: str,
        separator: str,
        user_notes: str,
        unique_id: str = "",
        external_project: str = None,
        external_folder: str = None,
        external_collision_id: str = None,
        **kwargs,
    ):
        # Use external values if provided
        final_project = external_project if external_project else project_name
        final_folder = external_folder if external_folder else base_folder
        
        # Generate or retrieve collision ID
        if external_collision_id:
            collision_id = external_collision_id
        elif collision_id_enabled:
            if collision_id_mode == "fixed":
                # Use stored ID or generate new one
                if unique_id not in self._fixed_ids:
                    self._fixed_ids[unique_id] = self._generate_id()
                collision_id = self._fixed_ids[unique_id]
            else:
                # New ID each run
                collision_id = self._generate_id()
        else:
            collision_id = ""
        
        # Generate timestamp
        if timestamp_enabled:
            try:
                timestamp = datetime.now().strftime(timestamp_format)
            except:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        else:
            timestamp = ""
        
        # Build filename from order string
        filename = self._build_filename(
            order=filename_order,
            separator=separator,
            prefix=prefix,
            project=final_project,
            base_name=base_name,
            output_type=output_type,
            suffix=suffix,
            timestamp=timestamp,
            collision_id=collision_id,
        )
        
        # Build folder path (include project as subfolder)
        folder_path = os.path.join(final_folder, final_project) if final_project else final_folder
        
        # Build full path (without extension - saver nodes add that)
        full_path = os.path.join(folder_path, filename)
        
        return (full_path, folder_path, filename, collision_id, timestamp, user_notes)
    
    def _build_filename(
        self,
        order: str,
        separator: str,
        prefix: str,
        project: str,
        base_name: str,
        output_type: str,
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
            "ET": output_type,
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
    
    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        """Remove invalid filename characters."""
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, "_")
        return filename
    
    @staticmethod
    def _generate_id(length: int = 6) -> str:
        """Generate a random alphanumeric ID."""
        chars = string.ascii_uppercase + string.digits
        return ''.join(random.choice(chars) for _ in range(length))


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.FileNamer": ShimaFileNamer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.FileNamer": "Shima File Namer",
}
