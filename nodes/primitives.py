"""
Shima Primitives - Broadcasting-aware primitive nodes with advanced features.
"""

import math

import ast
import operator as op

# Supported operators for safe evaluation
_SAFE_OPERATORS = {
    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul,
    ast.Div: op.truediv, ast.FloorDiv: op.floordiv, 
    ast.Mod: op.mod, ast.Pow: op.pow,
    ast.UnaryOp: {ast.USub: op.neg, ast.UAdd: op.pos}
}

# Supported functions
_SAFE_FUNCTIONS = {
    "abs": abs, "min": min, "max": max, "round": round,
    "pow": pow, "sqrt": math.sqrt, "sin": math.sin,
    "cos": math.cos, "tan": math.tan, "pi": math.pi,
    "ceil": math.ceil, "floor": math.floor
}

def safe_eval(expression, context):
    """Safely evaluate a mathematical expression using AST."""
    if not expression or not expression.strip():
        return 0
    
    try:
        node = ast.parse(expression.strip(), mode='eval').body
        
        def _eval(n):
            if isinstance(n, ast.Num): # Python < 3.8
                return n.n
            elif isinstance(n, ast.Constant): # Python >= 3.8
                return n.value
            elif isinstance(n, ast.BinOp):
                left = _eval(n.left)
                right = _eval(n.right)
                return _SAFE_OPERATORS[type(n.op)](left, right)
            elif isinstance(n, ast.UnaryOp):
                operand = _eval(n.operand)
                return _SAFE_OPERATORS[ast.UnaryOp][type(n.op)](operand)
            elif isinstance(n, ast.Name):
                if n.id in context:
                    return context[n.id]
                if n.id in _SAFE_FUNCTIONS:
                    return _SAFE_FUNCTIONS[n.id]
                raise NameError(f"Name {n.id} is not defined/allowed")
            elif isinstance(n, ast.Call):
                func = _eval(n.func)
                args = [_eval(arg) for arg in n.args]
                return func(*args)
            else:
                raise TypeError(f"Unsupported AST type: {type(n)}")

        return _eval(node)
    except Exception as e:
        print(f"[Shima Primitive] Evaluation Error: {e}")
        return 0

class ShimaInt:
    """
    Integer primitive with math expression support and UE broadcasting.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("INT", {"default": 1, "min": -1000000000, "max": 1000000000}),
                "expression": ("STRING", {"multiline": False, "default": "a"}), 
            },
            "optional": {
                "a": ("INT,FLOAT", {"default": 0, "forceInput": True}),
                "b": ("INT,FLOAT", {"default": 0, "forceInput": True}),
                "c": ("INT,FLOAT", {"default": 0, "forceInput": True}),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, value, expression, a=None, b=None, c=None, **kwargs):
        # Default fallbacks
        # If 'a' is not connected but used in formula, it should be 0? 
        # Or should 'value' be 'a'? 
        # Better design: 'value' is the base. 'a','b','c' are optional inputs.
        # If expression is empty or just "a" and 'a' is None, return 'value'.
        
        ctx = {
            "a": a if a is not None else value, # Map 'a' to 'value' if unconnected? Or treat 'value' as separate?
            # Let's treat 'value' as a controllable fallback if 'a' isn't there.
            # actually, 'value' is likely what users want to use if they don't specify an expression.
            "b": b if b is not None else 0,
            "c": c if c is not None else 0
        }
        
        # If expression matches default "a" and 'a' is unconnected, return 'value'
        if expression.strip() == "a" and a is None:
            return (int(value),)
            
        # Add 'value' to context explicitly for use in formula
        ctx["value"] = value
        
        result = safe_eval(expression, ctx)
        return (int(result),)

class ShimaFloat:
    """
    Float primitive with math expression support and UE broadcasting.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("FLOAT", {"default": 1.0, "step": 0.01}),
                "expression": ("STRING", {"multiline": False, "default": "a"}), 
            },
            "optional": {
                "a": ("INT,FLOAT", {"default": 0.0, "forceInput": True}),
                "b": ("INT,FLOAT", {"default": 0.0, "forceInput": True}),
                "c": ("INT,FLOAT", {"default": 0.0, "forceInput": True}),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }

    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, value, expression, a=None, b=None, c=None, **kwargs):
        ctx = {
            "a": a if a is not None else value,
            "b": b if b is not None else 0.0,
            "c": c if c is not None else 0.0,
            "value": value
        }
        
        if expression.strip() == "a" and a is None:
            return (float(value),)
            
        result = safe_eval(expression, ctx)
        return (float(result),)

class ShimaString:
    """
    String primitive with multiline support and UE broadcasting.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
            },
            "optional": {
                "override": ("STRING", {"forceInput": True}),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    
    def execute(self, text, override=None, **kwargs):
        final = override if override is not None else text
        return (final,)

NODE_CLASS_MAPPINGS = {
    "Shima.Int": ShimaInt,
    "Shima.Float": ShimaFloat,
    "Shima.String": ShimaString,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Int": "Shima Int (Math)",
    "Shima.Float": "Shima Float (Math)",
    "Shima.String": "Shima String",
}
