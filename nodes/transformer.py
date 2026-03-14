import re

class AnyType(str):
    """A wildcard type for ComfyUI inputs/outputs."""
    def __ne__(self, __value: object) -> bool:
        return False

# The wildcard instance
ANY = AnyType("*")

class ShimaTransformer:
    """
    Shima Transformer - Maps inputs to specific outputs using an Atomic Switch pattern.
    Each line is evaluated independently:
    - 'key ||| value' matches input against key.
    - 'catchall' (no |||) replaces any input immediately.
    - If no lines match, input passes through unchanged.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "output_as_strings": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "in_1": (ANY, {"forceInput": True}),
                "map_1": ("STRING", {"multiline": True, "default": ""}),
                "in_2": (ANY, {"forceInput": True}),
                "map_2": ("STRING", {"multiline": True, "default": ""}),
                "in_3": (ANY, {"forceInput": True}),
                "map_3": ("STRING", {"multiline": True, "default": ""}),
                "in_4": (ANY, {"forceInput": True}),
                "map_4": ("STRING", {"multiline": True, "default": ""}),
                # Variables (Injection Tokens)
                "var_!!!": (ANY, {"forceInput": True}),
                "var_@@@": (ANY, {"forceInput": True}),
                "var_###": (ANY, {"forceInput": True}),
                "var_$$$": (ANY, {"forceInput": True}),
            }
        }

    RETURN_TYPES = (ANY, ANY, ANY, ANY)
    RETURN_NAMES = ("out_1", "out_2", "out_3", "out_4")
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
                    return self.infer_type(injected, force_string=output_as_strings)
            else:
                # Unconditional Override: replace anything with this line's text
                # Inject variables before type inference
                injected = inject_vars(line)
                return self.infer_type(injected, force_string=output_as_strings)
                
        # If we reach here, no line matched (or all were unmatched conditionals)
        # Pass through the original input
        return val

    def execute(self, output_as_strings, **kwargs):
        # Collect variables
        variables = {
            "!!!": kwargs.get("var_!!!"),
            "@@@": kwargs.get("var_@@@"),
            "###": kwargs.get("var_###"),
            "$$$": kwargs.get("var_$$$"),
        }

        results = []
        for i in range(1, 5):
            val = kwargs.get(f"in_{i}")
            map_str = kwargs.get(f"map_{i}", "")
            results.append(self.process_stream(val, map_str, output_as_strings, variables))
                
        return tuple(results)

NODE_CLASS_MAPPINGS = {
    "Shima.Transformer": ShimaTransformer
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Transformer": "Shima Transformer"
}
