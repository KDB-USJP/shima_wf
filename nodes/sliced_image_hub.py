import torch

class ShimaSlicedImageHub:
    """
    Receives an IMAGE batch (e.g. from Sliced Upscaler) and splits it into
    up to 10 individual IMAGE streams for custom per-slice processing.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_batch": ("IMAGE",),
            },
            "optional": {
                "feathering": ("BOOLEAN", {"default": True}),
                "sliced_commons": ("SLICED_COMMONS",),
                "allow_external_linking": ("BOOLEAN", {"default": True}),
                "show_used_values": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("INT", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("count", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10")
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"

    def execute(self, image_batch, feathering=True, sliced_commons=None, **kwargs):
        if sliced_commons:
            feathering = sliced_commons.get("feathering", feathering)

        if image_batch is None:
            return (0,) + (torch.zeros((1, 64, 64, 3)),) * 10

        # image_batch format: [Batch, H, W, C]
        count = image_batch.shape[0]
        
        # Split the batch into individual tensors of shape [1, H, W, C]
        slices = [image_batch[i:i+1, ...] for i in range(count)]
        
        outputs = []
        for i in range(10):
            if i < count:
                outputs.append(slices[i])
            else:
                # Return an empty black 64x64 image to avoid workflow breakage if connected improperly
                outputs.append(torch.zeros((1, 64, 64, 3), device=image_batch.device))
        
        used_values = [f"Count: {count}", f"Feathering: {feathering}"]
        return {"ui": {"used_values": used_values}, "result": (count, *outputs)}

NODE_CLASS_MAPPINGS = {
    "Shima.SlicedImageHub": ShimaSlicedImageHub
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.SlicedImageHub": "🏝️ Sliced Image Hub"
}
