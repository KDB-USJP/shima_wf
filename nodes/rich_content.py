"""
Shima RichContent - Multimedia display nodes (Supplier/Viewer).
"""

class ShimaContent:
    """
    Supplier node: Defines content (HTML, Markdown, etc.) and bundles it for display.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "content_type": (["HTML", "Markdown", "URL", "Image", "Video"], {"default": "HTML"}),
                "title": ("STRING", {"default": "My Notes", "multiline": False}),
                "content": ("STRING", {"default": "<h1>Hello World</h1>", "multiline": True}),
                "show_title": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "input_content": ("STRING", {"forceInput": True}),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }

    RETURN_TYPES = ("CONTENT_BUNDLE",)
    RETURN_NAMES = ("content_bundle",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, content_type, title, content, show_title, input_content=None, **kwargs):
        # Prefer input_content if connected
        final_content = input_content if input_content is not None else content
        
        bundle = {
            "type": content_type,
            "title": title,
            "content": final_content,
            "show_title": show_title
        }
        
        return (bundle,)

class ShimaRichDisplay:
    """
    Viewer node: Displays a CONTENT_BUNDLE.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "content_bundle": ("CONTENT_BUNDLE",),
            },
            "optional": {
                "title_override": ("STRING", {"multiline": False}), # Optional view title?
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }

    RETURN_TYPES = ("CONTENT_BUNDLE",)
    RETURN_NAMES = ("content_bundle",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, content_bundle, title_override=None, **kwargs):
        # Prepare UI payload
        # If title_override is set, we might modify the bundle for display, 
        # but usually we just pass the bundle.
        
        display_data = content_bundle.copy()
        if title_override:
            display_data["title"] = title_override
            
        # Send to frontend
        return {
            "ui": {
                "content": [display_data["content"]],
                "type": [display_data["type"]],
                "title": [display_data["title"]],
                "show_title": [display_data["show_title"]]
            },
            "result": (content_bundle,)
        }

NODE_CLASS_MAPPINGS = {
    "Shima.Content": ShimaContent,
    "Shima.RichDisplay": ShimaRichDisplay,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Content": "Shima Content (Supplier)",
    "Shima.RichDisplay": "Shima Rich Display (Viewer)",
}
