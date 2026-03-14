import re

class AnyType(str):
    """A wildcard type for ComfyUI inputs/outputs."""
    def __ne__(self, __value: object) -> bool:
        return False

# The wildcard instance
ANY = AnyType("*")

class ShimaTransformOne:
    """
    Shima Transform One - A single-input/single-output version of the Shima Transformer.
    Maps input to a specific output using an Atomic Switch pattern.
    - 'key ||| value' matches input against key.
    - 'catchall' (no |||) replaces any input immediately.
    - If no lines match, input passes through unchanged.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "output_as_strings": ("BOOLEAN", {"default": False}),
                "in_1": (ANY, {"forceInput": True}),
                "map_1": ("STRING", {"multiline": True, "default": ""}),
            },
            "optional": {
                # Variables (Injection Tokens)
                "var_!!!": (ANY, {"forceInput": True}),
                "var_@@@": (ANY, {"forceInput": True}),
                "var_###": (ANY, {"forceInput": True}),
                "var_$$$": (ANY, {"forceInput": True}),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("out_1",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"

    def infer_type(self, val_str, force_string=False):
        if force_string:
            return val_str
            
        # 1. Boolean check
        low_val = val_str.lower()
        if low_val == "true":
            return True
        if low_val == "false":
            return False
            
        # 2. Number check
        try:
            # Try integer first
            if val_str.isdigit() or (val_str.startswith('-') and val_str[1:].isdigit()):
                return int(val_str)
            # Try float
            if '.' in val_str or 'e' in low_val:
                return float(val_str)
        except ValueError:
            pass
            
        # 3. Default to string
        return val_str

    def process_stream(self, val, map_str, output_as_strings, variables):
        # If no input, pass through None
        if val is None:
            return None
            
        # If mapping is empty, pass through original input
        if not map_str or not map_str.strip():
            return val
            
        lines = map_str.strip().split('\n')
        input_str = str(val)
        
        # Helper for variable replacement
        def inject_vars(text):
            for token, var_val in variables.items():
                replacement = str(var_val) if var_val is not None else "no value set"
                text = text.replace(token, replacement)
            return text
        
        # New: simple bracketed variable injection
        # e.g. "This is [!!!]" -> "This is value"
        def inject_bracketed(text):
            for token, var_val in variables.items():
                bracket_token = f"[{token}]"
                replacement = str(var_val) if var_val is not None else "no value set"
                text = text.replace(bracket_token, replacement)
            return text

        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            if '|||' in line:
                # Conditional Mapping: key ||| value
                parts = line.split('|||', 1)
                key = parts[0].strip()
                result_val = parts[1].strip()
                
                # Matching Logic:
                # 1. Direct string match
                match = (input_str == key)
                
                # 2. Boolean-specific loose matching
                if not match and isinstance(val, bool):
                    low_key = key.lower()
                    if low_key == "true" or key == "1":
                        match = (val == True)
                    elif low_key == "false" or key == "0":
                        match = (val == False)
                
                if match:
                    # Match found. Check if explicitly empty for pass-through
                    if result_val == "":
                        return val
                    
                    # Inject variables before type inference
                    injected = inject_vars(result_val)
                    injected = inject_bracketed(injected)
                    return self.infer_type(injected, force_string=output_as_strings)
            else:
                # Unconditional Override: replace anything with this line's text
                # Inject variables before type inference
                injected = inject_vars(line)
                injected = inject_bracketed(injected)
                return self.infer_type(injected, force_string=output_as_strings)
                
        # If we reach here, no line matched (or all were unmatched conditionals)
        # Pass through the original input
        return val

    def execute(self, output_as_strings, in_1, map_1, **kwargs):
        # Collect variables
        variables = {
            "!!!": kwargs.get("var_!!!"),
            "@@@": kwargs.get("var_@@@"),
            "###": kwargs.get("var_###"),
            "$$$": kwargs.get("var_$$$"),
        }

        result = self.process_stream(in_1, map_1, output_as_strings, variables)
        return (result,)

NODE_CLASS_MAPPINGS = {
    "Shima.TransformOne": ShimaTransformOne
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.TransformOne": "Shima Transform One"
}
