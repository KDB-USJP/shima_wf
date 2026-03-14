
import os
import folder_paths
from ..utils.styler_loader import StylerDataLoader

# Load data on module init
# Assuming config is in ../assets/data relative to this file
__file__ = os.path.abspath(__file__)
EXTENSION_ROOT = os.path.dirname(os.path.dirname(__file__))
CONFIG_PATH = os.path.join(EXTENSION_ROOT, "assets", "data", "shima_sheets.xlsx")

# Fallback
_STYLER_DATA = [] # Global list of ALL items for ID lookup (concatenated)
_ARTISTS_DATA = []
_USER_STYLER_DATA = []
_CATEGORIES = []

if os.path.exists(CONFIG_PATH):
    try:
        loader = StylerDataLoader(CONFIG_PATH)
        data = loader.get_data()
        
        _ARTISTS_DATA = data.get("artists", [])
        _USER_STYLER_DATA = data.get("user_styles", [])
        
        # Concatenate for global ID access: Artists first, then User Styles
        _STYLER_DATA = _ARTISTS_DATA + _USER_STYLER_DATA
        _CATEGORIES = loader.get_categories()
    except Exception as e:
        print(f"[ShimaStyler] Error loading data: {e}")
else:
    print(f"[ShimaStyler] No data found at {CONFIG_PATH}")

# --- Helper for Structural Injection ---
def apply_prompt_injection(template, user_prompt, is_first):
    if "{prompt}" not in template:
        return template, False
    
    # Clean user prompt: remove trailing punctuation for cleaner merge
    clean_prompt = user_prompt.strip().rstrip("., ")
    
    if is_first:
        import re
        # Swap period for comma if template ends that segment with a dot
        result = re.sub(r"\{prompt\}\s*\.", clean_prompt + ",", template)
        result = result.replace("{prompt}", clean_prompt)
    else:
        import re
        # Subsequent: Just remove the macro and any following structural dot
        result = re.sub(r"\{prompt\}\s*\.", "", template)
        result = result.replace("{prompt}", "")
        
    # Final cleanup: double spaces, double commas
    result = result.replace("  ", " ").replace(",,", ",").strip(", ")
    return result.strip(), True

class ShimaStyleSelector:
    """
    Selects a style from the loaded data.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "active": ("BOOLEAN", {"default": True, "label_on": "Active", "label_off": "Bypass"}),
                "base_prompt": ("STRING", {"multiline": True, "default": ""}),
                "negative_prompt": ("STRING", {"multiline": True, "default": ""}),
                "mode": (["Single", "Stack"], {"default": "Single"}), 
                "connector": ([" and ", " mixed with ", " + ", ", "], {"default": ", "}),
                "style_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01, "round": 0.01}),
            },
            "optional": {
                "clip": ("CLIP", ),
                "conditioning_positive": ("CONDITIONING", ),
                "conditioning_negative": ("CONDITIONING", ),
                "selected_styles": ("STRING", {"default": "", "multiline": False, "hidden": True}),
                "base_string": ("STRING", {"forceInput": True, "default": ""}),
                "negative_string": ("STRING", {"forceInput": True, "default": ""}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative", "style_name", "positive_conditioning", "negative_conditioning")
    FUNCTION = "process_selection"
    CATEGORY = "Shima/Styler"

    def process_selection(self, active, base_prompt, negative_prompt, mode, connector, style_strength, 
                          clip=None, conditioning_positive=None, conditioning_negative=None, 
                          selected_styles="", base_string="", negative_string="",
                          unique_id=None, extra_pnginfo=None):
        # 1. Bypass Logic
        if not active:
             # Pass through conditioning if present, else None (or empty list?)
             # Standard Comfy behavior for missing Optional is None.
             # If we bypass, we should probably pass input conds through if they exist.
             pos_cond = conditioning_positive
             neg_cond = conditioning_negative
             return (base_prompt, negative_prompt, "None", pos_cond, neg_cond)

        # 2. Validation
        if not selected_styles:
             raise ValueError("Style Selector: You must make at least one selection or turn off the styler.")

        import json
        style_prompt = ""
        style_neg = ""
        style_names = ""
        
        try:
            if selected_styles:
                names = json.loads(selected_styles)
                if isinstance(names, list):
                    prompts = []
                    neg_prompts = []
                    
                    was_injected = False
                    for i, n in enumerate(names):
                        user_match = None
                        artist_match = None
                        
                        # ... (existing match logic) ...
                        upper_n = n.upper()
                        if upper_n.startswith("U"):
                             try:
                                 idx = int(upper_n[1:])
                                 if 0 <= idx < len(_USER_STYLER_DATA):
                                     user_match = _USER_STYLER_DATA[idx]
                             except: pass
                        elif upper_n.startswith("A"):
                             try:
                                 idx = int(upper_n[1:])
                                 if 0 <= idx < len(_ARTISTS_DATA):
                                     artist_match = _ARTISTS_DATA[idx]
                             except: pass
                        
                        if not user_match and not artist_match:
                            user_match = next((u for u in _USER_STYLER_DATA if u["name"] == n), None)
                            artist_match = next((a for a in _ARTISTS_DATA if a["name"] == n), None)
                        
                        current_template = ""
                        is_user_style = False
                        
                        if user_match:
                             current_template = user_match.get("positive", n)
                             is_user_style = True
                             if user_match.get("negative"):
                                  neg_prompts.append(user_match.get("negative"))
                        elif artist_match:
                             current_template = f"style of {artist_match['name']}"
                             if artist_match.get("negative"):
                                  neg_prompts.append(artist_match.get("negative"))
                        else:
                             current_template = n if n.startswith("style of") else f"style of {n}"

                        # --- SURGICAL WEIGHTING ---
                        # Apply weight only to the style bits, keeping the injected prompt at 1.0 (unless user weighted it in Master Prompt)
                        if style_strength != 1.0:
                             if "{prompt}" in current_template:
                                  import re
                                  # Split by {prompt} and weight everything else
                                  parts = current_template.split("{prompt}")
                                  weighted_parts = []
                                  for p in parts:
                                       # Match content vs surrounding whitespace/commas
                                       match = re.match(r"^([\s,]*)(.*?)([\s,]*)$", p, re.DOTALL)
                                       if match:
                                            prefix, content, suffix = match.groups()
                                            if content:
                                                 weighted_parts.append(f"{prefix}({content}:{style_strength}){suffix}")
                                            else:
                                                 weighted_parts.append(p)
                                       else:
                                            weighted_parts.append(p)
                                  current_template = "{prompt}".join(weighted_parts)
                             else:
                                  # No prompt macro, just weight the whole thing
                                  current_template = f"({current_template}:{style_strength})"

                        # --- SMART INJECTION ---
                        # Priority: 1. Input String | 2. Input Conditioning (No Prompt) | 3. Widget Prompt
                        actual_base = base_string
                        if not actual_base:
                             if conditioning_positive:
                                  actual_base = "" # User: Ignore text box if conditioning connected
                             else:
                                  actual_base = base_prompt
                        
                        # Only attempt injection for User Styles (Templates)
                        if is_user_style:
                            injected_text, did_inject = apply_prompt_injection(current_template, actual_base, not was_injected)
                            if did_inject:
                                current_template = injected_text
                                was_injected = True or was_injected # Stay True if ever True
                        
                        prompts.append(current_template)

                    style_prompt = connector.join(prompts)
                    style_neg = connector.join(neg_prompts)
                    style_names = ", ".join(names)
                    
                    # If we injected, the prompt is ALREADY in style_prompt.
                    # We MUST suppress the default base_prompt append.
                    if was_injected:
                        base_prompt = "" # Will only use final style_prompt
                        base_string = ""
        except Exception as e:
             print(f"[ShimaSelector] Error processing styles: {e}")
             style_prompt = selected_styles
             style_neg = ""
             style_names = selected_styles
        
        # Combine Positives
        if base_prompt:
             final_prompt = f"{base_prompt}{connector}{style_prompt}" if style_prompt else base_prompt
        else:
             final_prompt = style_prompt
             
        # Combine Negatives
        if negative_prompt:
             final_negative = f"{negative_prompt}{connector}{style_neg}" if style_neg else negative_prompt
        else:
             final_negative = style_neg

        # 3. Conditioning Logic
        pos_cond_out = None
        neg_cond_out = None

        if clip:
            # Helper to encode
            def encode_text(text):
                tokens = clip.tokenize(text)
                cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
                return [[cond, {"pooled_output": pooled}]]

            # Encode Final Prompts (Hybrid: We encode the FULL combined prompt)
            # OR do we encode just the style and concat?
            # User wants to concatenate *to users prompt*. 
            # If `base_prompt` is used, we are creating a new full prompt anyway.
            # Strategy: 
            # If `conditioning_positive` exists: We encode ONLY the style part and concat?
            # NO, `final_prompt` allows user to type in the box.
            # Simplest Pro Workflow:
            # 1. User inputs CLIP.
            # 2. We output `final_prompt` (Text) AND `final_encoded` (Cond).
            # 3. If User inputs `conditioning_positive`, we CONCAT our result to theirs.

            # Encode Positive
            # Note: handle empty prompt? CLIP usually encodes empty fine.
            pos_cond_new = encode_text(final_prompt)
            
            if conditioning_positive:
                pos_cond_out = conditioning_positive + pos_cond_new
            else:
                pos_cond_out = pos_cond_new

            # Encode Negative
            neg_cond_new = encode_text(final_negative)
            
            if conditioning_negative:
                neg_cond_out = conditioning_negative + neg_cond_new
            else:
                neg_cond_out = neg_cond_new
        else:
            # Pass through original if clip missing, to avoid breaking chain entirely?
            # Or just None? Plan said "output None".
            pos_cond_out = conditioning_positive
            neg_cond_out = conditioning_negative

        return (final_prompt, final_negative, style_names, pos_cond_out, neg_cond_out)

class ShimaStyleIterator:
    """
    Iterates through styles with advanced control.
    Supports Artists and User Styles modes.
    """
    _batch_counters = {}
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "base_prompt": ("STRING", {"multiline": True, "default": ""}),
                "style_mode": (["Artists", "User Styles"], {"default": "Artists"}),
                "index_mode": (["increment", "decrement", "randomize"], {"default": "increment"}),
                "index": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 100}),
                "auto_queue": ("BOOLEAN", {"default": False}),
                "connector": ([" and ", " mixed with ", " + ", ", "], {"default": ", "}),
                "style_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01, "round": 0.01}),
            },
            "optional": {
                 "clip": ("CLIP", ),
                 "conditioning_positive": ("CONDITIONING", ),
                 "conditioning_negative": ("CONDITIONING", ),
                 "base_string": ("STRING", {"forceInput": True, "default": ""}),
                 "negative_string": ("STRING", {"forceInput": True, "default": ""}),
                 "use_keywords_in_positive_prompt": ("BOOLEAN", {"default": False}),
                 "use_optional_negatives_if_present": ("BOOLEAN", {"default": False}),
                 "allow_external_linking": ("BOOLEAN", {"default": False}),
                 "show_used_values": ("BOOLEAN", {"default": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "STRING", "STRING", "INT", "INT", "STRING", "STRING")
    RETURN_NAMES = ("pos_clip_out", "neg_clip_out", "pos_str", "neg_str", "current_index", "total_count", "formatted_name", "style_mode")
    FUNCTION = "iterate"
    CATEGORY = "Shima/Styler"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")

    def iterate(self, index, index_mode, batch_size, auto_queue, connector, style_mode, 
                style_strength, base_prompt="", base_string="", negative_string="", 
                clip=None, conditioning_positive=None, conditioning_negative=None,
                use_keywords_in_positive_prompt=False, use_optional_negatives_if_present=False,
                allow_external_linking=False, show_used_values=False, unique_id=None):
        from server import PromptServer
        
        # Select Data Source
        current_data = _ARTISTS_DATA if style_mode == "Artists" else _USER_STYLER_DATA
        
        if not current_data:
            return (base_prompt, "", index, 0, "NoData")
            
        total = len(current_data)
        
        # --- Auto-Queue/Index Logic ---
        if auto_queue:
            if unique_id not in self._batch_counters:
                self._batch_counters[unique_id] = index
            current_count = self._batch_counters[unique_id]
        else:
            current_count = index
            self._batch_counters[unique_id] = index

        # Wrap around
        final_index = current_count % total
        
        # Get Item
        item = current_data[final_index]
        name = item.get("name", "Unknown")
        
        # --- Prompt Construction ---
        # Artists: "style of {name}"
        # User Styles: "{positive}" (stored in 'positive' field)
        
        pos_part = item.get("positive", name) # Default to name if positive missing
        if style_mode == "Artists":
            pos_part = f"style of {name}"
            
        # Append Keywords (Categories) if enabled (Artist Mode only per specs)
        if style_mode == "Artists" and use_keywords_in_positive_prompt:
             cats = item.get("categories", [])
             if cats:
                 pos_part += f", {', '.join(cats)}"
        
        # --- SURGICAL WEIGHTING ---
        # Apply weight only to the style bits, keeping the injected prompt at 1.0 (unless user weighted it in Master Prompt)
        if style_strength != 1.0:
             if "{prompt}" in pos_part:
                  import re
                  # Split by {prompt} and weight everything else
                  parts = pos_part.split("{prompt}")
                  weighted_parts = []
                  for p in parts:
                       # Match content vs surrounding whitespace/commas
                       match = re.match(r"^([\s,]*)(.*?)([\s,]*)$", p, re.DOTALL)
                       if match:
                            prefix, content, suffix = match.groups()
                            if content:
                                 weighted_parts.append(f"{prefix}({content}:{style_strength}){suffix}")
                            else:
                                 weighted_parts.append(p)
                       else:
                            weighted_parts.append(p)
                  pos_part = "{prompt}".join(weighted_parts)
             else:
                  # No prompt macro, just weight the whole thing
                  pos_part = f"({pos_part}:{style_strength})"
        
        # Optional Negatives
        neg_part = ""
        if use_optional_negatives_if_present:
            neg_part = item.get("negative", "")

        # --- SMART INJECTION ---
        # Priority: 1. Input String | 2. Input Conditioning (No Prompt) | 3. Widget Prompt
        actual_base = base_string
        if not actual_base:
             if conditioning_positive:
                  actual_base = ""
             else:
                  actual_base = base_prompt
        
        was_injected = False
        
        if style_mode == "User Styles":
             injected_text, did_inject = apply_prompt_injection(pos_part, actual_base, True)
             if did_inject:
                  pos_part = injected_text
                  was_injected = True
        
        # Combine
        if was_injected:
             final_positive_str = pos_part
        elif actual_base:
             final_positive_str = f"{actual_base}{connector}{pos_part}"
        else:
             final_positive_str = pos_part
             
        final_negative_str = neg_part
        if negative_string:
             final_negative_str = f"{negative_string}{connector}{neg_part}" if neg_part else negative_string

        # --- CONDITIONING LOGIC ---
        pos_cond_out = conditioning_positive
        neg_cond_out = conditioning_negative
        
        if clip:
            try:
                def encode_text(text):
                    tokens = clip.tokenize(text)
                    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
                    return [[cond, {"pooled_output": pooled}]]
                
                new_pos_cond = encode_text(final_positive_str)
                new_neg_cond = encode_text(final_negative_str)
                
                if conditioning_positive:
                    pos_cond_out = conditioning_positive + new_pos_cond
                else:
                    pos_cond_out = new_pos_cond
                    
                if conditioning_negative:
                    neg_cond_out = conditioning_negative + new_neg_cond
                else:
                    neg_cond_out = new_neg_cond
            except Exception as e:
                print(f"[ShimaIterator] Encoding Error: {e}")
        
        # --- Next Step Logic ---
        if auto_queue:
            if index_mode == "randomize":
                import random
                next_count = random.randint(0, total - 1)
            elif index_mode == "decrement":
                next_count = current_count - 1
            else: # increment
                next_count = current_count + 1
            
            self._batch_counters[unique_id] = next_count
            
            should_run = True
            if index_mode == "increment" and next_count >= total:
                 should_run = False
                 print(f"[ShimaStyler] Batch Complete: Processed all {total} styles.")

            if should_run:
                PromptServer.instance.send_sync("shima-batch-continue", {"node_id": unique_id})
                print(f"[ShimaStyler] Auto-Queueing next style: {next_count} (Mode: {index_mode})") 

        # Format Filename
        def sanitize(s, space=""):
             import re
             s = s.strip()
             if space: s = s.replace(" ", space)
             return re.sub(r'[^a-zA-Z0-9_\-]', '', s)

        s_name = sanitize(name.replace(" ", "_"))
        
        cats = item.get("categories", [])
        if cats:
            s_cats = "-".join([sanitize(c.replace(" ", "")) for c in cats])
        else:
            s_cats = "NoCategory"
            
        info = item.get("info", "")
        s_info = sanitize(info.replace(" ", "_"))
        
        formatted_name = f"{s_name}*{s_cats}|{s_info}"
        
        # --- UI Feedback ---
        ui_val = {}
        if show_used_values:
            ui_val["used_values"] = [
                f"Mode: {style_mode}",
                f"Style: {name}",
                f"Index: {final_index+1} / {total}",
                f"File: {formatted_name}"
            ]

        return {"ui": ui_val, "result": (pos_cond_out, neg_cond_out, final_positive_str, final_negative_str, final_index, total, formatted_name, style_mode)}

class ShimaStyleGallery:
    """
    Visual gallery for selecting styles.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "base_prompt": ("STRING", {"multiline": True, "default": ""}),
                "mode": (["Single", "Stack"], {"default": "Single"}), 
                "connector": ([" and ", " mixed with ", " + ", ", "], {"default": ", "}),
                "style_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01, "round": 0.01}),
                "show_missing": ("BOOLEAN", {"default": True, "label_on": "Show All", "label_off": "Hide Missing Images"}),
            },
            "optional": {
                "clip": ("CLIP", ),
                "conditioning_positive": ("CONDITIONING", ),
                "conditioning_negative": ("CONDITIONING", ),
                "base_string": ("STRING", {"forceInput": True, "default": ""}),
                "negative_string": ("STRING", {"forceInput": True, "default": ""}),
                "selected_styles": ("STRING", {"default": "", "multiline": False, "hidden": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("pos_clip_out", "neg_clip_out", "positive", "negative", "style_name")
    FUNCTION = "process_selection"
    CATEGORY = "Shima/Styler"

    def process_selection(self, base_prompt, mode, connector, style_strength, show_missing, 
                          clip=None, conditioning_positive=None, conditioning_negative=None,
                          selected_styles="", base_string="", negative_string="", unique_id=None):
        import json
        style_prompt = ""
        style_neg = ""
        style_names = ""
        was_injected = False
        
        try:
            if selected_styles and selected_styles != "[]":
                names = json.loads(selected_styles)
                if isinstance(names, list) and len(names) > 0:
                    prompts = []
                    
                    for i, n in enumerate(names):
                        # Gallery logic: mostly styles of artists OR User Style names
                        user_match = next((u for u in _USER_STYLER_DATA if u["name"] == n), None)
                        
                        current_template = n if n.startswith("style of") else f"style of {n}"
                        is_user_style = False
                        
                        if user_match:
                            current_template = user_match.get("positive", n)
                            is_user_style = True
                            if user_match.get("negative"):
                                style_neg = user_match.get("negative")
                        
                        # --- SURGICAL WEIGHTING ---
                        # Apply weight only to the style bits, keeping the injected prompt at 1.0 (unless user weighted it in Master Prompt)
                        if style_strength != 1.0:
                             if "{prompt}" in current_template:
                                  import re
                                  # Split by {prompt} and weight everything else
                                  parts = current_template.split("{prompt}")
                                  weighted_parts = []
                                  for p in parts:
                                       # Match content vs surrounding whitespace/commas
                                       match = re.match(r"^([\s,]*)(.*?)([\s,]*)$", p, re.DOTALL)
                                       if match:
                                            prefix, content, suffix = match.groups()
                                            if content:
                                                 weighted_parts.append(f"{prefix}({content}:{style_strength}){suffix}")
                                            else:
                                                 weighted_parts.append(p)
                                       else:
                                            weighted_parts.append(p)
                                  current_template = "{prompt}".join(weighted_parts)
                             else:
                                  # No prompt macro, just weight the whole thing
                                  current_template = f"({current_template}:{style_strength})"

                        # --- SMART INJECTION ---
                        # Priority: 1. Input String | 2. Input Conditioning (No Prompt) | 3. Widget Prompt
                        actual_base = base_string
                        if not actual_base:
                             if conditioning_positive:
                                  actual_base = "" 
                             else:
                                  actual_base = base_prompt

                        if is_user_style:
                            inj, did = apply_prompt_injection(current_template, actual_base, not was_injected)
                            if did:
                                current_template = inj
                                was_injected = True
                        
                        prompts.append(current_template)
                        
                    style_prompt = connector.join(prompts)
                    style_names = ", ".join(names)
        except Exception as e:
             print(f"[ShimaGallery] Selection Error: {e}")
             style_prompt = ""
             style_names = ""
        
        # --- PROMPT COMBINATION ---
        # Recalc actual_base for final combination
        actual_base = base_string
        if not actual_base:
             if conditioning_positive:
                  actual_base = ""
             else:
                  actual_base = base_prompt

        if was_injected:
             final_prompt = style_prompt
        elif actual_base:
             final_prompt = f"{actual_base}{connector}{style_prompt}" if style_prompt else actual_base
        else:
             final_prompt = style_prompt
             
        final_negative = style_neg
        if negative_string:
             final_negative = f"{negative_string}{connector}{style_neg}" if style_neg else negative_string

        # --- CONDITIONING LOGIC ---
        pos_cond_out = conditioning_positive
        neg_cond_out = conditioning_negative
        
        if clip:
            try:
                def encode_text(text):
                    tokens = clip.tokenize(text)
                    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
                    return [[cond, {"pooled_output": pooled}]]
                
                new_pos_cond = encode_text(final_prompt)
                new_neg_cond = encode_text(final_negative)
                
                if conditioning_positive:
                    pos_cond_out = conditioning_positive + new_pos_cond
                else:
                    pos_cond_out = new_pos_cond
                    
                if conditioning_negative:
                    neg_cond_out = conditioning_negative + new_neg_cond
                else:
                    neg_cond_out = new_neg_cond
            except Exception as e:
                print(f"[ShimaGallery] Encoding Error: {e}")
                
        return (pos_cond_out, neg_cond_out, final_prompt, final_negative, style_names)


