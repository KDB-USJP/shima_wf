import torch
import torch.nn.functional as F
import numpy as np
from PIL import Image, ImageOps

class ShimaBoundingBoxPicker:
    """
    Interactive Bounding Box Picker for ComfyUI.
    Outputs a cropped image, a binary mask of the crop location, and standard X,Y,W,H dictionary data.
    """
    @classmethod
    def INPUT_TYPES(cls):
        import folder_paths
        import os
        
        input_dir = folder_paths.get_input_directory()
        input_files = []
        if os.path.exists(input_dir):
            for f in os.listdir(input_dir):
                if os.path.isfile(os.path.join(input_dir, f)):
                    input_files.append(f)
                    
        if not input_files:
            input_files = ["none"]
            
        return {
            "required": {
                "image_path": (input_files, ), 
                "crop_x": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}), 
                "crop_y": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}), 
                "crop_w": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "crop_h": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "aspect_ratio": (["Free", "Custom", "1:1 Square", "4:3 Standard", "16:9 Widescreen", "21:9 Ultrawide", "3:2 Photo", "IP-Adapter (224x224)"],),
                "orientation": (["landscape", "portrait", "auto"], {"default": "landscape"}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "If connected, overrides the internal image_path loader."}),
                "shima.commonparams": ("DICT", {"tooltip": "If connected, frontend can read target width/height for custom ratio."})
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "DICT")
    RETURN_NAMES = ("cropped_image", "crop_mask", "crop_data")
    FUNCTION = "crop_image"
    CATEGORY = "Shima/ControlNet"

    def load_image_from_path(self, image_path):
        import folder_paths
        import os
        
        # Security/resolution logic similar to standard Load Image
        # To avoid path traversal, typically we resolve against input dir
        input_dir = folder_paths.get_input_directory()
        # Handle subfolders appropriately
        full_path = os.path.normpath(os.path.join(input_dir, image_path))
        if not full_path.startswith(input_dir):
            raise Exception("Invalid image path format.")
            
        if not os.path.exists(full_path):
            raise Exception(f"Image not found: {full_path}")
            
        i = Image.open(full_path)
        i = ImageOps.exif_transpose(i)
        
        if i.mode == 'I':
            i = i.point(lambda i: i * (1 / 255))
        image = i.convert("RGB")
        image = np.array(image).astype(np.float32) / 255.0
        image = torch.from_numpy(image)[None,]
        return image

    def crop_image(self, image_path, crop_x, crop_y, crop_w, crop_h, aspect_ratio, image=None, **kwargs):
        # 1. Resolve Input Tensor
        if image is not None:
            input_tensor = image
        else:
            if not image_path:
                raise ValueError("Shima.BoundingBoxPicker requires an 'image' input or a selected 'image_path'.")
            input_tensor = self.load_image_from_path(image_path)
            
        # 2. Extract Dimensions
        # Input format is [B, H, W, C]
        b, img_h, img_w, c = input_tensor.shape
        
        # 3. Calculate absolute pixel coordinates from normalized normalized values
        # Clamping to ensure we don't go out of bounds due to floating point rounding
        start_x = max(0, int(crop_x * img_w))
        start_y = max(0, int(crop_y * img_h))
        end_x = min(img_w, start_x + int(crop_w * img_w))
        end_y = min(img_h, start_y + int(crop_h * img_h))
        
        real_w = end_x - start_x
        real_h = end_y - start_y
        
        if real_w <= 0 or real_h <= 0:
            raise ValueError(f"Invalid crop dimensions: {real_w}x{real_h}. Please check your crop window.")
            
        # 4. Perform Slicing [B, H, W, C]
        cropped_tensor = input_tensor[:, start_y:end_y, start_x:end_x, :]
        
        # 5. Handle Specialized Aspect Ratios (IP-Adapter Strict Scaling)
        if aspect_ratio == "IP-Adapter (224x224)":
            # IP-Adapter clip vision prefers exact 224x224 interpolation
            # We must permute to [B, C, H, W] for interpolation
            bchw = cropped_tensor.permute(0, 3, 1, 2)
            bchw_resized = F.interpolate(bchw, size=(224, 224), mode="bicubic", align_corners=False)
            cropped_tensor = bchw_resized.permute(0, 2, 3, 1)
            
        # 6. Generate MASK [B, H, W]
        # Pad with zeros to match original image dimensions.
        # The cropped area will be 1.0 (white), the rest 0.0 (black).
        mask = torch.zeros((b, img_h, img_w), dtype=torch.float32, device=input_tensor.device)
        mask[:, start_y:end_y, start_x:end_x] = 1.0
        
        # 7. Package outputs
        crop_data = {
            "x": start_x,
            "y": start_y,
            "width": real_w,
            "height": real_h,
            "norm_x": crop_x,
            "norm_y": crop_y,
            "norm_w": crop_w,
            "norm_h": crop_h,
            "original_width": img_w,
            "original_height": img_h
        }
        
        return (cropped_tensor, mask, crop_data)

NODE_CLASS_MAPPINGS = {
    "Shima.BoundingBoxPicker": ShimaBoundingBoxPicker
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.BoundingBoxPicker": "Shima Interactive Crop"
}
