"""
Shima.DataPreviewTest - Testing Node for Used Values Display & Widget Highlighting

This is a prototype to test:
1. Displaying which values are actually being used (commonparams vs hardcoded)
2. Highlighting critical widgets (like use_commonparams) with custom colors
"""


class ShimaDataPreviewTest:
    """
    Test node with hardcoded values that can be overridden by shima.commonparams.
    Displays which values are being used in a text box.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Hardcoded test values
                "test_seed": ("INT", {
                    "default": 42,
                    "min": 0,
                    "max": 0xffffffffffffffff,
                    "tooltip": "Hardcoded seed value"
                }),
                "test_width": ("INT", {
                    "default": 512,
                    "min": 64,
                    "max": 8192,
                    "step": 8,
                    "tooltip": "Hardcoded width"
                }),
                "test_height": ("INT", {
                    "default": 512,
                    "min": 64,
                    "max": 8192,
                    "step": 8,
                    "tooltip": "Hardcoded height"
                }),
                "test_project": ("STRING", {
                    "default": "TestProject",
                    "tooltip": "Hardcoded project name"
                }),
                "test_model": (["sdxl", "sd1.5", "sd3", "flux"], {
                    "default": "sdxl",
                    "tooltip": "Hardcoded model type"
                }),
            },
            "optional": {
                # Shima commonparams input
                "shima.commonparams": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Configuration bundle from Shima.Commons"
                }),
                
                # THE CRITICAL SWITCH - we'll try to make this green
                "use_commonparams": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "🟢 If TRUE, use values from Shima.Commons instead of hardcoded values",
                    # Custom metadata for JS to read
                    "shima_highlight_color": "#00ff00",  # Green highlight
                    "shima_is_critical": True  # Mark as critical widget
                }),
                
                # External linking toggle (for testing bottom icon)
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "🔗 Allow external nodes to link to this node's outputs"
                }),
                
                # Toggle to show/hide the data display box
                "show_used_values": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Show/hide the used values display box"
                }),

                # --- MULTISAVER PREVIEW CONTROLS ---
                
                # Line Art
                "line_art_invert": ("BOOLEAN", {
                    "default": False, 
                    "tooltip": "Invert line art (Black on White vs White on Black)"
                }),
                
                # Canny
                "canny_high": ("INT", {"default": 200, "min": 0, "max": 255}),
                "canny_low": ("INT", {"default": 100, "min": 0, "max": 255}),
                
                # Depth
                "depth_model": (["depth_anything_v2_vitl", "depth_anything_v2_vitb"], {
                    "default": "depth_anything_v2_vitl"
                }),
                
                # Normal
                "normal_model": (["dsine", "bae"], {"default": "dsine"}),
                "normal_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.1}),
                
                # Palette
                "palette_colors": ("INT", {"default": 8, "min": 2, "max": 256, "step": 1}),
                
                # Highlights
                "highlight_threshold": ("FLOAT", {"default": 0.8, "min": 0.0, "max": 1.0, "step": 0.01}),
                
                # Shadows
                "shadow_threshold": ("FLOAT", {"default": 0.2, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }
    
    RETURN_TYPES = ("DICT", "STRING")
    RETURN_NAMES = ("data", "used_values_text")
    FUNCTION = "execute"
    CATEGORY = "Shima/Hidden"
    OUTPUT_NODE = True  # Allow execution without downstream connections
    
    DESCRIPTION = "Test node to demonstrate used-values display and widget highlighting"
    
    def execute(
        self,
        test_seed,
        test_width,
        test_height,
        test_project,
        test_model,
        use_commonparams=False,
        # Optional inputs
        line_art_invert=False,
        canny_high=200,
        canny_low=100,
        depth_model="depth_anything_v2_vitl",
        normal_model="dsine",
        normal_strength=1.0,
        palette_colors=8,
        highlight_threshold=0.8,
        shadow_threshold=0.2,
        **kwargs
    ):
        # Get commonparams if provided
        commonparams = kwargs.get("shima.commonparams", None)
        
        # Determine which values to use
        if use_commonparams and commonparams:
            # Use values from commonparams
            final_seed = commonparams.get("seed", test_seed)
            final_width = commonparams.get("width", test_width)
            final_height = commonparams.get("height", test_height)
            final_project = commonparams.get("project_name", test_project)
            final_model = commonparams.get("model_type", test_model)
            source = "shima.commonparams"
        else:
            # Use hardcoded values
            final_seed = test_seed
            final_width = test_width
            final_height = test_height
            final_project = test_project
            final_model = test_model
            source = "hardcoded"
        
        # Build the data output
        data = {
            "seed": final_seed,
            "width": final_width,
            "height": final_height,
            "project_name": final_project,
            "model_type": final_model,
            "source": source
        }
        
        # Build the "used values" text for display
        # This will be sent to the frontend to display in a text box
        used_values_text = f"""seed: {final_seed}
width: {final_width}
height: {final_height}
project: {final_project}
model: {final_model}
--------------------
Source: {source}"""
        
        # Console output for debugging
        print(f"[DataPreviewTest] Using {source} values:")
        print(f"  Seed: {final_seed}")
        print(f"  Dimensions: {final_width}x{final_height}")
        print(f"  Project: {final_project}")
        print(f"  Model: {final_model}")
        
        # Return both the data dict and the text for UI display
        return {
            "ui": {
                "used_values": [used_values_text]  # This will be picked up by JS
            },
            "result": (data, used_values_text)
        }


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.DataPreviewTest": ShimaDataPreviewTest,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.DataPreviewTest": "🧪 Data Preview Test",
}
