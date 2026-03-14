"""
Shima Sticker - Decorative branding node.
"""

class ShimaSticker:
    """
    Decorative node that displays an image (URL) with transparency.
    """
    @classmethod
    def INPUT_TYPES(cls):
        import os
        # Scan for images in sticker_images/PNG and SVG
        nodes_dir = os.path.dirname(__file__)
        root_dir = os.path.dirname(nodes_dir)
        sticker_root = os.path.join(root_dir, "sticker_images")
        
        files = []
        if os.path.exists(sticker_root):
            for subdir in ["PNG", "SVG"]:
                sub_path = os.path.join(sticker_root, subdir)
                if os.path.exists(sub_path):
                    valid_exts = ('.png', '.jpg', '.jpeg', '.svg', '.webp')
                    found = [f for f in os.listdir(sub_path) if f.lower().endswith(valid_exts)]
                    sub_files = [f"{subdir}/{f}" for f in found]
                    sub_files.sort()
                    files.extend(sub_files)

            
        return {
            "required": {
                "logo": (files if files else ["PNG/default.png"], {"default": files[0] if files else "PNG/default.png"}),
                "opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.1}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 5.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "Shima/Design"
    OUTPUT_NODE = True 
    
    def execute(self, logo, opacity, scale):
        # Passive node, does nothing on backend
        return {}

NODE_CLASS_MAPPINGS = {
    "Shima.Sticker": ShimaSticker,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Sticker": "Shima Sticker (Branding)",
}
