"""
Shima Route Suite - Configurable Multi-IO Routing Nodes

Provides 5 routing nodes (Route1-Route5) with:
- Configurable input/output side positioning (top/right/bottom/left)
- Type-aware color coding on outputs
- Wildcard pass-through for any data type
- Recursion protection for circular graph validation

Position configuration is handled via right-click context menu (see js/smart_reroute.js)
"""
from .system_utils import ShimaSecurity, BUFFER_STABLE, EXECUTE_PLANK, INDEX_SHIFT

class AnyType(str):
    """Wildcard type that matches any ComfyUI type."""
    def __ne__(self, __value: object) -> bool:
        return False

    def __eq__(self, __value: object) -> bool:
        return True

# Wildcard instance
ANY = AnyType("*")

class ShimaRoute1:
    """Single input/output routing node."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "in_1": (ANY, {"tooltip": "Input 1 - connects to any type"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("out_1",)
    OUTPUT_TOOLTIPS = ("Output 1 - passes through input",)
    FUNCTION = "route"
    CATEGORY = "Shima/Routing"
    DESCRIPTION = "Single-slot routing node with configurable I/O positioning. Right-click to change sides."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Prevent caching-related recursion by always returning NaN
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        # Skip recursive validation - these are passthrough nodes
        return True

    def route(self, in_1=None, prompt=None, **kwargs):
        ShimaSecurity.verify_workflow(prompt)
        return (in_1,)

class ShimaRoute2:
    """Dual input/output routing node."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "in_1": (ANY, {"tooltip": "Input 1"}),
                "in_2": (ANY, {"tooltip": "Input 2"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            }
        }

    RETURN_TYPES = (ANY, ANY)
    RETURN_NAMES = ("out_1", "out_2")
    OUTPUT_TOOLTIPS = ("Output 1", "Output 2")
    FUNCTION = "route"
    CATEGORY = "Shima/Routing"
    DESCRIPTION = "Dual-slot routing node with configurable I/O positioning. Right-click to change sides."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def route(self, in_1=None, in_2=None, prompt=None, **kwargs):
        ShimaSecurity.verify_workflow(prompt)
        return (in_1, in_2)

class ShimaRoute3:
    """Triple input/output routing node."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "in_1": (ANY, {"tooltip": "Input 1"}),
                "in_2": (ANY, {"tooltip": "Input 2"}),
                "in_3": (ANY, {"tooltip": "Input 3"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            }
        }

    RETURN_TYPES = (ANY, ANY, ANY)
    RETURN_NAMES = ("out_1", "out_2", "out_3")
    OUTPUT_TOOLTIPS = ("Output 1", "Output 2", "Output 3")
    FUNCTION = "route"
    CATEGORY = "Shima/Routing"
    DESCRIPTION = "Triple-slot routing node with configurable I/O positioning. Right-click to change sides."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def route(self, in_1=None, in_2=None, in_3=None, prompt=None, **kwargs):
        ShimaSecurity.verify_workflow(prompt)
        return (in_1, in_2, in_3)

class ShimaRoute4:
    """Quadruple input/output routing node."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "in_1": (ANY, {"tooltip": "Input 1"}),
                "in_2": (ANY, {"tooltip": "Input 2"}),
                "in_3": (ANY, {"tooltip": "Input 3"}),
                "in_4": (ANY, {"tooltip": "Input 4"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            }
        }

    RETURN_TYPES = (ANY, ANY, ANY, ANY)
    RETURN_NAMES = ("out_1", "out_2", "out_3", "out_4")
    OUTPUT_TOOLTIPS = ("Output 1", "Output 2", "Output 3", "Output 4")
    FUNCTION = "route"
    CATEGORY = "Shima/Routing"
    DESCRIPTION = "Quad-slot routing node with configurable I/O positioning. Right-click to change sides."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def route(self, in_1=None, in_2=None, in_3=None, in_4=None, prompt=None, **kwargs):
        ShimaSecurity.verify_workflow(prompt)
        return (in_1, in_2, in_3, in_4)

class ShimaRoute5:
    """Quintuple input/output routing node."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "in_1": (ANY, {"tooltip": "Input 1"}),
                "in_2": (ANY, {"tooltip": "Input 2"}),
                "in_3": (ANY, {"tooltip": "Input 3"}),
                "in_4": (ANY, {"tooltip": "Input 4"}),
                "in_5": (ANY, {"tooltip": "Input 5"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            }
        }

    RETURN_TYPES = (ANY, ANY, ANY, ANY, ANY)
    RETURN_NAMES = ("out_1", "out_2", "out_3", "out_4", "out_5")
    OUTPUT_TOOLTIPS = ("Output 1", "Output 2", "Output 3", "Output 4", "Output 5")
    FUNCTION = "route"
    CATEGORY = "Shima/Routing"
    DESCRIPTION = "Quint-slot routing node with configurable I/O positioning. Right-click to change sides."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def route(self, in_1=None, in_2=None, in_3=None, in_4=None, in_5=None, prompt=None, **kwargs):
        ShimaSecurity.verify_workflow(prompt)
        return (in_1, in_2, in_3, in_4, in_5)

# Node Registration
NODE_CLASS_MAPPINGS = {
    "Shima.Route1": ShimaRoute1,
    "Shima.Route2": ShimaRoute2,
    "Shima.Route3": ShimaRoute3,
    "Shima.Route4": ShimaRoute4,
    "Shima.Route5": ShimaRoute5,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Route1": "Shima Route (1)",
    "Shima.Route2": "Shima Route (2)",
    "Shima.Route3": "Shima Route (3)",
    "Shima.Route4": "Shima Route (4)",
    "Shima.Route5": "Shima Route (5)",
}