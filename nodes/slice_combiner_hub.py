import torch
import torch.nn.functional as F

class ShimaSliceCombinerHub:
    """
    Robustly merges individual slices or batches back into a single image.
    Supports centered padding for dimension-mismatched pieces and alpha-blending.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "orientation": (["Vertical", "Horizontal"], {"default": "Vertical"}),
                "overlap": ("INT", {"default": 64, "min": 0, "max": 1024, "step": 1}),
                "feather_size": ("INT", {"default": 32, "min": 0, "max": 512, "step": 1}),
                "feathering": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "image_batch": ("IMAGE",),
                "S1": ("IMAGE",),
                "S2": ("IMAGE",),
                "S3": ("IMAGE",),
                "S4": ("IMAGE",),
                "S5": ("IMAGE",),
                "S6": ("IMAGE",),
                "S7": ("IMAGE",),
                "S8": ("IMAGE",),
                "S9": ("IMAGE",),
                "S10": ("IMAGE",),
                "sliced_commons": ("SLICED_COMMONS",),
                "allow_external_linking": ("BOOLEAN", {"default": True}),
                "show_used_values": ("BOOLEAN", {"default": True}),
                "use_commonparams": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"

    def execute(self, orientation, overlap, feather_size, feathering=True, image_batch=None, sliced_commons=None, **kwargs):
        # 1. Override with Sliced Commons if available
        if sliced_commons:
            orientation = sliced_commons.get("orientation", orientation)
            overlap = sliced_commons.get("overlap", overlap)
            feather_size = sliced_commons.get("feather_size", feather_size)
            feathering = sliced_commons.get("feathering", feathering)

        # Handle Feathering Toggle
        if not feathering:
            overlap = 0
            feather_size = 0

        # Sync Case
        orient = orientation.lower()
        is_vert = (orient == "vertical") # Vertical strips (stack along X)

        # 1. Collect all valid slices
        slices = []
        if image_batch is not None:
            # Split batch into individual tensors [1, H, W, C]
            slices.extend([image_batch[i:i+1, ...] for i in range(image_batch.shape[0])])
        
        for i in range(1, 11):
            s_key = f"S{i}"
            if s_key in kwargs and kwargs[s_key] is not None:
                slices.append(kwargs[s_key])
        
        if not slices:
            return (torch.zeros((1, 64, 64, 3)),)

        # 2. Robust Alignment (Center & Pad to largest)
        max_h = max(s.shape[1] for s in slices)
        max_w = max(s.shape[2] for s in slices)
        
        processed_slices = []
        for s in slices:
            curr_h, curr_w = s.shape[1], s.shape[2]
            if curr_h != max_h or curr_w != max_w:
                # Calculate padding
                pad_h = max_h - curr_h
                pad_w = max_w - curr_w
                
                # Center pad: (left, right, top, bottom)
                p_left = pad_w // 2
                p_right = pad_w - p_left
                p_top = pad_h // 2
                p_bottom = pad_h - p_top
                
                # F.pad expects (W_left, W_right, H_top, H_bottom) for 4D input [N, C, H, W]
                # Our input is [N, H, W, C], so permute first
                s_padded = F.pad(s.permute(0, 3, 1, 2), (p_left, p_right, p_top, p_bottom)).permute(0, 2, 3, 1)
                processed_slices.append(s_padded)
            else:
                processed_slices.append(s)

        # 3. Merge Logic (Alpha Blending)
        num_slices = len(processed_slices)
        if is_vert:
            # Vertical strips - stacked horizontally (X axis)
            canvas_h = max_h
            canvas_w = sum(s.shape[2] for s in processed_slices) - (num_slices - 1) * overlap
        else:
            # Horizontal rows - stacked vertically (Y axis)
            canvas_h = sum(s.shape[1] for s in processed_slices) - (num_slices - 1) * overlap
            canvas_w = max_w

        canvas = torch.zeros((1, canvas_h, canvas_w, 3), device=processed_slices[0].device)
        
        curr_pos = 0
        for i, s in enumerate(processed_slices):
            h, w = s.shape[1], s.shape[2]
            
            if i == 0:
                # First slice, just place it
                if is_vert:
                    canvas[:, :, 0:w, :] = s
                    curr_pos = w - overlap
                else:
                    canvas[:, 0:h, :, :] = s
                    curr_pos = h - overlap
            else:
                # Subsequent slices, blend
                if overlap > 0 and feather_size > 0:
                    actual_feather = min(feather_size, overlap)
                    mask = torch.ones((h, w), device=s.device)
                    
                    if is_vert:
                        # Gradient on LEFT edge (joining horizontally)
                        mask[:, 0:actual_feather] = torch.linspace(0, 1, actual_feather, device=s.device).view(1, -1)
                        
                        x_start = curr_pos
                        x_end = min(x_start + w, canvas_w)
                        slice_crop_w = x_end - x_start
                        
                        target = canvas[:, :, x_start:x_end, :]
                        source = s[:, :, 0:slice_crop_w, :]
                        m = mask[:, 0:slice_crop_w].view(1, h, slice_crop_w, 1)
                        
                        canvas[:, :, x_start:x_end, :] = target * (1.0 - m) + source * m
                        curr_pos += (w - overlap)
                    else:
                        # Gradient on TOP edge (joining vertically)
                        mask[0:actual_feather, :] = torch.linspace(0, 1, actual_feather, device=s.device).view(-1, 1)
                        
                        y_start = curr_pos
                        y_end = min(y_start + h, canvas_h)
                        slice_crop_h = y_end - y_start
                        
                        target = canvas[:, y_start:y_end, :, :]
                        source = s[:, 0:slice_crop_h, :, :]
                        m = mask[0:slice_crop_h, :].view(1, slice_crop_h, w, 1)
                        
                        canvas[:, y_start:y_end, :, :] = target * (1.0 - m) + source * m
                        curr_pos += (h - overlap)
                else:
                    # Simple overwrite/stack
                    if is_vert:
                        x_start = curr_pos
                        x_end = min(x_start + w, canvas_w)
                        canvas[:, :, x_start:x_end, :] = s[:, :, 0:(x_end-x_start), :]
                        curr_pos += (w - overlap)
                    else:
                        y_start = curr_pos
                        y_end = min(y_start + h, canvas_h)
                        canvas[:, y_start:y_end, :, :] = s[:, 0:(y_end-y_start), :, :]
                        curr_pos += (h - overlap)

        used_values = [
            f"Orientation: {orientation}",
            f"Slices: {num_slices}",
            f"Overlap: {overlap}px",
            f"Final Res: {canvas_w}x{canvas_h}"
        ]
        
        return {"ui": {"used_values": used_values}, "result": (canvas,)}

NODE_CLASS_MAPPINGS = {
    "Shima.SliceCombinerHub": ShimaSliceCombinerHub
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.SliceCombinerHub": "🏗️ Slice Combiner Hub"
}
