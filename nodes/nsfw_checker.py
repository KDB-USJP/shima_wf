"""
Shima.NSFWContentChecker - Advanced NSFW detection and censorship node

Features:
- Global NSFW scoring via ViT-based model
- Body part segmentation via NudeNet
- Configurable censorship styles (Mosaic, Blur, Black Bars)
- Rating system (G to NSFL) with visual "bug" (badge)
- Safe Mode: Graceful fallback if dependencies are missing
"""

import os
import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Lazy import placeholders
transformers = None
nudenet = None

class NSFWContentChecker:
    """
    Detects and censors NSFW content using ViT classification and NudeNet segmentation.
    """
    
    # Rating thresholds (Score > Threshold = Rated as X)
    RATING_THRESHOLDS = {
        "G": 0.05,      # Strict - block almost anything suggestive
        "PG": 0.15,     # Very strict - block revealing clothing
        "PG13": 0.35,   # Moderate - block exposed breasts/genitals
        "R": 0.60,      # Permissive - block explicit sexual content
        "X": 0.75,      # Very permissive - block only hardcore content
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "rating_threshold": (list(cls.RATING_THRESHOLDS.keys()), {"default": "PG13"}),
                "preview_mode": (["none", "blur", "black_bar", "mosaic"], {"default": "mosaic"}),
                "rating_bug": ("BOOLEAN", {"default": True}),
                "block_nsfw": ("BOOLEAN", {"default": False, "tooltip": "If True, outputs a black image on 'IMAGE' output when unsafe content is detected."}),
            },
            "optional": {
                "custom_threshold": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05}),
                "body_parts": (["breasts", "genitals", "buttocks", "all"], {"default": "all"}),
                "mosaic_block_size": ("INT", {"default": 16, "min": 4, "max": 64, "step": 4}),
                "blur_radius": ("INT", {"default": 21, "min": 5, "max": 51, "step": 2}),
                "bar_thickness": ("INT", {"default": 60, "min": 20, "max": 200, "step": 10}),
                "detection_confidence": ("FLOAT", {"default": 0.5, "min": 0.1, "max": 1.0, "step": 0.05}),
                "rating_bug_position": (["top_left", "top_right", "bottom_left", "bottom_right"], {"default": "bottom_right"}),
                "rating_bug_size": ("INT", {"default": 160, "min": 40, "max": 400, "step": 10}),
            }
        }
    
    # ... (Rest of returns/tooltips) ...

    # ... (check_dependencies/get_classifier/get_detector same) ...

    def check_and_censor(self, image, rating_threshold="PG13", preview_mode="mosaic", 
                         rating_bug=True, block_nsfw=False, custom_threshold=0.0,
                         body_parts="all", mosaic_block_size=16, blur_radius=21, 
                         bar_thickness=60, detection_confidence=0.5,
                         rating_bug_position="bottom_right", rating_bug_size=80):
        
        # Check dependencies first
        if not self.check_dependencies():
            print("[Shima.NSFW] Missing dependencies (transformers/nudenet). Returning blocked.")
            black_img = torch.zeros_like(image)
            empty_mask = torch.zeros((image.shape[0], 1, image.shape[1], image.shape[2]))
            return (black_img, black_img, black_img, empty_mask, 1.0, "MISSING DEPS", True)

        # Initialize results lists
        out_images_ungraded = []
        out_images_censored = []
        out_images_no_bug = []
        out_masks = []
        scores = []
        infos = []
        blocked_flags = []

        # Process batch
        for i in range(image.shape[0]):
            img_tensor = image[i]
            pil_img = self.tensor_to_pil(img_tensor)
            
            # 1. Global NSFW Score
            nsfw_score = self.calculate_nsfw_score(pil_img)
            scores.append(nsfw_score)

            # 2. Run Detections
            detections = []
            if nsfw_score > 0.1:
                detections = self.detect_body_parts(pil_img, body_parts, detection_confidence)

            # 3. Determine Rating
            rating_ranks = {"G": 0, "PG": 1, "PG13": 2, "R": 3, "X": 4}
            x_parts = ["FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED", "ANUS_EXPOSED"]
            r_parts = ["FEMALE_BREAST_EXPOSED", "MALE_BREAST_EXPOSED", "BUTTOCKS_EXPOSED"]
            
            detected_rating_label = "G"
            found_x = any(d['class'] in x_parts for d in detections)
            found_r = any(d['class'] in r_parts for d in detections)
            
            if found_x: detected_rating_label = "X"
            elif found_r: detected_rating_label = "R"
            else:
                if nsfw_score >= 0.5: detected_rating_label = "PG13"
                elif nsfw_score >= 0.2: detected_rating_label = "PG"
                else: detected_rating_label = "G"

            # 4. Compare vs Threshold
            if custom_threshold > 0.0:
                 is_unsafe = nsfw_score >= custom_threshold
            else:
                 user_rank = rating_ranks.get(rating_threshold, 2)
                 detected_rank = rating_ranks.get(detected_rating_label, 0)
                 is_unsafe = detected_rank >= user_rank

            # 5. Prepare Output Versions
            black_tensor_3d = torch.zeros_like(img_tensor)
            
            # A) CENSORED_IMAGE (Preview)
            # Only censor if unsafe? User said: "only modify image when nudenet is used"
            # Does this mean we skip the rating bug too? No, "CENSORED_IMAGE... Uses the bug."
            # So Bug always present on CENSORED_IMAGE.
            # But the underlying image? 
            # If found_x or found_r (NudeNet used) -> Apply targeted censor (Mosaic).
            # If just high score (No NudeNet) -> Clean image + Bug? (Previously I did Global Censor).
            
            censored_pil = pil_img.copy()
            current_mask = Image.new('L', pil_img.size, 0)
            rating_reason = ""
            
            if found_x: rating_reason = "[Explicit]"
            elif found_r: rating_reason = "[Nudity]"
            elif nsfw_score >= 0.5: rating_reason = "[Suggestive]"

            if is_unsafe:
                rating_text = f"{detected_rating_label}: UNSAFE ({nsfw_score:.2f}) {rating_reason}"
                
                # Apply censorship (Mosaic/Blur)
                if detections:
                    censored_pil, current_mask = self.apply_targeted_censor(
                        pil_img, detections, preview_mode, 
                        mosaic_block_size, blur_radius, bar_thickness
                    )
                elif nsfw_score > 0.8: # Fallback for extremely high score but no detections
                     censored_pil = self.apply_global_censor(pil_img, preview_mode, mosaic_block_size, blur_radius)
                     current_mask = Image.new('L', pil_img.size, 255)
            else:
                 rating_text = f"{detected_rating_label}: Clean ({nsfw_score:.2f})"
            # Add Bug if requested
            if rating_bug:
                censored_with_bug = self.add_rating_bug(
                    censored_pil.copy(), detected_rating_label, nsfw_score,
                    rating_bug_position, rating_bug_size, is_clean=not is_unsafe
                )
                out_images_censored.append(self.pil_to_tensor(censored_with_bug))
            else:
                out_images_censored.append(self.pil_to_tensor(censored_pil))

            # UNGRADED_IMAGE (Legacy "IMAGE")
            # If block_nsfw is True AND it is unsafe -> Returns Black.
            # Else -> Returns Original Input (No Bug, No Censor).
            
            black_tensor_3d = torch.zeros_like(img_tensor)

            if block_nsfw and is_unsafe:
                 out_images_ungraded.append(black_tensor_3d)
                 blocked_flags.append(True)
            else:
                 out_images_ungraded.append(img_tensor)
                 blocked_flags.append(False)
                 
            # NO_BUG_IMAGE (New Strict Output)
            # This output is the original image if safe, or black if unsafe.
            # It ignores the 'block_nsfw' input and always blocks if unsafe.
            if is_unsafe:
                out_images_no_bug.append(black_tensor_3d)
            else:
                out_images_no_bug.append(img_tensor) # Original

            out_masks.append(self.pil_to_tensor(current_mask))
            infos.append(rating_text)

        # Batch assembly
        final_prod = torch.stack(out_images_ungraded)
        final_preview = torch.stack(out_images_censored)
        final_no_bug = torch.stack(out_images_no_bug) # New output
        final_mask = torch.stack(out_masks)
        
        # Aggregate scores/info
        avg_score = sum(scores) / len(scores) if scores else 0.0
        final_info = " | ".join(infos)
        any_blocked = any(blocked_flags)

        return (final_prod, final_preview, final_no_bug, final_mask, avg_score, final_info, any_blocked)
    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "MASK", "FLOAT", "STRING", "BOOLEAN")
    RETURN_NAMES = ("UNGRADED_IMAGE", "CENSORED_IMAGE", "NO_BUG_IMAGE", "CENSOR_MASK", "NSFW_SCORE", "RATING_INFO", "IS_BLOCKED")
    OUTPUT_TOOLTIPS = (
        "Production Output: Returns original image if safe, black image if unsafe+blocked.",
        "Preview Output: Always returns the image with censorship applied (for previewing what was detected).",
        "Censored image without the rating bug overlay.",
        "Mask showing the censored regions.",
        "Detected NSFW score (0.0 - 1.0).",
        "Text summary of rating and detections.",
        "True if the image was blocked due to safety settings."
    )

    FUNCTION = "check_and_censor"
    CATEGORY = "Shima/System"

    # Persistent model instances
    _nsfw_classifier = None
    _nudenet_detector = None
    _checked_deps = False
    _deps_available = False

    def check_dependencies(self):
        """Lazy load dependencies with auto-install."""
        if self._checked_deps:
            return self._deps_available

        global transformers, nudenet
        try:
            import transformers as tf_lib
            transformers = tf_lib
            from nudenet import NudeDetector
            nudenet = NudeDetector
            self._deps_available = True
        except ImportError as e:
            print(f"[Shima.NSFW] Dependency missing ({e}). Attempting auto-installation...")
            try:
                import sys
                import subprocess
                # Install missing packages
                # Note: We install both to be safe, pip handles existence checks
                subprocess.check_call([sys.executable, "-m", "pip", "install", "nudenet", "transformers"])
                
                # Retry imports
                import transformers as tf_lib
                transformers = tf_lib
                from nudenet import NudeDetector
                nudenet = NudeDetector
                self._deps_available = True
                print("[Shima.NSFW] Dependencies installed successfully.")
            except Exception as install_error:
                print(f"[Shima.NSFW] Auto-install failed: {install_error}")
                print("Please install 'nudenet' and 'transformers' manually using pip.")
                self._deps_available = False
        
        self._checked_deps = True
        return self._deps_available

    def get_classifier(self):
        if self._nsfw_classifier is None and self.check_dependencies():
            try:
                from transformers import pipeline
                # Use CPU to avoid VRAM fighting, or auto if plenty available
                # For safety, defaulting to cpu for the classifier usually fine as ViT is small
                device = -1 # CPU
                if torch.cuda.is_available():
                    # Check VRAM? Simplification: Just use CPU for stability or GPU if desired.
                    # pipeline automatically handles device if specified.
                    # Let's try to use GPU 0 if available for speed, but catch OOM? 
                    # ComfyUI manages VRAM, so using 'cuda:0' might conflict if not careful.
                    # Best practice is typically to let ComfyUI manage models or keep it CPU if light.
                    # ViT-base is relatively light.
                    pass 
                
                self._nsfw_classifier = pipeline(
                    "image-classification",
                    model="AdamCodd/vit-base-nsfw-detector",
                    
                )
            except Exception as e:
                print(f"[Shima.NSFW] Failed to load ViT classifier: {e}")
                return None
        return self._nsfw_classifier

    def get_detector(self):
        if self._nudenet_detector is None and self.check_dependencies():
            try:
                # NudeNet automatically downloads models to ~/.NudeNet/
                self._nudenet_detector = nudenet() 
            except Exception as e:
                print(f"[Shima.NSFW] Failed to load NudeNet detector: {e}")
                return None
        return self._nudenet_detector



    def calculate_nsfw_score(self, pil_img):
        classifier = self.get_classifier()
        if not classifier:
            return 0.0
        
        try:
            # ViT classifier execution
            results = classifier(pil_img)
            # results example: [{'label': 'nsfw', 'score': 0.9}, {'label': 'sfw', 'score': 0.1}]
            params = {r['label']: r['score'] for r in results}
            return params.get('nsfw', 0.0)
        except Exception as e:
            print(f"[Shima.NSFW] Classification error: {e}")
            return 0.0

    def detect_body_parts(self, pil_img, body_parts, confidence):
        detector = self.get_detector()
        if not detector:
            return []

        # Map to NudeNet classes
        # NudeNet classes: 
        # FEMALE_GENITALIA_EXPOSED, MALE_GENITALIA_EXPOSED, BUTTOCKS_EXPOSED, ANUS_EXPOSED,
        # FEMALE_BREAST_EXPOSED, MALE_BREAST_EXPOSED, etc.
        all_classes = [
            "FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED", 
            "BUTTOCKS_EXPOSED", "ANUS_EXPOSED",
            "FEMALE_BREAST_EXPOSED", "MALE_BREAST_EXPOSED"
        ]
        
        if body_parts == "breasts":
            target_classes = ["FEMALE_BREAST_EXPOSED", "MALE_BREAST_EXPOSED"]
        elif body_parts == "genitals":
            target_classes = ["FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED"]
        elif body_parts == "buttocks":
            target_classes = ["BUTTOCKS_EXPOSED", "ANUS_EXPOSED"]
        else: # "all"
            target_classes = all_classes

        try:
            # Save to temp file needed? NudeNet usually accepts path or numpy?
            # NudeNet detect accepts: path, numpy array
            # Convert PIL to BGR numpy (opencv format) for NudeNet
            img_np = np.array(pil_img)[:, :, ::-1] # RGB to BGR
            detections = detector.detect(img_np)
            
            # Filter
            filtered = [
                d for d in detections 
                if d['class'] in target_classes and d['score'] >= confidence
            ]
            return filtered
        except Exception as e:
            print(f"[Shima.NSFW] Detection error: {e}")
            return []

    def apply_targeted_censor(self, pil_img, detections, mode, mosaic_size, blur_radius, bar_thickness):
        censored = pil_img.copy()
        mask_img = Image.new('L', pil_img.size, 0)
        draw_mask = ImageDraw.Draw(mask_img)
        
        # Prepare drawing context for basic shapes
        draw_censored = ImageDraw.Draw(censored)
        
        for d in detections:
            box = d['box'] # [x, y, w, h]
            x, y, w, h = box
            
            # Convert to ints
            x, y, w, h = int(x), int(y), int(w), int(h)
            
            # Define region
            box_coords = (x, y, x+w, y+h)
            
            # Update mask
            draw_mask.rectangle(box_coords, fill=255)
            
            if mode == "mosaic":
                region = censored.crop(box_coords)
                # Resize down
                small_w = max(1, w // mosaic_size)
                small_h = max(1, h // mosaic_size)
                region = region.resize((small_w, small_h), resample=Image.Resampling.NEAREST)
                # Resize up
                region = region.resize((w, h), resample=Image.Resampling.NEAREST)
                censored.paste(region, box_coords)
            
            elif mode == "blur":
                region = censored.crop(box_coords)
                region = region.filter(ImageFilter.GaussianBlur(radius=blur_radius))
                censored.paste(region, box_coords)
            
            elif mode == "black_bar":
                draw_censored.rectangle(box_coords, fill=(0,0,0))
                # Optional: Stripes?
                pass
            
            # "none" does nothing
            
        return censored, mask_img

    def apply_global_censor(self, pil_img, mode, mosaic_size, blur_radius):
        w, h = pil_img.size
        
        if mode == "mosaic":
            small_w = max(1, w // mosaic_size)
            small_h = max(1, h // mosaic_size)
            img = pil_img.resize((small_w, small_h), resample=Image.Resampling.NEAREST)
            return img.resize((w, h), resample=Image.Resampling.NEAREST)
            
        elif mode == "blur":
            return pil_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))
            
        elif mode == "black_bar":
            # Just return black?
            return Image.new("RGB", pil_img.size, (0,0,0))
            
        return pil_img

    def add_rating_bug(self, pil_img, rating, score, position, size, is_clean):
        # Draw on a copy with RGBA to handle transparency if needed
        # But we are drawing solid pill
        out_img = pil_img.copy()
        draw = ImageDraw.Draw(out_img)
        
        # Colors
        if is_clean:
            bg_color = (40, 160, 40) # Green (G)
        else:
            if rating in ["G", "PG"]:
                bg_color = (40, 160, 40) # Green
            elif rating == "PG13":
                bg_color = (255, 165, 0) # Orange
            elif rating == "R":
                bg_color = (255, 69, 0) # Red-Orange
            else: # X
                bg_color = (220, 20, 60) # Crimson
            
        text = rating

        w, h = pil_img.size
        padding = 20
        
        # Pill Dimensions
        # Aspect ratio roughly 2:1 or dynamic based on text length?
        # User mockup shows wide pill.
        # Fixed height based on `size` param, width dynamic or ratio.
        # Let's treat `size` as width, calculating height relative to it, or vice versa.
        # Standard input `rating_bug_size` is int. Let's assume it's Width.
        pill_w = size
        pill_h = int(size * 0.45) # Height is ~45% of width
        
        # Recalculate based on text length if needed? 
        # PG13 is wider than G. 
        # Making it fixed width helps consistency.
        
        # Coordinates
        if position == "top_left":
            x, y = padding, padding
        elif position == "top_right":
            x, y = w - pill_w - padding, padding
        elif position == "bottom_left":
            x, y = padding, h - pill_h - padding
        else: # bottom_right
            x, y = w - pill_w - padding, h - pill_h - padding
            
        box = [x, y, x + pill_w, y + pill_h]
        
        # Draw Pill (Rounded Rectangle with full radius)
        radius = pill_h // 2
        
        # Outline thickness
        stroke = 4
        
        # Draw filled pill
        draw.rounded_rectangle(box, radius=radius, fill=bg_color, outline=(255, 255, 255), width=stroke)
        
        # Font setup 
        font_size = int(pill_h * 0.65) # 65% of height
        font = None
        
        try:
            # Common paths for bold sans fonts
            font_names = ["arialbd.ttf", "arial.ttf", "segoeui.ttf", "Roboto-Bold.ttf", "DejaVuSans-Bold.ttf"]
            for name in font_names:
                try:
                    font = ImageFont.truetype(name, font_size)
                    break
                except:
                    continue
            if font is None:
                 font = ImageFont.load_default()
        except:
             font = None

        # Draw Text Centered
        if font:
            if hasattr(draw, "textbbox"):
                left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
                text_w = right - left
                text_h = bottom - top
                text_x = x + (pill_w - text_w) / 2
                text_y = y + (pill_h - text_h) / 2 - (bottom * 0.15) 
                draw.text((text_x, text_y), text, fill=(255,255,255), font=font)
            else:
                text_w, text_h = draw.textsize(text, font=font)
                draw.text((x + (pill_w-text_w)/2, y + (pill_h-text_h)/2), text, fill=(255,255,255), font=font)
        else:
             draw.text((x + 5, y + pill_h//2 - 5), text, fill=(255,255,255))

        return out_img

    def tensor_to_pil(self, t):
        return Image.fromarray(np.clip(255. * t.cpu().numpy(), 0, 255).astype(np.uint8))

    def pil_to_tensor(self, pil_img):
        # Handle grayscale
        if pil_img.mode == 'L':
            pil_img = pil_img.convert('RGB') # standardize to RGB for output consistency? 
            # Or usually single channel for masks.
            # If it's the mask (L)
        
        arr = np.array(pil_img).astype(np.float32) / 255.0
        if len(arr.shape) == 2: # Gray
             # return (H, W) or (H,W,1)? Comfy expects (H,W,C) or (B,H,W,C)
             # but mask is usually just (H,W)?
             # Return types says MASK.
             pass
        return torch.from_numpy(arr)

# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.NSFWContentChecker": NSFWContentChecker
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.NSFWContentChecker": "Shima NSFW Checker"
}
