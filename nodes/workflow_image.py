import os
import requests
import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageColor, ImageFilter, ImageOps
from datetime import datetime
import folder_paths

class ShimaWorkflowImage:
    """
    Generates a workflow cover image with Logo and Text overlay.
    Supports auto-downloading Google Fonts and various Logo presets.
    """
    
    FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fonts")
    
    FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fonts")

    @classmethod
    def INPUT_TYPES(cls):
        # Scan Input Dir for Logos
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        
        # Scan Fonts Dir
        if not os.path.exists(cls.FONTS_DIR):
            os.makedirs(cls.FONTS_DIR, exist_ok=True)
            
        font_files = [f for f in os.listdir(cls.FONTS_DIR) if f.lower().endswith((".ttf", ".otf"))]
        if not font_files:
            font_files = ["default"]
            
        return {
            "required": {
                "text_main": ("STRING", {"default": "SDXL", "multiline": False}),
                "text_sub": ("STRING", {"default": "workflow", "multiline": False}),
                "font_name": (sorted(font_files), {"default": sorted(font_files)[0]}),
                "main_font_size": ("INT", {"default": 80, "min": 10, "max": 500}),
                "sub_font_size": ("INT", {"default": 40, "min": 10, "max": 500}),
                "subtext_position": (["Above", "Below"], {"default": "Below"}),
                "text_spacing": ("INT", {"default": 5, "min": -100, "max": 200}),
                
                "logo_file": (sorted(files), {"image_upload": False}), # False = Dropdown only (Compact)
                "use_logo": ("BOOLEAN", {"default": True}),
                "logo_position": ([
                    "Top Left", "Top Right", "Bottom Left", "Bottom Right", 
                    "Center", 
                    "Center Large (Dark BG)", "Center Large (Light BG)"
                ], {"default": "Top Left"}),
                
                "save_mode": ("BOOLEAN", {"default": False, "tooltip": "Save to disk (overwriting previous run)"}),
            },
            "optional": {
                "base_image": ("IMAGE",),
                "custom_name": ("STRING", {"forceInput": True}),
                "shima.commonparams": ("DICT", {"forceInput": True}),
                "use_commonparams": ("BOOLEAN", {"default": True}),
                "allow_external_linking": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "generate"
    CATEGORY = "Shima/Design"
    OUTPUT_NODE = True 

    def _get_font(self, font_name, size):
        """Load font from local directory."""
        if font_name == "default":
            return ImageFont.load_default()
            
        font_path = os.path.join(self.FONTS_DIR, font_name)
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception as e:
                print(f"[Shima] Failed to load font {font_path}: {e}")
        
        # Fallback
        return ImageFont.load_default()

    def generate(self, text_main, text_sub, font_name, main_font_size, sub_font_size,
                 subtext_position, text_spacing,
                 logo_file, use_logo, logo_position, save_mode,
                 base_image=None, custom_name="", 
                 use_commonparams=True, allow_external_linking=True, **kwargs):
        
        # Handle dot notation input
        shima_commonparams = kwargs.get("shima.commonparams", None)
        
        # 1. Resolve Text (Bundle overrides text_model if present)
        if use_commonparams and shima_commonparams:
            bundled_mt = shima_commonparams.get("model_type")
            if bundled_mt:
                text_main = str(bundled_mt).upper()
        
        # Backwards compatible "full_text" if custom_name is used
        # If custom_name exists, we use it as the ONLY line (main text) and empty subtext
        if custom_name.strip():
            main_line = custom_name.strip()
            sub_line = ""
        else:
            main_line = text_main.strip()
            sub_line = text_sub.strip()
        
        # 2. Prepare Base Image
        if base_image is not None:
             img_tensor = base_image[0]
             img_np = (img_tensor.cpu().numpy() * 255.0).astype(np.uint8)
             image = Image.fromarray(img_np).convert("RGBA")
        else:
            image = Image.new("RGBA", (1024, 1024), (0, 0, 0, 255))
            
        width, height = image.size
        
        # ... (Logo Logic unchanged) ...
        # [LOGO COMPOSITING SNIPPET START]
        if "Center Large" in logo_position:
             bg_color = (3, 3, 3) if "Dark" in logo_position else (238, 238, 238)
             image = Image.new("RGBA", (width, height), bg_color + (255,))
        
        draw = ImageDraw.Draw(image)
        
        if use_logo:
            logo = None
            if logo_file:
                logo_path = folder_paths.get_annotated_filepath(logo_file)
                if logo_path and os.path.exists(logo_path):
                    logo = Image.open(logo_path)
                    if logo.mode != 'RGBA':
                         logo = logo.convert('RGBA')
            
            if logo:
                if "Center Large" in logo_position:
                    target_w = int(width * 0.75)
                else:
                    target_w = int(width * 0.15)
                ratio = target_w / float(logo.width)
                target_h = int(logo.height * ratio)
                logo = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
                pad = int(width * 0.02)
                if "Top Left" in logo_position: pos = (pad, pad)
                elif "Top Right" in logo_position: pos = (width - target_w - pad, pad)
                elif "Bottom Left" in logo_position: pos = (pad, height - target_h - pad)
                elif "Bottom Right" in logo_position: pos = (width - target_w - pad, height - target_h - pad)
                else: pos = ((width - target_w) // 2, (height - target_h) // 2)
                mask = logo.split()[3]
                if "Center Large" not in logo_position: 
                    shadow_blur = int(width * 0.005)
                    shadow_offset = int(width * 0.003)
                    shadow = Image.new('RGBA', logo.size, (0, 0, 0, 0))
                    shadow.paste((0, 0, 0, 180), mask=mask)
                    shadow = shadow.filter(ImageFilter.GaussianBlur(shadow_blur))
                    shadow_pos = (pos[0] + shadow_offset, pos[1] + shadow_offset)
                    image.paste(shadow, shadow_pos, mask=shadow)
                image.paste(logo, pos, mask=mask)
        # [LOGO COMPOSITING SNIPPET END]

        # 5. Draw Text (Double Line Logic)
        margin_bottom = 20
        
        main_font = self._get_font(font_name, main_font_size)
        sub_font = self._get_font(font_name, sub_font_size)
        
        # Calculate Bounding Boxes
        bbox_main = draw.textbbox((0, 0), main_line, font=main_font) if main_line else (0,0,0,0)
        bbox_sub = draw.textbbox((0, 0), sub_line, font=sub_font) if sub_line else (0,0,0,0)
        
        w_main = bbox_main[2] - bbox_main[0]
        h_main = bbox_main[3] - bbox_main[1]
        
        w_sub = bbox_sub[2] - bbox_sub[0]
        h_sub = bbox_sub[3] - bbox_sub[1]
        
        # Determine Draw Order and Total Height
        # total_h = h_main + text_spacing + h_sub (if both exist)
        line_items = [] # (text, font, width, height, bbox)
        
        if subtext_position == "Above":
            if sub_line: line_items.append((sub_line, sub_font, w_sub, h_sub, bbox_sub))
            if main_line: line_items.append((main_line, main_font, w_main, h_main, bbox_main))
        else: # Below
            if main_line: line_items.append((main_line, main_font, w_main, h_main, bbox_main))
            if sub_line: line_items.append((sub_line, sub_font, w_sub, h_sub, bbox_sub))
            
        if line_items:
            # We draw from the bottom up
            # Starting point for the bottom-most line
            # current_bottom_y = height - margin_bottom
            
            y_cursor = height - margin_bottom
            
            # Draw in reverse order (bottom line first)
            for i, (txt, fnt, tw, th, tbbox) in enumerate(reversed(line_items)):
                tx = (width - tw) // 2
                # y = y_cursor - tbbox[3]
                # tbbox[3] is the descent/bottom relative to the draw point
                ty = y_cursor - tbbox[3]
                
                # Shadow
                s_off = max(2, int(fnt.size / 15))
                draw.text((tx + s_off, ty + s_off), txt, font=fnt, fill=(0,0,0,128))
                # Fill
                draw.text((tx, ty), txt, font=fnt, fill=(255, 255, 255, 255))
                
                # Move cursor UP for the next line
                # Next cursor is current_cursor - th - text_spacing
                # but we need to account for the descent specifically
                # effectively: y_cursor = ty + tbbox[1] - text_spacing
                y_cursor = ty + tbbox[1] - text_spacing

        # 6. Save Logic (Auto Filename)
        if save_mode:
            out_dir = folder_paths.get_output_directory()
            
            # Sanitize Filename from full_text
            # "SDXL + workflow" -> "SDXL_plus_workflow" roughly, or just replace unsafe chars
            # User wants "SD1.5+workflow" -> "SD1.5+workflow.png" basically?
            # Windows hates: < > : " / \ | ? *
            
            # Sanitize Filename from main_line
            safe_name = main_line
            for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
                safe_name = safe_name.replace(char, '')
            
            # Also replace newlines or weird spaces
            safe_name = safe_name.replace('\n', '').replace('\r', '').strip()
            
            if not safe_name:
                safe_name = "workflow_cover"
                
            full_path = os.path.join(out_dir, f"{safe_name}.png")
            
            # We want to overwrite, so we just save
            image.save(full_path)
            print(f"[Shima] Saved workflow cover: {full_path}")

        # 7. Output to Preview
        # Convert back to Tensor (RGB or RGBA)
        # If saving as PNG, RGBA is fine.
        out_np = np.array(image).astype(np.float32) / 255.0
        out_tensor = torch.from_numpy(out_np).unsqueeze(0)
        
        return (out_tensor,)
