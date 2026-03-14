import os
import folder_paths

class ShimaHeadline:
    """
    Utility node for multiline text headings on the canvas.
    Displays text with custom fonts, colors, and sizes via frontend.
    """
    
    FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fonts")

    @classmethod
    def INPUT_TYPES(cls):
        # Scan Fonts Dir
        if not os.path.exists(cls.FONTS_DIR):
            os.makedirs(cls.FONTS_DIR, exist_ok=True)
            
        font_files = [f for f in os.listdir(cls.FONTS_DIR) if f.lower().endswith((".ttf", ".otf"))]
        if not font_files:
            font_files = ["default"]
            
        return {
            "required": {
                "text": ("STRING", {"default": "HEADLINE", "multiline": True}),
                "font_name": (sorted(font_files), {"default": sorted(font_files)[0] if font_files else "default"}),
                "font_size": ("INT", {"default": 80, "min": 10, "max": 500}),
                "alignment": (["Left", "Center", "Right"], {"default": "Center"}),
                "color": ("STRING", {"default": "#FFFFFF"}),
                "opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "Shima/Design"
    OUTPUT_NODE = True 

    def execute(self, text, font_name, font_size, alignment, color, opacity):
        # The frontend handles the visual rendering on canvas.
        # This node is decorative and has no output.
        return {}

NODE_CLASS_MAPPINGS = {
    "Shima.Headline": ShimaHeadline,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Headline": "Shima Headline (Branding)",
}
