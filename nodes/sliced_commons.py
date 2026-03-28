class ShimaSlicedCommons:
    """
    Centralized configuration for the Shima Sliced ecosystem.
    Broadcasts slicing parameters to Upscalers and Hubs.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "orientation": (["Vertical", "Horizontal"], {"default": "Vertical"}),
                "slices": ("INT", {"default": 4, "min": 2, "max": 10, "step": 1}),
                "overlap": ("INT", {"default": 64, "min": 0, "max": 1024, "step": 1}),
                "feather_size": ("INT", {"default": 32, "min": 0, "max": 512, "step": 1}),
                "feathering": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("SLICED_COMMONS",)
    RETURN_NAMES = ("sliced_commons",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"

    def execute(self, orientation, slices, overlap, feather_size, feathering):
        # If feathering is OFF, force hard-edges in the broadcast
        if not feathering:
            overlap = 0
            feather_size = 0
            
        sliced_commons = {
            "orientation": orientation,
            "slices": slices,
            "overlap": overlap,
            "feather_size": feather_size,
            "feathering": feathering
        }
        
        return (sliced_commons,)

NODE_CLASS_MAPPINGS = {
    "Shima.SlicedCommons": ShimaSlicedCommons
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.SlicedCommons": "🏝️ Sliced Commons"
}
