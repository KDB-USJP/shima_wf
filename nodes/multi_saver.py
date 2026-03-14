"""
Shima.MultiSaver - Multi-output saver with integrated processing

Processes an image into utility maps and saves each enabled type:
- Original (passthrough)
- Lineart (Nikosis-style sketch or fallback edge detection)
- Canny (Canny edge detection)
- Depth (DepthAnythingV2 or greyscale fallback)
- Normal (Sobel gradients → RGB)
- Highlight (luminance threshold)
- Shadow (luminance threshold)
- Palette (K-means color quantization with hex codes)

Lineart and Depth processing adapted from comfyui-nikosis-preprocessors (MIT License).
See nodes/nikosis_compat.py for license and attribution.
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

# Import Nikosis compatibility layer
from .nikosis_compat import (
    LINEART_MODELS,
    DEPTH_MODELS,
    DEFAULT_DEPTH_MODEL,
    NORMAL_MODELS,
    DEFAULT_NORMAL_MODEL,
    get_lineart_processor,
    get_depth_processor,
    get_normal_processor,
    HAS_NIKOSIS_LINEART,
    HAS_NIKOSIS_DEPTH,
)

# Try to import optional dependencies
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    from sklearn.cluster import KMeans
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

# Try to import folder_paths for ComfyUI output directory
try:
    import folder_paths
    HAS_FOLDER_PATHS = True
except ImportError:
    HAS_FOLDER_PATHS = False


from ..utils.settings_utils import ShimaSettings

class ShimaMultiSaver:
    """
    Multi-output saver with integrated image processing.
    
    Processes an image into utility maps (lineart, depth, normal, etc.)
    and saves each enabled type with auto-labeling.
    
    Lineart and Depth processing adapted from Nikosis (MIT License).
    https://github.com/Nikosis/ComfyUI-Nikosis-Preprocessors
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        ms_settings = ShimaSettings.get_multisaver()
        separators = ms_settings.get("separators", ["_", "-", ".", " ", ""])
        order_presets = ms_settings.get("filename_order_presets", [
            "PRE,PRJ,BN,ET,SUF,TS,CID",
            "BN,ET,TS,CID"
        ])

        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": "Images to save."
                }),
                # ── User Notes (Moved to bottom) ──


                "fx_in": ("IMAGE", {
                    "tooltip": "Optional input for FX pass (processed externally)."
                }),
                
                # ── Output Types with Parameters ──
                # Each toggle is followed by its associated parameters
                
                "save_mode": (["Save to Disk", "Preview Only"], {
                    "default": "Save to Disk",
                    "tooltip": "Save Mode: 'Save to Disk' writes to your output folder. 'Preview Only' writes to ComfyUI temp folder (deleted on restart)."
                }),
                
                "save_original": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Save the original unprocessed image."
                }),
                
                "save_lineart": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Save sketch-style lineart (black lines on white). Uses Nikosis model."
                }),
                "lineart_resolution": ("INT", {
                    "default": 1024,
                    "min": 0,
                    "max": 2048,
                    "step": 64,
                    "tooltip": "Processing resolution for lineart (0 = use input image size)."
                }),
                "line_art_invert": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Invert lineart. Default (False) is Black Lines on White. True is White Lines on Black."
                }),
                "lineart_intensity": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 10.0,
                    "step": 0.1,
                    "tooltip": "Intensity/Contrast of the lineart."
                }),
                "lineart_blur": ("INT", {
                    "default": 1,
                    "min": 0,
                    "max": 16,
                    "step": 1,
                    "tooltip": "Blur amount for lineart smoothing."
                }),
                
                "save_canny": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Save Canny edge detection (white edges on black)."
                }),
                "canny_low": ("FLOAT", {
                    "default": 0.4,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                    "tooltip": "Canny low threshold (0-1)."
                }),
                "canny_high": ("FLOAT", {
                    "default": 0.8,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                    "tooltip": "Canny high threshold (0-1)."
                }),
                
                "save_depth": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Save depth map. Uses DepthAnythingV2 via Nikosis if installed."
                }),
                "depth_model": (DEPTH_MODELS, {
                    "default": DEFAULT_DEPTH_MODEL,
                    "tooltip": "Depth model. Use 'greyscale' for simple luminance conversion."
                }),
                
                "save_normal": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Save normal map using BAE, DSINE, or Sobel."
                }),
                "normal_model": (NORMAL_MODELS, {
                    "default": "dsine",
                    "tooltip": "Normal estimation: BAE (fast), DSINE (quality), or Sobel (no model)."
                }),
                "normal_strength": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 5.0,
                    "step": 0.1,
                    "tooltip": "Normal map intensity (for Sobel method)."
                }),
                
                "save_palette": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Save color palette grid."
                }),
                "palette_colors": ("INT", {
                    "default": 8,
                    "min": 2,
                    "max": 32,
                    "step": 1,
                    "tooltip": "Number of colors in palette."
                }),
                
                "save_highlight": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Save highlight mask (bright areas)."
                }),
                "highlight_threshold": ("FLOAT", {
                    "default": 0.8,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                    "tooltip": "Luminance threshold for highlights (0-1)."
                }),
                
                "save_shadow": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Save shadow mask (dark areas)."
                }),
                "shadow_threshold": ("FLOAT", {
                    "default": 0.2,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                    "tooltip": "Luminance threshold for shadows (0-1)."
                }),
                

                
                 "save_fx": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Enable FX pass (requires fx_in connection)."
                }),

                
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
                    "tooltip": "Python strftime format."
                }),
                
                # ── Prefix/Suffix ──
                "prefix": ("STRING", {
                    "default": "",
                    "tooltip": "Text to prepend to filename."
                }),
                "suffix": ("STRING", {
                    "default": "",
                    "tooltip": "Text to append before extension."
                }),
                
                # ── Filename Order ──
                "filename_order": (order_presets, {
                    "default": order_presets[0] if order_presets else "PRE,PRJ,BN,ET,SUF,TS,CID",
                    "tooltip": "Order of filename components."
                }),
                "separator": (separators, {
                    "default": separators[0] if separators else "_",
                    "tooltip": "Character between filename parts."
                }),
                
                # ── Export Settings ──
                "export_with_metadata": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Embed metadata in saved files."
                }),
                "export_with_workflow": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Embed workflow JSON in saved files."
                }),
                
                # ── User Notes ──
                "user_notes": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Optional notes stored in file metadata."
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
    
    RETURN_TYPES = ("STRING", "INT", "IMAGE", "IMAGE")
    RETURN_NAMES = ("saved_paths", "count", "preview_grid", "image")
    OUTPUT_TOOLTIPS = (
        "Comma-separated list of saved file paths.",
        "Number of files saved.",
        "Grid preview of all saved images.",
        "Original image passthrough."
    )
    
    FUNCTION = "save_all"
    CATEGORY = "Shima/Output"
    OUTPUT_NODE = True
    
    DESCRIPTION = "Multi-output saver with integrated processing. Saves original plus utility maps (lineart, depth, normal, etc.) with auto-labeling."

    # Class-level storage for fixed collision IDs
    _fixed_ids = {}
    
    def save_all(
        self,
        images,
        save_mode: str,
        save_original: bool,
        save_lineart: bool,
        save_canny: bool,
        save_depth: bool,
        save_normal: bool,
        save_highlight: bool,
        save_shadow: bool,
        save_palette: bool,
        save_fx: bool,

        # lineart_model removed
        lineart_resolution: int,
        line_art_invert: bool,
        lineart_intensity: float,
        lineart_blur: int,
        canny_low: float,
        canny_high: float,
        depth_model: str,
        normal_model: str,
        normal_strength: float,
        highlight_threshold: float,
        shadow_threshold: float,
        palette_colors: int,
        base_folder: str,
        project_name: str,
        base_name: str,
        collision_id_enabled: bool,
        collision_id_mode: str,
        timestamp_enabled: bool,
        timestamp_format: str,
        prefix: str,
        suffix: str,
        filename_order: str,
        separator: str,
        export_with_metadata: bool,
        export_with_workflow: bool,
        user_notes: str,
        unique_id: str = "",
        prompt = None,
        extra_pnginfo = None,
        external_project: str = None,
        external_folder: str = None, 
        external_collision_id: str = None,
        subfolder_path: str = "",
        use_commonparams: bool = True,
        show_used_values: bool = False,
        fx_in = None, # Optional FX input
        **kwargs,
    ):
        # Handle input name with dot
        shima_commonparams = kwargs.get("shima.commonparams", None)
        
        # Default labels
        export_labels = {}
        
        # Override with Bundle if present
        if use_commonparams and shima_commonparams:
            external_project = shima_commonparams.get("project_name", external_project)
            external_folder = shima_commonparams.get("save_path", external_folder)
            external_collision_id = shima_commonparams.get("collision_id", external_collision_id)
            export_labels = shima_commonparams.get("export_labels", {})

        # Use external values if provided
        final_project = external_project if external_project else project_name
        final_folder = external_folder if external_folder else base_folder
        
        # Handle Preview Mode
        if save_mode == "Preview Only" and HAS_FOLDER_PATHS:
            final_folder = folder_paths.get_temp_directory()
        elif HAS_FOLDER_PATHS and not os.path.isabs(final_folder):
            final_folder = os.path.join(folder_paths.get_output_directory(), final_folder)
        
        # Generate timestamp
        if timestamp_enabled:
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
        
        # Generate collision ID
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
        
        # Build folder path
        parts = [final_folder]
        if final_project:
            parts.append(final_project)
        if subfolder_path:
            parts.append(subfolder_path)
            
        folder_path = os.path.join(*parts)
        os.makedirs(folder_path, exist_ok=True)
        
        # Convert image to numpy
        if isinstance(images, torch.Tensor):
            images_batch = images.cpu().numpy()
        else:
            images_batch = images
        
        # Ensure 4D batch format
        if len(images_batch.shape) == 3:
            images_batch = np.expand_dims(images_batch, 0)
            
        # Handle FX input
        fx_batch = None
        if fx_in is not None:
             if isinstance(fx_in, torch.Tensor):
                fx_batch = fx_in.cpu().numpy()
             else:
                fx_batch = fx_in
             if len(fx_batch.shape) == 3:
                fx_batch = np.expand_dims(fx_batch, 0)
        
        batch_size = images_batch.shape[0]
        # Resize FX batch to match images batch if needed? 
        # For simple mapping, we assume 1:1 or broadcast.
        
        all_saved_paths = []
        all_grids = []
        batch_groups = {} 
        
        # Process each image
        for batch_idx in range(batch_size):
            image_np = images_batch[batch_idx]
            
            # FX for this item
            fx_np = None
            if fx_batch is not None:
                # Handle mismatched batch sizes safely
                fx_idx = batch_idx % fx_batch.shape[0]
                fx_np = fx_batch[fx_idx]
            
            # Generate Item Collision ID
            if external_collision_id:
                item_collision_id = external_collision_id if batch_size == 1 else f"{external_collision_id}_{batch_idx}"
            elif collision_id_enabled:
                if collision_id_mode == "fixed":
                    base_key = f"{unique_id}_{batch_idx}"
                    if base_key not in self._fixed_ids:
                        self._fixed_ids[base_key] = self._generate_id()
                    item_collision_id = self._fixed_ids[base_key]
                else:
                    item_collision_id = self._generate_id()
            else:
                item_collision_id = ""
            
            # Helper for JSON grouping
            group_key = item_collision_id if item_collision_id else f"batch_{batch_idx}"
            if group_key not in batch_groups:
                batch_groups[group_key] = []
            
            outputs_to_save = []
            palette_hex_codes = [] 
            
            if save_original:
                is_blocked = False
                if np.count_nonzero(image_np) == 0:
                    is_blocked = True
                
                if is_blocked:
                    print(f"[Shima.MultiSaver] Skipping batch item {batch_idx}: Input is blocked.")
                    all_grids.append(image_np)
                    continue 

                outputs_to_save.append(("raw", image_np, None))
            
            if save_lineart:
                # Use Nikosis Lineart Processor
                try:
                    processor = get_lineart_processor()
                    # Hardcode model to fine as requested ("sk_model_fine.safetensors" is standard high quality)
                    model_name = "sk_model_fine.safetensors"
                    
                    lineart = processor.process(
                        image_np, 
                        model_name=model_name,
                        resolution=lineart_resolution if lineart_resolution > 0 else 1024,
                        reverse=line_art_invert
                    )
                    
                    # Post-Processing: Blur
                    if lineart_blur > 0 and HAS_CV2:
                        ksize = (lineart_blur * 2) + 1
                        lineart = cv2.GaussianBlur(lineart, (ksize, ksize), 0)
                    
                    # Post-Processing: Intensity
                    if lineart_intensity != 1.0:
                        if line_art_invert:
                                lineart = np.clip(lineart * lineart_intensity, 0, 1)
                        else:
                                # Gamma approach
                                lineart = np.power(lineart, lineart_intensity)

                except Exception as e:
                    print(f"[Shima.MultiSaver] Lineart Error: {e}")
                    lineart = np.zeros_like(image_np)

                outputs_to_save.append(("line", lineart, None))
            
            if save_canny:
                canny = self._process_canny(image_np, canny_low, canny_high)
                outputs_to_save.append(("canny", canny, None))
            
            if save_depth:
                depth_proc = get_depth_processor()
                resolution = max(image_np.shape[:2])
                depth = depth_proc.process(
                    image_np,
                    model_name=depth_model,
                    resolution=resolution,
                )
                outputs_to_save.append(("depth", depth, None))
            
            if save_normal:
                normal_proc = get_normal_processor()
                resolution = max(image_np.shape[:2])
                normal = normal_proc.process(
                    image_np,
                    model_name=normal_model,
                    resolution=resolution,
                    strength=normal_strength,
                )
                outputs_to_save.append(("norm", normal, None))
            
            if save_highlight:
                highlight = self._process_threshold(image_np, highlight_threshold, "above")
                outputs_to_save.append(("hi", highlight, None))
            
            if save_shadow:
                shadow = self._process_threshold(image_np, shadow_threshold, "below")
                outputs_to_save.append(("shd", shadow, None))
            
            if save_palette:
                palette, palette_hex_codes = self._process_palette_grid(image_np, palette_colors)
                outputs_to_save.append(("pal", palette, {"hex_codes": palette_hex_codes}))
                
            # FX Pass
            if save_fx and fx_np is not None:
                 outputs_to_save.append(("fx", fx_np, None))
            
            # Save Loop...
            for output_tuple in outputs_to_save:
                original_type = output_tuple[0]
                processed_image = output_tuple[1]
                extra_meta = output_tuple[2] if len(output_tuple) > 2 else None
                
                # Apply export label override
                if original_type in export_labels:
                    export_type = export_labels[original_type]
                else:
                    export_type = original_type
                
                filename = self._build_filename(
                    order=filename_order,
                    separator=separator,
                    prefix=prefix,
                    project=final_project,
                    base_name=base_name,
                    export_type=export_type,
                    suffix=suffix,
                    timestamp=timestamp,
                    collision_id=item_collision_id,
                )
                
                full_path = os.path.join(folder_path, f"{filename}.png")
                
                self._save_image(
                    image=processed_image,
                    path=full_path,
                    export_with_metadata=export_with_metadata,
                    export_with_workflow=export_with_workflow,
                    export_type=export_type,
                    project_name=final_project,
                    base_name=base_name,
                    collision_id=item_collision_id,
                    timestamp=timestamp,
                    user_notes=user_notes,
                    extra_meta=extra_meta,
                    prompt=prompt,
                    extra_pnginfo=extra_pnginfo,
                )
                
                all_saved_paths.append(full_path)
                batch_groups[group_key].append(full_path)
            
            # Build grid for this batch item
            if len(outputs_to_save) > 0:
                images_for_grid = [output_tuple[1] for output_tuple in outputs_to_save]
                batch_grid = self._build_grid(images_for_grid)
                all_grids.append(batch_grid)
        
        # Combine all grids into preview tensor
        if len(all_grids) > 0:
            preview_tensor = torch.from_numpy(np.stack(all_grids, axis=0))
        else:
            # No outputs - return black image
            preview_tensor = torch.zeros_like(images[:1])
        
        # Construct JSON output structure for Shima Carousel
        output_data = {
            "type": "shima_v1",
            "groups": batch_groups,
            "all_paths": all_saved_paths
        }
        json_output = json.dumps(output_data)
        
        # Formatting used values for UI display
        source = "CommonParams" if (use_commonparams and shima_commonparams) else "Widget"
        
        # Summarize types enabled
        enabled_types = []
        if save_original: enabled_types.append("Original")
        if save_lineart: enabled_types.append("Lineart")
        if save_canny: enabled_types.append("Canny")
        if save_depth: enabled_types.append("Depth")
        if save_normal: enabled_types.append("Normal")
        
        used_values_text = [
            f"Source: {source}",
            f"Saved: {len(all_saved_paths)} files",
            f"Folder: {final_folder}",
            f"Project: {final_project}",
            f"Types: {', '.join(enabled_types)}"
        ]
        
        # Add first file path as example if available
        if len(all_saved_paths) > 0:
            first_file = os.path.basename(all_saved_paths[0])
            used_values_text.append(f"Ex: {first_file}")

        return {
            "ui": {
                "used_values": used_values_text if show_used_values else [],
            },
            "result": (json_output, len(all_saved_paths), preview_tensor, images)
        }
    
    # ========================================================================
    # Grid Building
    # ========================================================================
    
    def _build_grid(self, images: list, max_cols: int = 4) -> np.ndarray:
        """Build a grid preview from multiple images."""
        if not images:
            return np.zeros((64, 64, 3), dtype=np.float32)
        
        n = len(images)
        cols = min(n, max_cols)
        rows = (n + cols - 1) // cols
        
        # Get dimensions from first image
        h, w, c = images[0].shape
        
        # Create grid canvas
        grid = np.zeros((rows * h, cols * w, c), dtype=np.float32)
        
        for idx, img in enumerate(images):
            row = idx // cols
            col = idx % cols
            
            # Resize if needed
            if img.shape[0] != h or img.shape[1] != w:
                from PIL import Image as PILImage
                pil_img = PILImage.fromarray((img * 255).astype(np.uint8))
                pil_img = pil_img.resize((w, h), PILImage.Resampling.LANCZOS)
                img = np.array(pil_img).astype(np.float32) / 255.0
            
            grid[row*h:(row+1)*h, col*w:(col+1)*w] = img
        
        return grid
    
    # ========================================================================
    # Processing Functions
    # ========================================================================
    
    def _process_lineart_sketch(self, image_np: np.ndarray, sigma: float, intensity: int, invert: bool = False, blur: int = 1) -> np.ndarray:
        """Generate sketch-style lineart. 
        Default: Black lines on White background.
        If invert=True: White lines on Black background.
        """
        if not HAS_CV2:
            print("[Shima.MultiSaver] Warning: cv2 not available for lineart")
            return self._simple_edge_detection(image_np, invert=not invert)
        
        # Convert to grayscale
        gray = np.mean(image_np, axis=-1)
        gray_uint8 = (gray * 255).astype(np.uint8)
        
        # Apply Gaussian blur (user parameter)
        # Sigma usually derived from blur radius
        s = sigma if sigma > 0 else 0.5
        # Use blur input for initial smoothing if provided
        ksize = (blur * 2) + 1 if blur > 0 else 1
        gray_blurred = cv2.GaussianBlur(gray_uint8, (ksize, ksize), 0)
        
        # Difference of Gaussians
        blur1 = cv2.GaussianBlur(gray_blurred, (0, 0), s)
        blur2 = cv2.GaussianBlur(gray_blurred, (0, 0), s * 2)
        
        # Difference
        dog = blur1.astype(np.float32) - blur2.astype(np.float32)
        
        # Normalize/Contrast
        dog = np.abs(dog) * intensity
        dog = np.clip(dog, 0, 255).astype(np.uint8)
        
        # Default Logic: dog contains "Edges". High values = Edges.
        # We want Black Lines on White.
        # So we want High Edge Values to be Black (0).
        # Background (Low Edge) to be White (255).
        # So: 255 - dog
        
        result = 255 - dog
        
        # If Invert is requested (White Lines on Black):
        if invert:
            result = 255 - result # Invert back to original dog (Edges=White)
            
        # Normalize
        sketch_float = result.astype(np.float32) / 255.0
        
        # Convert to RGB
        return np.stack([sketch_float, sketch_float, sketch_float], axis=-1)
    
    def _process_canny(self, image_np: np.ndarray, low: float, high: float) -> np.ndarray:
        """Generate Canny edge detection (white edges on black background)."""
        if not HAS_CV2:
            print("[Shima.MultiSaver] Warning: cv2 not available for Canny")
            return self._simple_edge_detection(image_np, invert=False)
        
        # Convert to grayscale
        gray = np.mean(image_np, axis=-1)
        gray_uint8 = (gray * 255).astype(np.uint8)
        
        # Canny edge detection with user-specified thresholds
        low_thresh = int(low * 255)
        high_thresh = int(high * 255)
        edges = cv2.Canny(gray_uint8, low_thresh, high_thresh)
        
        # Convert to float RGB
        edges_float = edges.astype(np.float32) / 255.0
        return np.stack([edges_float, edges_float, edges_float], axis=-1)
    
    def _simple_edge_detection(self, image_np: np.ndarray, invert: bool) -> np.ndarray:
        """Simple edge detection fallback without cv2."""
        gray = np.mean(image_np, axis=-1)
        
        # Simple Sobel-like edge detection
        dx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
        dy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
        edges = np.sqrt(dx**2 + dy**2)
        edges = np.clip(edges * 5, 0, 1)
        
        if invert:
            edges = 1 - edges
        
        return np.stack([edges, edges, edges], axis=-1)
    
    def _process_depth(self, image_np: np.ndarray, method: str) -> np.ndarray:
        """Generate depth map using specified method."""
        if method == "luminance" or (method == "auto" and DEPTH_MODEL is None):
            return self._luminance_depth(image_np)
        
        # Try to use AI model
        if DEPTH_MODEL is not None:
            try:
                # Convert to tensor format expected by depth models
                image_tensor = torch.from_numpy(image_np).unsqueeze(0)
                
                # This is a simplified call - actual implementation may vary
                depth_result = DEPTH_MODEL().estimate(image_tensor)
                
                if isinstance(depth_result, torch.Tensor):
                    depth_np = depth_result.cpu().numpy()
                    if len(depth_np.shape) == 4:
                        depth_np = depth_np[0]
                    return depth_np
            except Exception as e:
                print(f"[Shima.MultiSaver] Depth model failed: {e}, using luminance fallback")
        
        return self._luminance_depth(image_np)
    
    def _luminance_depth(self, image_np: np.ndarray) -> np.ndarray:
        """Generate pseudo-depth from luminance."""
        # Simple luminance as depth (brighter = closer)
        gray = 0.299 * image_np[:, :, 0] + 0.587 * image_np[:, :, 1] + 0.114 * image_np[:, :, 2]
        return np.stack([gray, gray, gray], axis=-1)
    
    def _process_normal(self, depth_np: np.ndarray, strength: float) -> np.ndarray:
        """Generate normal map from depth using Sobel gradients."""
        # Extract single channel
        if len(depth_np.shape) == 3:
            depth = depth_np[:, :, 0]
        else:
            depth = depth_np
        
        if HAS_CV2:
            # Use cv2 Sobel
            dx = cv2.Sobel(depth, cv2.CV_32F, 1, 0, ksize=3) * strength
            dy = cv2.Sobel(depth, cv2.CV_32F, 0, 1, ksize=3) * strength
        else:
            # Simple gradient
            dx = np.gradient(depth, axis=1) * strength
            dy = np.gradient(depth, axis=0) * strength
        
        # Create normal map
        dz = np.ones_like(dx)
        
        # Normalize
        length = np.sqrt(dx**2 + dy**2 + dz**2)
        length = np.maximum(length, 1e-8)
        
        nx = dx / length
        ny = dy / length
        nz = dz / length
        
        # Convert to 0-1 range (standard normal map encoding)
        normal = np.stack([
            (nx + 1) / 2,  # R = X
            (ny + 1) / 2,  # G = Y
            (nz + 1) / 2,  # B = Z
        ], axis=-1)
        
        return np.clip(normal, 0, 1)
    
    def _process_threshold(self, image_np: np.ndarray, threshold: float, mode: str) -> np.ndarray:
        """Generate highlight or shadow mask based on luminance threshold."""
        gray = 0.299 * image_np[:, :, 0] + 0.587 * image_np[:, :, 1] + 0.114 * image_np[:, :, 2]
        
        if mode == "above":
            mask = (gray > threshold).astype(np.float32)
        else:
            mask = (gray < threshold).astype(np.float32)
        
        return np.stack([mask, mask, mask], axis=-1)
    
    def _process_palette_grid(self, image_np: np.ndarray, n_colors: int) -> tuple:
        """Extract color palette and create a square grid with hex codes.
        
        Returns:
            tuple: (palette_image, hex_codes_list)
        """
        import math
        
        # Extract dominant colors using K-means
        if HAS_SKLEARN:
            h, w, c = image_np.shape
            pixels = image_np.reshape(-1, c)
            
            kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=10)
            kmeans.fit(pixels)
            colors = kmeans.cluster_centers_
        else:
            # Fallback: sample colors from image
            h, w, c = image_np.shape
            step = max(1, (h * w) // n_colors)
            pixels = image_np.reshape(-1, c)
            indices = np.linspace(0, len(pixels)-1, n_colors, dtype=int)
            colors = pixels[indices]
        
        # Convert colors to hex codes
        hex_codes = []
        for color in colors:
            r, g, b = [int(c * 255) for c in color[:3]]
            hex_codes.append(f"#{r:02X}{g:02X}{b:02X}")
        
        # Calculate grid dimensions (as square as possible)
        cols = int(math.ceil(math.sqrt(n_colors)))
        rows = int(math.ceil(n_colors / cols))
        
        # Create palette image
        swatch_size = 64  # Size of each color swatch
        text_height = 20  # Height for hex code text
        
        palette_h = rows * (swatch_size + text_height)
        palette_w = cols * swatch_size
        
        palette_img = np.ones((palette_h, palette_w, 3), dtype=np.float32)  # White background
        
        # Draw color swatches
        for idx, color in enumerate(colors):
            row = idx // cols
            col = idx % cols
            
            y_start = row * (swatch_size + text_height)
            y_end = y_start + swatch_size
            x_start = col * swatch_size
            x_end = x_start + swatch_size
            
            # Fill swatch with color
            palette_img[y_start:y_end, x_start:x_end] = color[:3]
            
            # Draw hex code text area (darker shade of color)
            text_y_start = y_end
            text_y_end = y_start + swatch_size + text_height
            palette_img[text_y_start:text_y_end, x_start:x_end] = color[:3] * 0.7
        
        return (palette_img, hex_codes)
    
    # ========================================================================
    # Filename Building (same as FileSaver)
    # ========================================================================
    
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
        code_map = {
            "PRE": prefix,
            "PRJ": project,
            "BN": base_name,
            "ET": export_type,
            "SUF": suffix,
            "TS": timestamp,
            "CID": collision_id,
        }
        
        codes = [c.strip() for c in order.split(",")]
        components = [code_map.get(code, "") for code in codes if code_map.get(code, "")]
        
        filename = separator.join(components)
        if not filename:
            filename = "output"
        
        return self._sanitize_filename(filename)
    
    def _sanitize_filename(self, filename: str) -> str:
        """Remove invalid filename characters."""
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, "_")
        return filename
    
    # ========================================================================
    # Image Saving
    # ========================================================================
    
    def _save_image(
        self,
        image: np.ndarray,
        path: str,
        export_with_metadata: bool,
        export_with_workflow: bool,
        export_type: str,
        project_name: str,
        base_name: str,
        collision_id: str,
        timestamp: str,
        user_notes: str,
        extra_meta: dict,
        prompt,
        extra_pnginfo,
    ):
        """Save image to disk with optional metadata."""
        # Convert to 8-bit
        image_uint8 = (image * 255).clip(0, 255).astype(np.uint8)
        pil_image = Image.fromarray(image_uint8)
        
        # Prepare metadata
        metadata = PngInfo()
        
        if export_with_metadata:
            shima_meta = {
                "export_type": export_type,
                "project": project_name,
                "base_name": base_name,
                "collision_id": collision_id,
                "timestamp": timestamp,
            }
            if user_notes.strip():
                shima_meta["user_notes"] = user_notes
            # Include extra metadata (e.g., palette hex codes)
            if extra_meta:
                shima_meta.update(extra_meta)
            metadata.add_text("shima", json.dumps(shima_meta))
        
        if export_with_workflow:
            if prompt is not None:
                metadata.add_text("prompt", json.dumps(prompt))
            if extra_pnginfo is not None:
                for key, value in extra_pnginfo.items():
                    metadata.add_text(key, json.dumps(value))
        
        pil_image.save(path, pnginfo=metadata)
    
    @staticmethod
    def _generate_id(length: int = 6) -> str:
        """Generate a random alphanumeric ID."""
        chars = string.ascii_uppercase + string.digits
        return ''.join(random.choice(chars) for _ in range(length))


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.MultiSaver": ShimaMultiSaver,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.MultiSaver": "Shima Multi Saver",
}
