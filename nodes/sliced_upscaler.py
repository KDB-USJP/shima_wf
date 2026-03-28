import torch
import torch.nn.functional as F
import numpy as np
import os
from PIL import Image
import folder_paths
from comfy_extras.nodes_upscale_model import ImageUpscaleWithModel

class ShimaSlicedUpscaler:
    """
    Sequentially upscales images in horizontal or vertical slices to manage VRAM.
    Uses feathered blending for seamless joins.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "orientation": (["Vertical", "Horizontal"], {"default": "Vertical"}),
                "slices": ("INT", {"default": 4, "min": 2, "max": 10, "step": 1}),
                "overlap": ("INT", {"default": 64, "min": 0, "max": 1024, "step": 1}),
                "feather_size": ("INT", {"default": 32, "min": 0, "max": 512, "step": 1}),
            },
            "optional": {
                "upscale_model": ("UPSCALE_MODEL",),
                "feathering": ("BOOLEAN", {"default": True}),
                "save_pieces": ("BOOLEAN", {"default": False}),
                "sliced_commons": ("SLICED_COMMONS",),
                "shima.commonparams": ("DICT", {"forceInput": True}),
                "use_commonparams": ("BOOLEAN", {"default": True}),
                "active": ("BOOLEAN", {"default": True, "forceInput": True}),
                "output_dir": ("STRING", {"default": "shima_upscale_slices"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image", "slices")
    FUNCTION = "upscale"
    CATEGORY = "Shima/Image"

    def upscale(self, image, orientation, slices, overlap, feather_size, upscale_model=None, feathering=True, save_pieces=False, active=True, output_dir="shima_upscale_slices", sliced_commons=None, **kwargs):
        # 0. Handle Shima CommonParams & Active State
        if not active:
            return (image, image)

        # 1. Override with Sliced Commons if available
        if sliced_commons:
            orientation = sliced_commons.get("orientation", orientation)
            slices = sliced_commons.get("slices", slices)
            overlap = sliced_commons.get("overlap", overlap)
            feather_size = sliced_commons.get("feather_size", feather_size)
            feathering = sliced_commons.get("feathering", feathering)

        shima_commonparams = kwargs.get("shima.commonparams")
        use_commonparams = kwargs.get("use_commonparams", True)
        
        if use_commonparams and shima_commonparams:
            if "project_name" in shima_commonparams and output_dir == "shima_upscale_slices":
                project = shima_commonparams.get("project_name", "Project")
                base = shima_commonparams.get("save_path", "output")
                output_dir = os.path.join(base, project, "upscale_slices")

        # Handle Feathering Toggle
        if not feathering:
            overlap = 0
            feather_size = 0

        # Handle Upscale Bypass (1x Mode)
        scale = 1
        if upscale_model is not None:
            probe = image[:, :8, :8, :]
            upscaler = ImageUpscaleWithModel()
            probed = upscaler.upscale(upscale_model, probe)[0]
            scale = probed.shape[2] // probe.shape[2]
            del probe, probed

        if slices <= 1:
            if upscale_model is not None:
                upscaler = ImageUpscaleWithModel()
                res = upscaler.upscale(upscale_model, image)[0]
            else:
                res = image
            return {"ui": {"used_values": ["Mode: Full Pass (1 slice)"]}, "result": (res, res)}

        # 2. Dimensions
        b, h, w, c = image.shape
        h_up, w_up = h * scale, w * scale
        
        output_canvas = torch.zeros((b, c, h_up, w_up), device=image.device)
        weight_canvas = torch.zeros((b, 1, h_up, w_up), device=image.device)
        
        # Collection for the slices output
        slices_list = []

        # Secure output dir
        full_out_path = os.path.join(folder_paths.get_output_directory(), output_dir)
        if save_pieces:
            os.makedirs(full_out_path, exist_ok=True)

        # 3. Slicing Loop
        orient = orientation.lower()
        is_vert = (orient == "vertical") # Vertical strips (slice X)
        dim_size = w if is_vert else h
        slice_dim_size = dim_size // slices
        
        for i in range(slices):
            d0 = i * slice_dim_size
            d1 = (i + 1) * slice_dim_size
            if i == slices - 1: d1 = dim_size
            
            d0_ov = max(0, d0 - overlap)
            d1_ov = min(dim_size, d1 + overlap)
            
            if is_vert:
                crop = image[:, :, d0_ov:d1_ov, :]
            else:
                crop = image[:, d0_ov:d1_ov, :, :]
            
            # Upscale or Identity
            if upscale_model is not None:
                upscaler = ImageUpscaleWithModel()
                upscaled_patch = upscaler.upscale(upscale_model, crop)[0]
            else:
                upscaled_patch = crop
                
            patch = upscaled_patch.permute(0, 3, 1, 2)
            _, _, ph, pw = patch.shape
            
            # Collect for slices output (we only take the 'core' slice, matching Hub expectations)
            # Actually, Hub expects the upscaled result of each slice. 
            # We'll provide the 'core' part or the whole overlapped patch? 
            # User wants to process slices. Usually they want the core slices.
            # But if they want to merge them back later, they need the overlap.
            # We'll return the full upscaled patches as a batch. 
            # NOTE: Batching images requires them to be same size.
            # If d1_ov - d0_ov is not constant (e.g. at the end), we'll pad or resize?
            # Usually users use equal slices, so it should be fine. 
            slices_list.append(upscaled_patch)

            if save_pieces:
                piece_np = (upscaled_patch[0].cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
                piece_img = Image.fromarray(piece_np)
                piece_img.save(os.path.join(full_out_path, f"slice_{i:02d}_{orientation}.png"))

            mask = torch.ones_like(patch[:, :1, :, :])
            f_px = feather_size * scale
            
            # Top/Left Feather
            if i > 0:
                join_pos = (d0 - d0_ov) * scale
                f_start = join_pos - f_px
                f_end = join_pos + f_px
                f_start = max(0, f_start)
                f_end = min(ph if is_vert else pw, f_end)
                
                if f_end > f_start:
                    coords = torch.linspace(0, 1, int(f_end - f_start), device=patch.device)
                    if is_vert:
                        mask[:, :, int(f_start):int(f_end), :] = coords.view(1, 1, -1, 1)
                        mask[:, :, :int(f_start), :] = 0.0
                    else:
                        mask[:, :, :, int(f_start):int(f_end)] = coords.view(1, 1, 1, -1)
                        mask[:, :, :, :int(f_start)] = 0.0

            # Bottom/Right Feather
            if i < slices - 1:
                join_pos = (d1 - d0_ov) * scale
                f_start = join_pos - f_px
                f_end = join_pos + f_px
                f_start = max(0, f_start)
                f_end = min(ph if is_vert else pw, f_end)
                
                if f_end > f_start:
                    coords = torch.linspace(1, 0, int(f_end - f_start), device=patch.device)
                    if is_vert:
                        mask[:, :, :, int(f_start):int(f_end)] = coords.view(1, 1, 1, -1)
                        mask[:, :, :, int(f_end):] = 0.0
                    else:
                        mask[:, :, int(f_start):int(f_end), :] = coords.view(1, 1, -1, 1)
                        mask[:, :, int(f_end):, :] = 0.0

            # Accumulate on canvas
            p_y0 = d0_ov * scale if not is_vert else 0
            p_y1 = p_y0 + ph
            p_x0 = d0_ov * scale if is_vert else 0
            p_x1 = p_x0 + pw
            
            output_canvas[:, :, int(p_y0):int(p_y1), int(p_x0):int(p_x1)] += patch * mask
            weight_canvas[:, :, int(p_y0):int(p_y1), int(p_x0):int(p_x1)] += mask

            del crop, upscaled_patch, patch, mask
            if i % 2 == 0: torch.cuda.empty_cache()

        # 4. Final Normalization
        eps = 1e-6
        output_canvas /= (weight_canvas + eps)
        result = output_canvas.permute(0, 2, 3, 1).contiguous()
        
        # 4. Prepare the slices batch (padded to uniform size if necessary)
        # Find max dims for the batch
        max_sh = max(s.shape[1] for s in slices_list)
        max_sw = max(s.shape[2] for s in slices_list)
        
        final_slices_batch = []
        for s_up in slices_list:
            curr_sh, curr_sw = s_up.shape[1], s_up.shape[2]
            if curr_sh < max_sh or curr_sw < max_sw:
                p_bottom = max_sh - curr_sh
                p_right = max_sw - curr_sw
                # Use replicate padding to avoid black lines
                # permute to [B, C, H, W] for F.pad
                s_t = s_up.permute(0, 3, 1, 2)
                s_padded = F.pad(s_t, (0, p_right, 0, p_bottom), mode='replicate').permute(0, 2, 3, 1)
                final_slices_batch.append(s_padded)
            else:
                final_slices_batch.append(s_up)
        
        slices_batch = torch.cat(final_slices_batch, dim=0)
        
        used_values = [
            f"Orientation: {orientation}",
            f"Slices: {slices}",
            f"Scale: {scale}x",
            f"Feathering: {'ON' if feathering else 'OFF'}",
            f"Final Res: {w_up}x{h_up}"
        ]
        if upscale_model is None:
            used_values.insert(0, "Mode: Slicing Only (1x)")
            
        if save_pieces:
            used_values.append(f"Saved to: {output_dir}")

        del output_canvas, weight_canvas, slices_list, final_slices_batch
        return {"ui": {"used_values": used_values}, "result": (result, slices_batch)}

NODE_CLASS_MAPPINGS = {
    "Shima.SlicedUpscaler": ShimaSlicedUpscaler
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.SlicedUpscaler": "Shima Sliced Upscaler"
}
