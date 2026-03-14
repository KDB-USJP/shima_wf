
import folder_paths
import os
from ..utils.styler_loader import StylerDataLoader

# We need access to the data loaded in styler.py or reload it.
# To avoid duplicate loading/memory, we should probably import the data variables from styler.py
# However, styler.py loads data on init.
# Let's import the data lists from styler.py to keep it DRY.
# But circular imports might be an issue if styler imports this.
# A better approach: Move data loading to a shared utility or just import from styler if styler is the "main" module.
# Let's try importing from .styler
try:
    from .styler import _STYLER_DATA, _ARTISTS_DATA, _USER_STYLER_DATA, apply_prompt_injection
except ImportError:
    # Fallback or if not initialized yet
    _STYLER_DATA = []
    _ARTISTS_DATA = []
    _USER_STYLER_DATA = []

class ShimaStyleFavorites:
    """
    Selects from a specific list of favorite styles.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "active": ("BOOLEAN", {"default": True, "label_on": "Active", "label_off": "App Disabled"}),
                "favorites_list": ("STRING", {"multiline": True, "default": "", "placeholder": "A0, U5, 12..."}),
                "mode": (["Single", "Stack"], {"default": "Single"}), 
                "connector": ([" and ", " mixed with ", " + ", ", "], {"default": ", "}),
                "filter_mode": (["Both", "Artists", "User Styles"], {"default": "Both"}),
                "style_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01, "round": 0.01}),
                "include_negatives": ("BOOLEAN", {"default": True, "label_on": "Include", "label_off": "Strip Negs"}),
            },
            "optional": {
                "clip": ("CLIP", ),
                "conditioning_positive": ("CONDITIONING", ),
                "conditioning_negative": ("CONDITIONING", ),
                "selected_styles_idx": ("STRING", {"default": "", "multiline": False, "hidden": False}),
                "base_string": ("STRING", {"forceInput": True, "default": ""}),
                "negative_string": ("STRING", {"forceInput": True, "default": ""}),
                "base_prompt": ("STRING", {"multiline": True, "default": ""}), # Legacy support
                "shima_base_prompt_internal": ("STRING", {"multiline": True, "default": ""}),
                "use_commonparams": ("BOOLEAN", {"default": False, "hidden": True}),
                "allow_external_linking": ("BOOLEAN", {"default": False, "hidden": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "STRING", "STRING")
    RETURN_NAMES = ("positive_clip_out", "negative_clip_out", "positive", "negative")
    FUNCTION = "process_selection"
    CATEGORY = "Shima/Styler"

    def process_selection(self, active, favorites_list, mode, connector, filter_mode, style_strength, include_negatives,
                          clip=None, conditioning_positive=None, conditioning_negative=None, 
                          selected_styles_idx="", base_string="", negative_string="", 
                          base_prompt="", shima_base_prompt_internal="",
                          use_commonparams=False, allow_external_linking=False,
                          unique_id=None, extra_pnginfo=None):
        
        # Default Returns
        empty_str = ""
        
        if not active:
             return (conditioning_positive, conditioning_negative, empty_str, empty_str)
        
        import json
        style_prompt = ""
        style_neg = ""
        was_injected = False
        
        try:
            # Use explicit selection indices if available, otherwise fallback to parsing the typed list
            selection_source = selected_styles_idx if selected_styles_idx else favorites_list
            
            if selection_source:
                # Handle both JSON list (legacy/grid) and comma-separated string (typed by user)
                raw_ids = []
                s_trimmed = selection_source.strip()
                if s_trimmed.startswith("["):
                    try:
                        raw_ids = json.loads(s_trimmed)
                    except:
                        raw_ids = [x.strip() for x in s_trimmed.split(",")]
                else:
                    raw_ids = [x.strip() for x in s_trimmed.split(",")]

                prompts = []
                neg_prompts = []
                
                for raw_id in raw_ids:
                    s_id = str(raw_id).strip()
                    if not s_id: continue
                    
                    target_item = None
                    upper_id = s_id.upper()
                    if upper_id.startswith("A") and upper_id[1:].isdigit():
                        try:
                            idx = int(upper_id[1:])
                            if 0 <= idx < len(_ARTISTS_DATA):
                                target_item = _ARTISTS_DATA[idx]
                        except: pass
                    elif upper_id.startswith("U") and upper_id[1:].isdigit():
                         try:
                            idx = int(upper_id[1:])
                            if 0 <= idx < len(_USER_STYLER_DATA):
                                target_item = _USER_STYLER_DATA[idx]
                         except: pass
                    else:
                        try:
                            s_clean = s_id.strip()
                            if s_clean.isdigit():
                                idx = int(s_clean)
                                if 0 <= idx < len(_STYLER_DATA):
                                    target_item = _STYLER_DATA[idx]
                        except: pass

                    if target_item:
                        name = target_item.get("name", "Unknown")
                        style_type = target_item.get("type", "artist")
                        
                        current_template = ""
                        current_neg = target_item.get("negative", "")
                        
                        is_user_style = False
                        if style_type == "user_style":
                            current_template = target_item.get("positive", name)
                            is_user_style = True
                        else:
                            current_template = f"style of {name}"

                        # --- SURGICAL WEIGHTING ---
                        # Apply weight only to the style bits, keeping the injected prompt at 1.0
                        if style_strength != 1.0:
                             if "{prompt}" in current_template:
                                  import re
                                  parts = current_template.split("{prompt}")
                                  weighted_parts = []
                                  for p in parts:
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
                                  current_template = f"({current_template}:{style_strength})"
                            
                        # --- SMART INJECTION ---
                        # Priority: 1. Input String | 2. New Internal String | 3. Input Cond | 4. Legacy Widget
                        actual_base = base_string
                        if not actual_base:
                             if shima_base_prompt_internal:
                                  actual_base = shima_base_prompt_internal
                             elif conditioning_positive:
                                  actual_base = "" 
                             else:
                                  actual_base = base_prompt if base_prompt else ""

                        if is_user_style:
                            inj, did = apply_prompt_injection(current_template, actual_base, not was_injected)
                            if did:
                                current_template = inj
                                was_injected = True
                            
                        prompts.append(current_template)
                        if current_neg and include_negatives:
                            neg_prompts.append(current_neg)

                if prompts:
                    style_prompt = connector.join(prompts)
                if neg_prompts:
                    style_neg = ", ".join(neg_prompts)
                    
        except Exception as e:
             print(f"[Shima Favorites] Parsing Error: {e}")

        # --- PROMPT COMBINATION ---
        actual_base = base_string
        if not actual_base:
             if shima_base_prompt_internal:
                  actual_base = shima_base_prompt_internal
             elif conditioning_positive:
                  actual_base = ""
             else:
                  actual_base = base_prompt if base_prompt else ""

        if was_injected:
             final_pos_str = style_prompt
        elif actual_base:
             final_pos_str = f"{actual_base}{connector}{style_prompt}" if style_prompt else actual_base
        else:
             final_pos_str = style_prompt
             
        final_neg_str = style_neg
        if negative_string:
             final_neg_str = f"{negative_string}{connector}{style_neg}" if style_neg else negative_string

        # Conditioning Logic
        final_pos_cond = conditioning_positive
        final_neg_cond = conditioning_negative
        
        if clip:
            try:
                def encode_text(text):
                    tokens = clip.tokenize(text)
                    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
                    return [[cond, {"pooled_output": pooled}]]
                
                new_pos_cond = encode_text(final_pos_str)
                new_neg_cond = encode_text(final_neg_str)
                
                if conditioning_positive:
                    final_pos_cond = conditioning_positive + new_pos_cond
                else:
                    final_pos_cond = new_pos_cond
                    
                if conditioning_negative:
                    final_neg_cond = conditioning_negative + new_neg_cond
                else:
                    final_neg_cond = new_neg_cond
                    
            except Exception as e:
                print(f"[Shima Favorites] Encoding Error: {e}")
        
        return (final_pos_cond, final_neg_cond, final_pos_str, final_neg_str)
