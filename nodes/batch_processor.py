
import os
import torch
import numpy as np
import glob
from PIL import Image, ImageOps

class ShimaBatchImageProcessor:
    """
    Shima Batch Image Processor
    Iterates over a folder of images for sequential batch processing.
    Designed to work with a primitive INT node incrementing the 'index' on each run.
    """
    
    
    # Class-level state for internal counters and tracking manual input changes
    _batch_counters = {}
    _last_input_index = {}
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "directory": ("STRING", {"default": "", "multiline": False, "tooltip": "Path to image folder"}),
                "index_mode": (["increment", "decrement", "fixed", "randomize"], {"default": "increment", "tooltip": "How to select the image index"}),
                "index": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "Manual index (used when mode is 'fixed' or as start point)"}),
                "recursive": ("BOOLEAN", {"default": False, "tooltip": "Scan subfolders"}),
                "auto_queue": ("BOOLEAN", {"default": True, "tooltip": "Automatically queue next batch if current run finishes but images remain."}),
                "path_filter": ("STRING", {"default": "*.png, *.jpg, *.jpeg, *.webp", "tooltip": "Glob patterns to include (comma separated)"}),
                "path_exclude": ("STRING", {"default": "*_raw*, *_preview*, *_pose*, *_depth*, *_line*", "tooltip": "Glob patterns to exclude (comma separated). Crucial to prevent loops!"}),
                "safety_path": ("STRING", {"default": "", "multiline": False, "tooltip": "REQUIRED: Your EXPORT path. Must be different from directory!"}),
            },
            "optional": {
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING", "STRING", "INT", "INT")
    RETURN_NAMES = ("image", "mask", "parent_path", "relative_path", "filename", "current_index", "total_count")
    FUNCTION = "load_image"
    CATEGORY = "Shima/Image"
    
    DESCRIPTION = (
        "Iterates over a folder of images.\n"
        "NOTE: Set 'auto_queue' to True to process all images automatically without 100-run limit.\n"
        "The system will stop and raise an error when all images are finished."
    )
    
    @classmethod
    def IS_CHANGED(cls, directory, index_mode, index, recursive, unique_id=None, **kwargs):
        if index_mode != "fixed":
            return float("nan")
        return (directory, index, recursive)
    
    def load_image(self, directory, index_mode, index, recursive, path_filter, path_exclude, safety_path, auto_queue=True, unique_id=None):
        from server import PromptServer
        
        if not directory or not os.path.exists(directory):
            print(f"[ShimaBatch] Error: Directory not found: {directory}")
            raise FileNotFoundError(f"Directory not found: {directory}")
            
        # Strict Safety Check
        if not safety_path.strip():
             raise ValueError("[Shima Safety] You must specify a 'safety_path' (your export folder) to prevent overwriting source files.")
             
        abs_input = os.path.abspath(directory)
        abs_safe = os.path.abspath(safety_path)
        
        if abs_input == abs_safe:
            raise ValueError(f"[Shima Safety] CRITICAL: Input folder matches Output folder!\nInput: {abs_input}\nOutput: {abs_safe}\nChange them to avoid infinite feedback loops.")

        # Parse patterns
        import fnmatch
        includes = [p.strip() for p in path_filter.split(",") if p.strip()]
        excludes = [p.strip() for p in path_exclude.split(",") if p.strip()]

        # Scan for images
        files = []
        
        # Efficient Walk
        if recursive:
            for root, dirs, filenames in os.walk(directory):
                for filename in filenames:
                    if not any(fnmatch.fnmatch(filename, pattern) for pattern in includes):
                        continue
                    if any(fnmatch.fnmatch(filename, pattern) for pattern in excludes):
                        continue
                    files.append(os.path.join(root, filename))
        else:
            for filename in os.listdir(directory):
                path = os.path.join(directory, filename)
                if not os.path.isfile(path):
                    continue
                if not any(fnmatch.fnmatch(filename, pattern) for pattern in includes):
                    continue
                if any(fnmatch.fnmatch(filename, pattern) for pattern in excludes):
                        continue
                files.append(path)
                
        files = sorted(files)
        
        if not files:
            raise FileNotFoundError(f"[ShimaBatch] No images found in {directory} matching filter.")
            
        total_images = len(files)
        
        # Determine Index
        # Logic: If 'auto_queue' is ON, we assume single-step execution, so we respect the input widget fully.
        # If 'auto_queue' is OFF (Batch Mode), we use the divergence tracker to respect manual resets.
        
        if auto_queue:
            # Always trust the widget in auto-queue mode
            self._batch_counters[unique_id] = index
        else:
            # Legacy/Batch Mode checks
            if unique_id not in self._batch_counters:
                self._batch_counters[unique_id] = index 
                self._last_input_index[unique_id] = index
            
            # Check for manual reset (Divergence)
            # If the input 'index' is different from what we saw last time, user likely changed it manually.
            if unique_id in self._last_input_index and index != self._last_input_index[unique_id]:
                self._batch_counters[unique_id] = index
                self._last_input_index[unique_id] = index
            
        current_counter = self._batch_counters[unique_id]
        
        # Mode Logic
        if index_mode == "fixed":
            selected_index = index
            self._batch_counters[unique_id] = index
            
        elif index_mode == "increment":
            # Check if we are done
            if current_counter >= total_images:
                print(f"[ShimaBatch] Batch Complete: Processed {total_images} images.")
                # Clearer error message
                raise ValueError(f"Batch Limit Reached! Index ({current_counter}) >= Total Images ({total_images}).\nReset 'index' widget to 0 to restart.")
            
            selected_index = current_counter
            # Increment for next run
            self._batch_counters[unique_id] = current_counter + 1
            
        elif index_mode == "decrement":
            selected_index = current_counter
            self._batch_counters[unique_id] = (current_counter - 1) % total_images
            
        elif index_mode == "randomize":
            selected_index = np.random.randint(0, total_images)
            self._batch_counters[unique_id] = selected_index
            
        else:
            selected_index = 0
            
        # Select file
        final_index = selected_index if index_mode == "increment" else (selected_index % total_images)
        
        if final_index >= total_images: 
             raise ValueError(f"Batch Limit Reached! Index ({final_index}) >= Total Images ({total_images}).\nReset 'index' widget to 0 to restart.")
        
        current_file = files[final_index]
        print(f"[ShimaBatch] Processing {final_index + 1}/{total_images}: {os.path.basename(current_file)}")
        
        # --- Events & Auto-Queue ---
        # 1. Update Widget (Persist progress)
        # We send the NEXT index (what it will be next run) so if user reloads, it starts there.
        next_index = self._batch_counters.get(unique_id, final_index)
        PromptServer.instance.send_sync("shima-batch-update-index", {"node_id": unique_id, "new_index": next_index})
        
        # 2. Auto-Queue
        # If increment mode, and we have more files, and auto count is enabled
        if auto_queue and index_mode == "increment":
            if final_index < total_images - 1:
                # We have more files! Trigger auto-queue.
                # We use send_sync to ensure it reaches frontend.
                PromptServer.instance.send_sync("shima-batch-continue", {"node_id": unique_id})
        
        # Path details
        filename_stem = os.path.splitext(os.path.basename(current_file))[0]
        parent_path = os.path.dirname(current_file)
        
        try:
            rel_structure = os.path.relpath(parent_path, start=directory)
            if rel_structure == ".":
                rel_structure = ""
        except ValueError:
            rel_structure = ""
            
        # Load Image
        i = Image.open(current_file)
        i = ImageOps.exif_transpose(i)
        
        if i.mode != 'RGBA':
            i = i.convert('RGBA')
            
        image = np.array(i).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image)[None,]
        
        if 'A' in i.getbands():
            mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
            mask = torch.from_numpy(mask)
            mask = 1.0 - mask 
        else:
            mask = torch.zeros((64,64), dtype=torch.float32, device="cpu")
            
        image_rgb = image_tensor[:, :, :, :3]
            
        # Returned Order: Image, Mask, Parent, Relative, Filename
        return (image_rgb, mask, parent_path, rel_structure, filename_stem, final_index, total_images)

