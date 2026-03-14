"""
Shima.SeedController - Standalone seed manipulation node

Provides seed control that can be used at the top level of a workflow
and connected into subgraphs via external_seed inputs.

Features:
- Seed input (connectable from other nodes)
- Mode selector: fixed, increment, decrement, randomize
- All inputs connectable for maximum flexibility
- Tracks last seed for increment/decrement across executions
"""

import random


class ShimaSeedController:
    """
    Control seed behavior with connectable inputs for subgraph compatibility.
    
    Place this at the top level of your workflow and connect seed_out
    to external_seed inputs on nodes inside subgraphs.
    """
    
    # Class-level storage for last seed (persists across executions)
    _last_seeds = {}
    
    SEED_MODES = ["fixed", "increment", "decrement", "randomize"]
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "s33d": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 0xffffffffffffffff,
                    "tooltip": "Base seed value. Why 's33d'? Using this name prevents ComfyUI from auto-adding a non-connectable dropdown, allowing our own connectable version."
                }),
                "mode": (cls.SEED_MODES, {
                    "default": "fixed",
                    "tooltip": "How to handle the seed: fixed (use as-is), increment (+1 each run), decrement (-1 each run), randomize (new random each run)"
                }),
                "step": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 1000,
                    "tooltip": "Step size for increment/decrement modes"
                }),
            },
            "optional": {
                # External mode input for driving from outside subgraphs
                "external_mode": (cls.SEED_MODES, {
                    "forceInput": True,
                    "tooltip": "Optional external mode - overrides widget when connected"
                }),
                # External seed input for chaining controllers
                "external_s33d": ("INT", {
                    "forceInput": True,
                    "tooltip": "Optional external seed - overrides widget when connected"
                }),
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",  # For tracking last seed per node instance
            }
        }
    
    RETURN_TYPES = ("INT", "STRING")
    RETURN_NAMES = ("s33d", "mode")
    OUTPUT_TOOLTIPS = (
        "The processed seed value (connect to external_s33d on other nodes)",
        "The mode used (for chaining or debugging)"
    )
    
    FUNCTION = "process"
    CATEGORY = "Shima/Sampling"
    OUTPUT_NODE = True  # Ensures this node always executes
    
    DESCRIPTION = "Control seed behavior with connectable inputs. Place at top level and connect to external_seed inputs inside subgraphs."

    @classmethod
    def IS_CHANGED(cls, s33d, mode, step, unique_id, external_mode=None, external_s33d=None, **kwargs):
        """
        Tell ComfyUI when this node needs to re-execute.
        For randomize/increment/decrement modes, always return a new value to force re-run.
        """
        import random
        final_mode = external_mode if external_mode is not None else mode
        
        # These modes need fresh execution each time
        if final_mode in ["randomize", "increment", "decrement"]:
            return random.random()  # Always different = always re-execute
        
        # Fixed mode only re-executes if inputs actually change
        return (s33d, mode, step, external_mode, external_s33d)

    def process(
        self,
        s33d: int,
        mode: str,
        step: int,
        unique_id: str,
        external_mode: str = None,
        external_s33d: int = None,
        **kwargs,
    ):
        # Determine final mode (external overrides widget)
        final_mode = external_mode if external_mode is not None else mode
        
        # Determine base seed (external overrides widget)
        base_s33d = external_s33d if external_s33d is not None else s33d
        
        # Get last seed for this node instance (for increment/decrement)
        last_s33d = self._last_seeds.get(unique_id, base_s33d)
        
        # Calculate output seed based on mode
        if final_mode == "fixed":
            output_s33d = base_s33d
        elif final_mode == "increment":
            output_s33d = (last_s33d + step) % 0xffffffffffffffff
        elif final_mode == "decrement":
            output_s33d = max(0, last_s33d - step)
        elif final_mode == "randomize":
            output_s33d = random.randint(0, 0xffffffffffffffff)
        else:
            output_s33d = base_s33d
        
        # Store for next execution
        self._last_seeds[unique_id] = output_s33d
        
        return (output_s33d, final_mode)


# Node registration
NODE_CLASS_MAPPINGS = {
    "Shima.SeedController": ShimaSeedController,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.SeedController": "Shima Seed Controller",
}
