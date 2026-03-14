import re

class AnyType(str):
    """A wildcard type for ComfyUI inputs/outputs."""
    def __ne__(self, __value: object) -> bool:
        return False

# The wildcard instance
ANY = AnyType("*")

def safe_bool(val):
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val != 0
    if isinstance(val, str):
        low_val = val.lower().strip()
        if low_val in ["false", "0", "n", "no", "f", ""]:
            return False
        return True # Any other string is True
    if hasattr(val, "numel"): # Tensor check
        try:
            return bool(val.any())
        except:
            return False
    try:
        return bool(val)
    except:
        return False

# --- Design / Grouping ---

class ShimaBackdrop:
    """
    Minimalist backdrop node for graph organization.
    Visual properties are handled purely on the frontend.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "color_top": ("STRING", {"default": "#1a1a1a"}),
                "color_bottom": ("STRING", {"default": "#141414"}),
                "opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.1}),
                "opacity_target": (["Both", "Gradient", "Image"], {"default": "Both"}),
                "bg_image": ("STRING", {"default": "None"}),
                "scaling_mode": (["Stretch", "Fit", "Cover"], {"default": "Stretch"}),
                "image_scale_x": ("FLOAT", {"default": 1.0}),
                "image_scale_y": ("FLOAT", {"default": 1.0}),
                "offset_x": ("INT", {"default": 0}),
                "offset_y": ("INT", {"default": 0}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "Shima/Design"
    
    def execute(self, **kwargs):
        return ()

# --- Utilities ---

class ShimaStringConcat:
    """
    Concatenates multiple string inputs with a configurable separator.
    Supports dynamic inputs via kwargs.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "separator": (["None", "Space", "Comma", "Newline", "Custom"],),
                "custom_separator": ("STRING", {"default": ""}),
            },
            "optional": {
                "string_1": ("STRING", {"forceInput": True}),
                "string_2": ("STRING", {"forceInput": True}),
                "string_3": ("STRING", {"forceInput": True}),
                "string_4": ("STRING", {"forceInput": True}),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, separator, custom_separator, string_1=None, string_2=None, string_3=None, string_4=None, **kwargs):
        # 1. Determine separator
        sep_map = {
            "None": "",
            "Space": " ",
            "Comma": ", ",
            "Newline": "\n"
        }
        sep = sep_map.get(separator, "")
        if separator == "Custom":
            sep = custom_separator
            
        # 2. Collect inputs
        inputs = [string_1, string_2, string_3, string_4]
        values = [str(v) for v in inputs if v is not None]
        
        result = sep.join(values)
        return (result,)

class ShimaStringSplitter:
    """
    Splits a string into multiple outputs based on delimiters or regex.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True}),
                "delimiter": ("STRING", {"default": ","}),
                "use_regex": ("BOOLEAN", {"default": False}),
                "trim_whitespace": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("LIST", "INT", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("LIST", "count", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8")
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"

    def execute(self, text, delimiter, use_regex, trim_whitespace):
        if use_regex:
            try:
                parts = re.split(delimiter, text)
            except Exception as e:
                print(f"[Shima] Regex split error: {e}")
                parts = [text]
        else:
            parts = text.split(delimiter)

        if trim_whitespace:
            parts = [p.strip() for p in parts]
        
        # Ensure we have at least 8 elements for fixed outputs (empty strings if needed)
        fixed_outputs = parts[:8]
        while len(fixed_outputs) < 8:
            fixed_outputs.append("")
            
        return (parts, len(parts), *fixed_outputs)

class ShimaStringSwitch:
    """
    Selects one string output from multiple inputs via index.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 1, "min": 1, "max": 8, "step": 1}),
            },
            "optional": {
                "string_1": ("STRING", {"forceInput": True}),
                "string_2": ("STRING", {"forceInput": True}),
                "string_3": ("STRING", {"forceInput": True}),
                "string_4": ("STRING", {"forceInput": True}),
                "string_5": ("STRING", {"forceInput": True}),
                "string_6": ("STRING", {"forceInput": True}),
                "string_7": ("STRING", {"forceInput": True}),
                "string_8": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "TUPLE", "DICT")
    RETURN_NAMES = ("SELECTED", "ALL_CSV", "ALL_TUPLE", "ALL_DICT")
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"

    def execute(self, index, **kwargs):
        # Collect all string_n inputs
        strings = {}
        for i in range(1, 9):
            val = kwargs.get(f"string_{i}")
            if val is not None:
                strings[i] = str(val)
        
        # 1. Resolve selected
        selected = strings.get(index, "")
        
        # 2. Prepare combined outputs
        all_values = list(strings.values())
        all_csv = ", ".join(all_values)
        all_tuple = tuple(all_values)
        
        return (selected, all_csv, all_tuple, strings)

class ShimaChoiceSwitch:
    """
    Sticker-style toggle switch for Boolean, Integer, or String choices.
    Default state is Option 2 (False/2/String2).
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["Boolean", "Integer", "String"], {"default": "Boolean"}),
                "value": ("INT", {"default": 1, "min": 0, "max": 1, "hidden": True}), # 0: Opt 1, 1: Opt 2
                "option_1_str": ("STRING", {"default": "TRUE"}),
                "option_2_str": ("STRING", {"default": "FALSE"}),
                "option_1_color": ("STRING", {"default": "#3a5a7c"}), # Default blue-ish
                "option_2_color": ("STRING", {"default": "#571a1a"}), # Default red-ish
                "layout": (["Wide", "Stacked"], {"default": "Wide"}),
                "font_size": ("INT", {"default": 18, "min": 8, "max": 24}),
            },
        }

    RETURN_TYPES = (ANY, "BOOLEAN")
    RETURN_NAMES = ("choice", "boolean")
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    OUTPUT_NODE = True

    def execute(self, mode, value, option_1_str, option_2_str, **kwargs):
        # value 0 = Option 1 (TRUE/1/Str1), value 1 = Option 2 (FALSE/2/Str2)
        is_opt_1 = (value == 0)
        
        # Primary polymorphic output
        choice = None
        if mode == "Boolean":
            choice = True if is_opt_1 else False
        elif mode == "Integer":
            choice = 1 if is_opt_1 else 2
        else: # String
            choice = option_1_str if is_opt_1 else option_2_str
            
        # Raw boolean output (True if Opt 1 selected, False otherwise)
        raw_bool = True if is_opt_1 else False
            
        return (choice, raw_bool)

class ShimaTheNothing:
    """
    Passthrough node (Any -> Any). Use for routing organization.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any_input": (ANY, {}),
            },
            "optional": {
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("any_output",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, any_input, **kwargs):
        return (any_input,)

class ShimaHighwayBypass:
    """
    Structural toggle switch for bypassing workflow segments.
    Passes data through while providing a structural hook for frontend control.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "bypass_state": ("INT", {"default": 1, "min": 0, "max": 1, "hidden": True}), # 0: ROAD OPEN, 1: BYPASS
            },
            "optional": {
                "data": (ANY, {"forceInput": True}),
                "sync_input": ("INT", {"forceInput": True}),
            }
        }

    RETURN_TYPES = (ANY, "INT")
    RETURN_NAMES = ("passthrough", "bypass_state")
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, bypass_state=1, data=None, sync_input=None):
        # If sync_input is provided, it can be used to drive logic, 
        # but the frontend handle the visual/structural bypass toggling.
        if sync_input is not None:
            res_state = 0 if safe_bool(sync_input) else 1
        else:
            res_state = int(bypass_state)
            
        return (data, res_state)

class ShimaHighwayDetour:
    """
    Binary branching switch. Passes input to either Route 1 or Route 2.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "active_route": ("INT", {"default": 0, "min": 0, "max": 1, "hidden": True}), # 0: RT 1, 1: RT 2
                "label_1": ("STRING", {"default": "ROUTE 1"}),
                "label_2": ("STRING", {"default": "ROUTE 2"}),
            },
            "optional": {
                "data": (ANY, {"forceInput": True}),
                "route_automate": ("BOOLEAN", {"forceInput": True}),
            }
        }

    RETURN_TYPES = (ANY, ANY)
    RETURN_NAMES = ("Route 1", "Route 2")
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, active_route=0, label_1="", label_2="", data=None, route_automate=None, **kwargs):
        # Automation logic: True -> Route 1 (0), False -> Route 2 (1)
        if route_automate is not None:
            active_route = 0 if safe_bool(route_automate) else 1
            
        if active_route == 0:
            return (data, None)
        else:
            return (None, data)

class ShimaHighwayMerge:
    """
    Converges two paths back into one.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "merge_state": ("INT", {"default": 0, "min": 0, "max": 1, "hidden": True}),
                "label_1": ("STRING", {"default": "MERGE RT 1"}),
                "label_2": ("STRING", {"default": "MERGE RT 2"}),
            },
            "optional": {
                "Route_1": (ANY, {"forceInput": True}),
                "Route_2": (ANY, {"forceInput": True}),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("passthrough",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, merge_state=0, label_1="", label_2="", Route_1=None, Route_2=None, **kwargs):
        # Priority based on merge_state
        # Use safe_bool in case merge_state was somehow passed a tensor
        if safe_bool(merge_state == 0):
            return (Route_1 if Route_1 is not None else Route_2,)
        else:
            return (Route_2 if Route_2 is not None else Route_1,)

class ShimaHighwayBypassTerminator:
    """
    Acts as a 'firewall' stop-point for the Highway Bypass system.
    Passes data through but signals the frontend to stop traversal.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "data": (ANY, {"forceInput": True}),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("data",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, data=None):
        return (data,)

class ShimaBreaker:
    """
    Master controller for Panel switches.
    Outputs a sync state (0/1) that can be linked to Panel switches.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "breaker_state": ("INT", {"default": 0, "min": 0, "max": 1, "hidden": True}),
                "sync_mode": ("INT", {"default": 0, "min": 0, "max": 1, "hidden": True}), # 0: Breaker (B), 1: Toggle (T)
            },
            "optional": {
                "switch_automate": ("BOOLEAN", {"forceInput": True}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("sync_state",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"

    def execute(self, breaker_state=0, sync_mode=0, switch_automate=None, scale=1.0, **kwargs):
        # Automation takes precedence
        if switch_automate is not None:
            breaker_state = 1 if safe_bool(switch_automate) else 0
            
        return {"ui": {"state": [breaker_state]}, "result": (breaker_state,)}

class ShimaPanelSwitch:
    """
    Individual switch node (reroute-style).
    Transitions between ROAD OPEN and BYPASS states.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "data": (ANY, {"forceInput": True}),
                "switch_state": ("INT", {"default": 0, "min": 0, "max": 1, "hidden": True}),
            },
            "optional": {
                "sync_input": (ANY, {"forceInput": True}), # Hidden connector for sync signal
            }
        }

    RETURN_TYPES = (ANY, "BOOLEAN")
    RETURN_NAMES = ("passthrough", "boolean")
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"

    def execute(self, data=None, switch_state=0, sync_input=None, **kwargs):
        # If sync_input is provided (automation), determine the state
        if sync_input is not None:
             switch_state = 0 if safe_bool(sync_input) else 1
             
        # State: 0 = ON/Pass, 1 = OFF/Bypass
        is_active = (switch_state == 0)

        # Always return data; the bypass state is handled by the frontend.
        # We send the state to UI for visual sync
        # The secondary output gives a raw boolean mapping for logic arrays
        return {"ui": {"state": [switch_state]}, "result": (data, is_active)}

class ShimaPilotLight:
    """
    Status indicator with volumetric glow.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any_input": (ANY, {}),
                "base_color": ("STRING", {"default": "#ff0000"}),
                "trigger_type": (["Boolean", "String Match", "Number Match", "Tensor Detect", "Hardware Sync", "Always On"], {"default": "Boolean"}),
                "comparison_value": ("STRING", {"default": ""}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
            },
        }
    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, any_input, base_color, trigger_type="Boolean", comparison_value="", scale=1.0):
        state = False
        
        try:
            if trigger_type == "Always On":
                state = True
            elif trigger_type == "Boolean":
                state = safe_bool(any_input)
            elif trigger_type == "Tensor Detect":
                import torch
                if isinstance(any_input, torch.Tensor):
                    state = torch.sum(any_input).item() > 0
            elif trigger_type == "String Match":
                val = str(any_input)
                comp = str(comparison_value)
                if comp.startswith("!="): state = val != comp[2:].strip()
                elif comp.startswith("="): state = val == comp[1:].strip()
                else: state = val == comp
            elif trigger_type == "Number Match":
                try:
                    val = float(any_input)
                    comp_str = str(comparison_value).strip()
                    if comp_str.startswith(">="): state = val >= float(comp_str[2:])
                    elif comp_str.startswith("<="): state = val <= float(comp_str[2:])
                    elif comp_str.startswith(">"): state = val > float(comp_str[1:])
                    elif comp_str.startswith("<"): state = val < float(comp_str[1:])
                    elif comp_str.startswith("!="): state = val != float(comp_str[2:])
                    elif comp_str.startswith("=="): state = val == float(comp_str[2:])
                    elif comp_str.startswith("="): state = val == float(comp_str[1:])
                    else: state = val == float(comp_str)
                except:
                    state = False
        except Exception as e:
            print(f"[Shima.PilotLight] Logic Error: {e}")
            state = False

        return {"ui": {"state": [state]}, "result": ()}

class ShimaDymoLabel:
    """
    Embossed plastic label node.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"default": "LABEL", "multiline": True}),
                "base_color": ("STRING", {"default": "#000000"}),
                "font_size": ("INT", {"default": 18, "min": 10, "max": 40}),
                "jitter": ("BOOLEAN", {"default": True}),
            },
        }
    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, **kwargs):
        return ()

class ShimaMultiStateIndicator:
    """
    3-State control room indicator (Off, State 1, State 2).
    Supports 6 trigger modes: Hardware Sync, Number Match, Math, String, Regex, Boolean.
    Outputs a pass-through of the input value.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any_input": (ANY, {}),
                "color_1": ("STRING", {"default": "#00ff00"}),  # Green
                "color_2": ("STRING", {"default": "#ff0000"}),  # Red
                "color_off": ("STRING", {"default": "#222222"}),  # Dark
                "trigger_type": (["Hardware Sync", "Number Match", "Math", "String", "Regex", "Boolean"], {"default": "Hardware Sync"}),
                "state_1_value": ("STRING", {"default": "1.0"}),
                "state_2_value": ("STRING", {"default": "0.0"}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
            },
        }
    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"
    CATEGORY = "Shima/System"
    OUTPUT_NODE = True

    def _eval_math(self, val, expression):
        """Evaluate a math comparison expression like '>1.0', '<=2.5', '!=0'."""
        expression = expression.strip()
        if not expression:
            return False
        # Parse operator and threshold
        for op in [">=", "<=", "!=", "==", ">", "<"]:
            if expression.startswith(op):
                try:
                    threshold = float(expression[len(op):].strip())
                    if op == ">": return val > threshold
                    elif op == "<": return val < threshold
                    elif op == ">=": return val >= threshold
                    elif op == "<=": return val <= threshold
                    elif op == "==": return val == threshold
                    elif op == "!=": return val != threshold
                except ValueError:
                    return False
        # Bare number = exact match
        try:
            return val == float(expression)
        except ValueError:
            return False

    def execute(self, any_input, color_1, color_2, color_off, trigger_type, state_1_value, state_2_value, scale=1.0):
        state = 0
        pass_value = any_input

        if trigger_type == "Number Match":
            try:
                val = float(any_input)
                try:
                    if val == float(state_2_value):
                        state = 2
                except ValueError:
                    pass
                if state == 0:
                    try:
                        if val == float(state_1_value):
                            state = 1
                    except ValueError:
                        pass
            except (ValueError, TypeError):
                state = 0

        elif trigger_type == "Math":
            try:
                val = float(any_input)
                # Check State 2 first (typically higher threshold)
                if self._eval_math(val, state_2_value):
                    state = 2
                elif self._eval_math(val, state_1_value):
                    state = 1
            except (ValueError, TypeError):
                state = 0

        elif trigger_type == "String":
            input_str = str(any_input) if any_input is not None else ""
            if input_str == state_2_value:
                state = 2
            elif input_str == state_1_value:
                state = 1

        elif trigger_type == "Regex":
            input_str = str(any_input) if any_input is not None else ""
            try:
                if state_2_value and re.search(state_2_value, input_str):
                    state = 2
                elif state_1_value and re.search(state_1_value, input_str):
                    state = 1
            except re.error:
                state = 0

        elif trigger_type == "Boolean":
            if isinstance(any_input, bool):
                state = 1 if any_input else 2
            elif isinstance(any_input, (int, float)):
                if any_input == 1:
                    state = 1
                elif any_input == 0:
                    state = 2
                else:
                    state = 0  # Non-boolean number → Off
            elif isinstance(any_input, str):
                low = any_input.strip().lower()
                if low in ("true", "1", "t", "y", "yes"):
                    state = 1
                elif low in ("false", "0", "f", "n", "no"):
                    state = 2
                else:
                    state = 0  # Non-boolean string → Off
            else:
                state = 0

        # Hardware Sync is handled entirely in JS (reads link state in real-time)
        # Python just passes through

        return {"ui": {"state": [state]}, "result": (pass_value,)}

class ShimaRGBIndicator:
    """
    3-Channel logic array indicator (Additively blends R, G, B inputs).
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "r_color": ("STRING", {"default": "#ff0000"}),
                "g_color": ("STRING", {"default": "#00ff00"}),
                "b_color": ("STRING", {"default": "#0000ff"}),
                "r_eval": ("STRING", {"default": ""}),
                "g_eval": ("STRING", {"default": ""}),
                "b_eval": ("STRING", {"default": ""}),
                "trigger_type": (["Boolean", "Number (>0)", "Hardware Sync", "Shima Eval (eval|||val)"], {"default": "Boolean"}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
                "hw_sync_state": ("STRING", {"default": "false,false,false", "hidden": True}),
            },
            "optional": {
                "r_in": (ANY, ),
                "g_in": (ANY, ),
                "b_in": (ANY, ),
            }
        }
    RETURN_TYPES = ("STRING", "TUPLE")
    RETURN_NAMES = ("csv_output", "eval_bool")
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, r_color, g_color, b_color, r_eval, g_eval, b_eval, trigger_type, scale=1.0, hw_sync_state="false,false,false", r_in=None, g_in=None, b_in=None):
        r_state = False; g_state = False; b_state = False
        val_r = ""; val_g = ""; val_b = ""

        if trigger_type == "Boolean":
            def eval_bool(v_in, v_eval):
                v_in_str = str(v_in) if v_in is not None else ""
                if not v_in_str: return False, ""
                
                state = safe_bool(v_in)
                if state:
                    e = str(v_eval).strip() if v_eval is not None else ""
                    return True, (e if e else "True")
                return False, ""

            r_state, val_r = eval_bool(r_in, r_eval)
            g_state, val_g = eval_bool(g_in, g_eval)
            b_state, val_b = eval_bool(b_in, b_eval)

        elif trigger_type == "Number (>0)":
            def eval_num(v_in, v_eval):
                if v_in is None: return False, ""
                v_in_str = str(v_in).strip()
                if not v_in_str: return False, ""
                
                try: 
                    num = float(v_in_str)
                    if num > 0:
                        e = str(v_eval).strip() if v_eval is not None else ""
                        return True, (e if e else "True")
                    else:
                        return False, ""
                except ValueError:
                    # NaN case: output pass the input value
                    return False, v_in_str

            r_state, val_r = eval_num(r_in, r_eval)
            g_state, val_g = eval_num(g_in, g_eval)
            b_state, val_b = eval_num(b_in, b_eval)

        elif trigger_type == "Hardware Sync":
            parts = [p.strip().lower() == "true" for p in hw_sync_state.split(",")]
            if len(parts) != 3: parts = [False, False, False]
            
            def eval_hw(v_state, v_in, v_eval):
                if not v_state: return False, ""
                e = str(v_eval).strip() if v_eval is not None else ""
                if e: return True, e
                # Passes through the value from the switch
                v_in_str = str(v_in) if v_in is not None else ""
                return True, v_in_str

            r_state, val_r = eval_hw(parts[0], r_in, r_eval)
            g_state, val_g = eval_hw(parts[1], g_in, g_eval)
            b_state, val_b = eval_hw(parts[2], b_in, b_eval)

        elif trigger_type == "Shima Eval (eval|||val)":
            def parse_eval(v_in, v_eval):
                if v_in is None: return False, ""
                v_in_str = str(v_in)
                if not v_in_str: return False, ""
                
                b = str(v_eval).strip() if v_eval is not None else ""
                
                if "|||" in b:
                    left, right = [p.strip() for p in b.split("|||", 1)]
                    
                    # Same boolean-loose matching as Transformer
                    match = (v_in_str == left)
                    if not match and isinstance(v_in, bool):
                        low_left = left.lower()
                        if low_left in ["true", "1", "t", "y"] and v_in is True:
                            match = True
                        elif low_left in ["false", "0", "f", "n"] and v_in is False:
                            match = True
                            
                    if match:
                        return True, right
                    return False, v_in_str
                
                # If missing |||, pass through value sent
                return safe_bool(v_in_str), v_in_str

            r_state, val_r = parse_eval(r_in, r_eval)
            g_state, val_g = parse_eval(g_in, g_eval)
            b_state, val_b = parse_eval(b_in, b_eval)

        bool_output = (r_state, g_state, b_state)

        active_vals = []
        if str(val_r).strip(): active_vals.append(str(val_r).strip())
        if str(val_g).strip(): active_vals.append(str(val_g).strip())
        if str(val_b).strip(): active_vals.append(str(val_b).strip())
        
        csv_out = ", ".join(active_vals)

        return {"ui": {"state": [{"r": r_state, "g": g_state, "b": b_state}]}, "result": (csv_out, bool_output)}

class ShimaFader:
    """
    Vertical interactive slider with absolute float/int outputs.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("FLOAT", {"default": 0.0, "min": -99999.0, "max": 99999.0, "step": 0.001, "hidden": True}),
                "min_val": ("FLOAT", {"default": 0.0, "min": -99999.0, "max": 99999.0, "step": 0.1}),
                "max_val": ("FLOAT", {"default": 1.0, "min": -99999.0, "max": 99999.0, "step": 0.1}),
                "step": ("FLOAT", {"default": 0.01, "min": 0.001, "max": 100.0, "step": 0.001}),
                "readout_color": ("STRING", {"default": "#ffaa00"}),
                "led_1_color": ("STRING", {"default": "#00ff00"}),
                "led_1_max": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 1.0, "step": 0.05}),
                "led_2_color": ("STRING", {"default": "#ffff00"}),
                "led_2_max": ("FLOAT", {"default": 0.8, "min": 0.0, "max": 1.0, "step": 0.05}),
                "led_3_color": ("STRING", {"default": "#ff0000"}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
            },
            "optional": {
                "show_readout": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("FLOAT", "INT")
    RETURN_NAMES = ("float_val", "int_val")
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, value=0.0, scale=1.0, **kwargs):
        # UI handles the persistence and rounding. This just passes it.
        return (float(value), int(round(value)))

class ShimaKnob:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "value": ("FLOAT", {"default": 0.0, "step": 0.001}),  # Hidden persistent state
            },
            "optional": {
                "min_val": ("FLOAT", {"default": 0.0, "step": 0.1}),
                "max_val": ("FLOAT", {"default": 1.0, "step": 0.1}),
                "step": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "led_color": ("STRING", {"default": "#ffaa00"}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
                "show_readout": ("BOOLEAN", {"default": True}),
                "readout_color": ("STRING", {"default": "#ffaa00"}),
            },
        }

    RETURN_TYPES = ("FLOAT", "INT")
    RETURN_NAMES = ("float_val", "int_val")
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, value=0.0, scale=1.0, **kwargs):
        return (float(value), int(round(value)))

class ShimaOmnijog:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "active_channel": ("STRING", {"default": "CFG", "hidden": True}), # Stores 0-7 index or raw label internally via JS
                "val_0": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_1": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_2": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_3": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_4": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_5": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_6": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_7": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
            },
            "optional": {
                "label_0": ("STRING", {"default": "CFG"}),
                "label_1": ("STRING", {"default": "SEED"}),
                "label_2": ("STRING", {"default": "LORA1"}),
                "label_3": ("STRING", {"default": "LORA2"}),
                "label_4": ("STRING", {"default": "LORA3"}),
                "label_5": ("STRING", {"default": "LORA4"}),
                "label_6": ("STRING", {"default": "LORA5"}),
                "label_7": ("STRING", {"default": "LORA6"}),
                "step_0": ("FLOAT", {"default": 0.1, "step": 0.001}),
                "step_1": ("FLOAT", {"default": 1.0, "step": 0.001}),
                "step_2": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_3": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_4": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_5": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_6": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_7": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "colors": ("STRING", {"default": "#ffaa00,#00aaff,#55ff55,#ff55aa,#aa55ff,#ffaa55,#55ffff,#ffff55,#0055ff,#ff0055"}),
                "rows": ("INT", {"default": 10, "min": 2, "max": 20, "step": 2}), 
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
                
                # --- Appended sequentially at the bottom so we DO NOT break positional mapping of old nodes ---
                "val_8": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_9": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_10": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_11": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_12": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_13": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_14": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_15": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_16": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_17": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_18": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "val_19": ("FLOAT", {"default": 0.0, "step": 0.001, "hidden": True}),
                "label_8": ("STRING", {"default": "LORA7"}),
                "label_9": ("STRING", {"default": "LORA8"}),
                "label_10": ("STRING", {"default": "LORA9"}),
                "label_11": ("STRING", {"default": "LORA10"}),
                "label_12": ("STRING", {"default": "LORA11"}),
                "label_13": ("STRING", {"default": "LORA12"}),
                "label_14": ("STRING", {"default": "LORA13"}),
                "label_15": ("STRING", {"default": "LORA14"}),
                "label_16": ("STRING", {"default": "LORA15"}),
                "label_17": ("STRING", {"default": "LORA16"}),
                "label_18": ("STRING", {"default": "LORA17"}),
                "label_19": ("STRING", {"default": "LORA18"}),
                "step_8": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_9": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_10": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_11": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_12": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_13": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_14": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_15": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_16": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_17": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_18": ("FLOAT", {"default": 0.01, "step": 0.001}),
                "step_19": ("FLOAT", {"default": 0.01, "step": 0.001}),
            }
        }

    RETURN_TYPES = ("MUX",)
    RETURN_NAMES = ("mux_out",)
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, active_channel="0", **kwargs):
        # JS sets `active_channel` to "0" through "19".
        active_idx = str(active_channel)
        
        mux_dict = {}
        rows = int(kwargs.get("rows", 10))
        
        # Package all rows into a multiplexed dictionary
        for i in range(rows):
            lbl = kwargs.get(f"label_{i}", f"CH{i+1}")
            val = kwargs.get(f"val_{i}", 0.0)
            
            # Use the label as the key. Values are tupled (label, float, int)
            mux_dict[lbl] = (lbl, float(val), int(round(val)))
            
        # Add metadata for legacy or specific active-channel needs
        # We also pass the currently active channel explicitly
        active_lbl = kwargs.get(f"label_{active_idx}", kwargs.get("label_0", "CFG"))
        active_val = kwargs.get(f"val_{active_idx}", kwargs.get("val_0", 0.0))
        
        mux_dict["_active_"] = (active_lbl, float(active_val), int(round(active_val)))

        return (mux_dict,)


class ShimaDemux:
    def __init__(self):
        # We cache the last known matching values so we can relay them even when 
        # the MUX changes to a different channel and ignores us.
        self.last_float = 0.0
        self.last_int = 0

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mux_in": ("MUX", {"tooltip": "Connect the MUX output from an Omnijog."}),
                "target_channel": ("STRING", {"default": "CFG"}),
            },
            "optional": {
                "show_labels": ("BOOLEAN", {"default": True, "hidden": True}),
            }
        }

    RETURN_TYPES = ("FLOAT", "INT")
    RETURN_NAMES = ("float_val", "int_val")
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, mux_in=None, target_channel="", show_labels=True):
        if isinstance(mux_in, dict):
            # NEW: Multiplexed dictionary payload
            if target_channel in mux_in:
                _, in_float, in_int = mux_in[target_channel]
                self.last_float = in_float
                self.last_int = in_int
            else:
                # If target channel isn't found in the dict at all, we keep the last known cache.
                pass 
        elif mux_in and isinstance(mux_in, tuple) and len(mux_in) == 3:
            # LEGACY: Single active tuple payload
            in_label, in_float, in_int = mux_in
            if in_label == target_channel:
                self.last_float = in_float
                self.last_int = in_int
        
        return (self.last_float, self.last_int)


class ShimaDemuxList:
    def __init__(self):
        self.last_string = ""
        self.last_float = 0.0
        self.last_int = 0

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mux_in": ("MUX", {"tooltip": "Connect the MUX output from an Omnijog."}),
                "target_channel": ("STRING", {"default": "SAMPLER"}),
                "options": ("STRING", {"multiline": True, "default": "Euler, Euler A, DPM++ 2M"}),
            },
            "optional": {
                "show_labels": ("BOOLEAN", {"default": True, "hidden": True}),
            }
        }

    RETURN_TYPES = ("STRING", "*")
    RETURN_NAMES = ("string_val", "any_val")
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, mux_in=None, target_channel="", options="", show_labels=True):
        f_val = 0.0
        i_val = 0
        
        # NEW Dict Parsing
        if isinstance(mux_in, dict):
            if target_channel in mux_in:
                _, f_val, i_val = mux_in[target_channel]
            self.last_float = f_val
            self.last_int = i_val
        # LEGACY Tuple Parsing
        elif mux_in and isinstance(mux_in, tuple) and len(mux_in) == 3:
            in_label, f_val, i_val = mux_in
            if in_label == target_channel:
                self.last_float = f_val
                self.last_int = i_val
            else:
                # If it's a tuple and wrong channel, use cache
                f_val = self.last_float
                i_val = self.last_int

        if options:
            # Parse comma-separated list
            opts = [opt.strip() for opt in options.split(",") if opt.strip()]
            if opts:
                # Map the integer to the list length using modulo
                idx = i_val % len(opts)
                return (opts[idx], opts[idx])
        
        return ("", "")

class ShimaCustodian:
    """
    Maintenance utility node.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}
    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self):
        return ()

class ShimaControlPanel:
    """
    Wireless UI Dashboard Node. Runs entirely in Javascript frontend.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "scale": ("FLOAT", {"default": 1.0, "min": 0.5, "max": 4.0, "step": 0.1}),
                "payload": ("STRING", {"default": "{}", "hidden": True}),
            }
        }
    RETURN_TYPES = ("STRING", "DICT")
    RETURN_NAMES = ("JSON", "DICT")
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, scale=1.0, payload="{}", **kwargs):
        import json
        try:
            data = json.loads(payload)
        except:
            data = {}
        return (payload, data)



# -------------------------------------------------------------
# PHASE 12: THE PANELIZED ECOSYSTEM (BNDL PIPING)
# -------------------------------------------------------------

class ShimaPacker_ModelCitizen:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "model": ("MODEL",),
            "clip": ("CLIP",),
            "vae": ("VAE",),
        }}
    RETURN_TYPES = ("BNDL",)
    RETURN_NAMES = ("modelcitizen.bndl",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"

    def execute(self, model, clip, vae):
        bndl = {
            "bndl_type": "modelcitizen",
            "model": model,
            "clip": clip,
            "vae": vae
        }
        return (bndl,)

class ShimaPacker_LatentMaker:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "latent": ("LATENT",),
        },
        "optional": {
            "s33d": ("INT", {"forceInput": True}),
            "width": ("INT", {"forceInput": True}),
            "height": ("INT", {"forceInput": True}),
        }}
    RETURN_TYPES = ("BNDL",)
    RETURN_NAMES = ("latentmaker.bndl",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"

    def execute(self, latent, s33d=None, width=None, height=None):
        bndl = {
            "bndl_type": "latentmaker",
            "latent": latent,
            "s33d": s33d,
            "width": width,
            "height": height
        }
        return (bndl,)

class ShimaPacker_MasterPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "positive": ("CONDITIONING",),
            "negative": ("CONDITIONING",),
        },
        "optional": {
            "clip_l": ("CONDITIONING",),
            "clip_g": ("CONDITIONING",),
            "t5": ("CONDITIONING",),
            "pos_string": ("STRING", {"forceInput": True}),
            "neg_string": ("STRING", {"forceInput": True}),
        }}
    RETURN_TYPES = ("BNDL",)
    RETURN_NAMES = ("masterprompt.bndl",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"

    def execute(self, positive, negative, clip_l=None, clip_g=None, t5=None, pos_string=None, neg_string=None, **kwargs):
        bndl = {
            "bndl_type": "masterprompt",
            "pos": positive,
            "neg": negative,
            "clip_l": clip_l,
            "clip_g": clip_g,
            "t5": t5,
            "pos_string": pos_string,
            "neg_string": neg_string
        }
        return (bndl,)


# ----------------------------------------------------------------
# BNDL REGISTRY
# To add support for a new BNDL type in the future:
#   1. Add an entry to BNDL_REGISTRY below with the schema.
#   2. The DeBNDLer and ReBNDLer will automatically pick it up.
#
# Schema format:
#   "bndl_type_name": {
#       "label": "Human-readable name",
#       "fields": [
#           ("field_key_in_dict", "COMFYUI_TYPE", "Display Name"),
#       ]
#   }
# ----------------------------------------------------------------

BNDL_REGISTRY = {
    "modelcitizen": {
        "label": "Model Citizen",
        "fields": [
            ("model", "MODEL", "Model"),
            ("clip", "CLIP", "Clip"),
            ("vae", "VAE", "VAE"),
        ]
    },
    "masterprompt": {
        "label": "Master Prompt",
        "fields": [
            ("pos", "CONDITIONING", "Positive"),
            ("neg", "CONDITIONING", "Negative"),
        ]
    },
    "latentmaker": {
        "label": "Latent Maker",
        "fields": [
            ("latent", "LATENT", "Latent"),
        ]
    },
    "shimasampler": {
        "label": "Shima Sampler",
        "fields": [
            ("image", "IMAGE", "Image"),
            ("latent", "LATENT", "Latent"),
            ("s33d_used", "INT", "Seed Used"),
        ]
    },
}

# Pre-compute the union of all possible output types (used by DeBNDLer)
_ALL_OUTPUT_TYPES = []
_ALL_OUTPUT_NAMES = []
_ALL_FIELD_MAP = {}  # (bndl_type, field_key) -> index

_idx = 0
for bndl_type, schema in BNDL_REGISTRY.items():
    for field_key, comfy_type, display_name in schema["fields"]:
        _ALL_OUTPUT_TYPES.append(comfy_type)
        _ALL_OUTPUT_NAMES.append(f"{display_name} ({schema['label']})")
        _ALL_FIELD_MAP[(bndl_type, field_key)] = _idx
        _idx += 1

class ShimaDeBNDL_ModelCitizen:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"bndl": ("BNDL", {"tooltip": "Model Citizen BNDL"}), "allow_external_linking": ("BOOLEAN", {"default": False})}}
    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING")
    RETURN_NAMES = ("Model", "Clip", "VAE", "name_string")
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    OUTPUT_NODE = True

    def execute(self, bndl, allow_external_linking=False):
        return {"ui": {"used_values": ["Type: Model Citizen"]}, "result": (bndl.get("model"), bndl.get("clip"), bndl.get("vae"), bndl.get("name_string"))}

class ShimaReBNDL_ModelCitizen:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"allow_external_linking": ("BOOLEAN", {"default": False})},
                "optional": {"model": ("MODEL",), "clip": ("CLIP",), "vae": ("VAE",), "name_string": ("STRING", {"forceInput": True})}}
    RETURN_TYPES = ("BNDL",)
    RETURN_NAMES = ("modelcitizen.bndl",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    OUTPUT_NODE = True

    def execute(self, allow_external_linking=False, model=None, clip=None, vae=None, name_string=None):
        return {"ui": {"used_values": ["Type: Model Citizen"]}, "result": ({"bndl_type": "modelcitizen", "model": model, "clip": clip, "vae": vae, "name_string": name_string},)}

class ShimaDeBNDL_MasterPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"bndl": ("BNDL", {"tooltip": "Master Prompt BNDL"}), "allow_external_linking": ("BOOLEAN", {"default": False})}}
    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "CONDITIONING", "CONDITIONING", "CONDITIONING", "STRING", "STRING")
    RETURN_NAMES = ("positive", "negative", "CLIP_L_ONLY", "CLIP_G_ONLY", "T5_ONLY", "pos_string", "neg_string")
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    OUTPUT_NODE = True

    def execute(self, bndl, allow_external_linking=False):
        return {"ui": {"used_values": ["Type: Master Prompt"]}, "result": (bndl.get("pos"), bndl.get("neg"), bndl.get("clip_l"), bndl.get("clip_g"), bndl.get("t5"), bndl.get("pos_string"), bndl.get("neg_string"))}

class ShimaReBNDL_MasterPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"allow_external_linking": ("BOOLEAN", {"default": False})},
                "optional": {"positive": ("CONDITIONING",), "negative": ("CONDITIONING",), "CLIP_L_ONLY": ("CONDITIONING",), "CLIP_G_ONLY": ("CONDITIONING",), "T5_ONLY": ("CONDITIONING",), "pos_string": ("STRING", {"forceInput": True}), "neg_string": ("STRING", {"forceInput": True})}}
    RETURN_TYPES = ("BNDL",)
    RETURN_NAMES = ("masterprompt.bndl",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    OUTPUT_NODE = True

    def execute(self, allow_external_linking=False, positive=None, negative=None, CLIP_L_ONLY=None, CLIP_G_ONLY=None, T5_ONLY=None, pos_string=None, neg_string=None, **kwargs):
        if positive is None: positive = kwargs.get("pos")
        if negative is None: negative = kwargs.get("neg")
        return {"ui": {"used_values": ["Type: Master Prompt"]}, "result": ({"bndl_type": "masterprompt", "pos": positive, "neg": negative, "clip_l": CLIP_L_ONLY, "clip_g": CLIP_G_ONLY, "t5": T5_ONLY, "pos_string": pos_string, "neg_string": neg_string},)}

class ShimaDeBNDL_LatentMaker:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"bndl": ("BNDL", {"tooltip": "Latent Maker BNDL"}), "allow_external_linking": ("BOOLEAN", {"default": False})}}
    RETURN_TYPES = ("LATENT", "INT", "INT", "INT")
    RETURN_NAMES = ("latent", "s33d", "width", "height")
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    OUTPUT_NODE = True

    def execute(self, bndl, allow_external_linking=False):
        return {"ui": {"used_values": ["Type: Latent Maker"]}, "result": (bndl.get("latent"), bndl.get("s33d"), bndl.get("width"), bndl.get("height"))}

class ShimaReBNDL_LatentMaker:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"allow_external_linking": ("BOOLEAN", {"default": False})},
                "optional": {"latent": ("LATENT",), "s33d": ("INT", {"forceInput": True}), "width": ("INT", {"forceInput": True}), "height": ("INT", {"forceInput": True})}}
    RETURN_TYPES = ("BNDL",)
    RETURN_NAMES = ("latentmaker.bndl",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    OUTPUT_NODE = True

    def execute(self, allow_external_linking=False, latent=None, s33d=None, width=None, height=None):
        return {"ui": {"used_values": ["Type: Latent Maker"]}, "result": ({"bndl_type": "latentmaker", "latent": latent, "s33d": s33d, "width": width, "height": height},)}

class ShimaDeBNDL_ShimaSampler:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"bndl": ("BNDL", {"tooltip": "Shima Sampler BNDL"}), "allow_external_linking": ("BOOLEAN", {"default": False})}}
    RETURN_TYPES = ("IMAGE", "LATENT", "INT")
    RETURN_NAMES = ("Image", "Latent", "Seed Used")
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    OUTPUT_NODE = True

    def execute(self, bndl, allow_external_linking=False):
        return {"ui": {"used_values": ["Type: Shima Sampler"]}, "result": (bndl.get("image"), bndl.get("latent"), bndl.get("s33d_used"))}

class ShimaReBNDL_ShimaSampler:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"allow_external_linking": ("BOOLEAN", {"default": False})},
                "optional": {"image": ("IMAGE",), "latent": ("LATENT",), "s33d_used": ("INT",)}}
    RETURN_TYPES = ("BNDL",)
    RETURN_NAMES = ("shimasampler.bndl",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    OUTPUT_NODE = True

    def execute(self, allow_external_linking=False, image=None, latent=None, s33d_used=None):
        return {"ui": {"used_values": ["Type: Shima Sampler"]}, "result": ({"bndl_type": "shimasampler", "image": image, "latent": latent, "s33d_used": s33d_used},)}

NODE_CLASS_MAPPINGS = {
    "Shima.StringConcat": ShimaStringConcat,
    "Shima.StringSplitter": ShimaStringSplitter,
    "Shima.StringSwitch": ShimaStringSwitch,
    "Shima.ChoiceSwitch": ShimaChoiceSwitch,
    "Shima.TheNothing": ShimaTheNothing,
    "Shima.HighwayBypass": ShimaHighwayBypass,
    "Shima.HighwayDetour": ShimaHighwayDetour,
    "Shima.HighwayMerge": ShimaHighwayMerge,
    "Shima.HighwayBypassTerminator": ShimaHighwayBypassTerminator,
    "Shima.Breaker": ShimaBreaker,
    "Shima.PanelSwitch": ShimaPanelSwitch,
    "Shima.Backdrop": ShimaBackdrop,
    "Shima.PilotLight": ShimaPilotLight,
    "Shima.MultiStateIndicator": ShimaMultiStateIndicator,
    "Shima.RGBIndicator": ShimaRGBIndicator,
    "Shima.DymoLabel": ShimaDymoLabel,
    "Shima.Fader": ShimaFader,
    "Shima.Knob": ShimaKnob,
    "Shima.Omnijog": ShimaOmnijog,
    "Shima.Demux": ShimaDemux,
    "Shima.DemuxList": ShimaDemuxList,
    "Shima.Custodian": ShimaCustodian,
    "Shima.ControlPanel": ShimaControlPanel,
    "Shima.Packer_ModelCitizen": ShimaPacker_ModelCitizen,
    "Shima.Packer_LatentMaker": ShimaPacker_LatentMaker,
    "Shima.Packer_MasterPrompt": ShimaPacker_MasterPrompt,
    "Shima.DeBNDL_ModelCitizen": ShimaDeBNDL_ModelCitizen,
    "Shima.ReBNDL_ModelCitizen": ShimaReBNDL_ModelCitizen,
    "Shima.DeBNDL_MasterPrompt": ShimaDeBNDL_MasterPrompt,
    "Shima.ReBNDL_MasterPrompt": ShimaReBNDL_MasterPrompt,
    "Shima.DeBNDL_LatentMaker": ShimaDeBNDL_LatentMaker,
    "Shima.ReBNDL_LatentMaker": ShimaReBNDL_LatentMaker,
    "Shima.DeBNDL_ShimaSampler": ShimaDeBNDL_ShimaSampler,
    "Shima.ReBNDL_ShimaSampler": ShimaReBNDL_ShimaSampler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.StringConcat": "Shima String Concat",
    "Shima.StringSplitter": "Shima String Splitter",
    "Shima.StringSwitch": "Shima String Switch",
    "Shima.ChoiceSwitch": "Shima Choice Switch",
    "Shima.TheNothing": "Shima The Nothing",
    "Shima.HighwayBypass": "Shima Highway Bypass",
    "Shima.HighwayDetour": "Shima Highway Detour",
    "Shima.HighwayMerge": "Shima Highway Merge",
    "Shima.HighwayBypassTerminator": "Shima Highway End Bypass",
    "Shima.Breaker": "Shima Breaker",
    "Shima.PanelSwitch": "Shima Panel Switch",
    "Shima.Backdrop": "Shima Backdrop",
    "Shima.PilotLight": "Shima Pilot Light",
    "Shima.MultiStateIndicator": "Shima 3-State Indicator",
    "Shima.RGBIndicator": "Shima RGB Array",
    "Shima.DymoLabel": "Shima Dymo Label",
    "Shima.Fader": "Shima Fader",
    "Shima.Knob": "Shima Knob",
    "Shima.Omnijog": "Shima Omnijog",
    "Shima.Demux": "Shima Demux",
    "Shima.DemuxList": "Shima Demux List",
    "Shima.Custodian": "Shima Custodian",
    "Shima.ControlPanel": "Shima Control Panel",
    "Shima.Packer_ModelCitizen": "Shima ReBNDLer (Model Citizen)",
    "Shima.Packer_LatentMaker": "Shima ReBNDLer (Latent Maker)",
    "Shima.Packer_MasterPrompt": "Shima ReBNDLer (Master Prompt)",
    "Shima.DeBNDL_ModelCitizen": "DeBNDLer (Model Citizen)",
    "Shima.ReBNDL_ModelCitizen": "ReBNDLer (Model Citizen)",
    "Shima.DeBNDL_MasterPrompt": "DeBNDLer (Master Prompt)",
    "Shima.ReBNDL_MasterPrompt": "ReBNDLer (Master Prompt)",
    "Shima.DeBNDL_LatentMaker": "DeBNDLer (Latent Maker)",
    "Shima.ReBNDL_LatentMaker": "ReBNDLer (Latent Maker)",
    "Shima.DeBNDL_ShimaSampler": "DeBNDLer (Shima Sampler)",
    "Shima.ReBNDL_ShimaSampler": "ReBNDLer (Shima Sampler)",
}
