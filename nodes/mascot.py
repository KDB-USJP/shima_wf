"""
Shima Noodman - Animated Sprite Mascot Node.
Uses grid-based sprite sheets with configurable animation sequences
and input-driven state selection.
"""
import re
import os


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

ANY = AnyType("*")


def _safe_bool_strict(val):
    """Strict boolean check — only recognizes actual boolean-like values."""
    if isinstance(val, bool):
        return (True, val)
    if isinstance(val, (int, float)):
        if val == 1:
            return (True, True)
        elif val == 0:
            return (True, False)
        return (False, None)
    if isinstance(val, str):
        low = val.strip().lower()
        if low in ("true", "1", "t", "y", "yes"):
            return (True, True)
        elif low in ("false", "0", "f", "n", "no"):
            return (True, False)
    return (False, None)


class ShimaNoodmanSticker:
    """
    Animated Mascot Node for Shima.
    Uses grid-based sprite sheets with configurable animation sequences
    and 3-state input-driven animation selection.
    """
    @classmethod
    def INPUT_TYPES(cls):
        # Scan for sprite sheets in assets/sprites/
        nodes_dir = os.path.dirname(__file__)
        root_dir = os.path.dirname(nodes_dir)
        sprite_root = os.path.join(root_dir, "assets", "sprites")

        files = []
        if os.path.exists(sprite_root):
            valid_exts = ('.png', '.jpg', '.jpeg', '.webp')
            found = [f for f in os.listdir(sprite_root) if f.lower().endswith(valid_exts)]
            found.sort()
            files = found

        return {
            "required": {
                "sprite_sheet": (files if files else ["sprite_sheet_test.png"], {
                    "default": files[0] if files else "sprite_sheet_test.png",
                    "tooltip": "Sprite sheet image from Shima/assets/sprites/"
                }),
                "columns": ("INT", {"default": 10, "min": 1, "max": 64, "tooltip": "Number of columns in the sprite grid"}),
                "rows": ("INT", {"default": 10, "min": 1, "max": 64, "tooltip": "Number of rows in the sprite grid"}),
                "trigger_type": (["Hardware Sync", "Number Match", "Math", "String", "Regex", "Boolean"], {
                    "default": "Number Match",
                    "tooltip": "How the input value determines which animation to play"
                }),
                "state_1_value": ("STRING", {"default": "1.0", "tooltip": "Value that triggers State 1 animation"}),
                "state_2_value": ("STRING", {"default": "2.0", "tooltip": "Value that triggers State 2 animation"}),
                "anim_idle": ("STRING", {"default": "A1", "tooltip": "Frame sequence for Idle/Off state (e.g. A1,A2,A3 or A1-A5)"}),
                "anim_state1": ("STRING", {"default": "A1-A10", "tooltip": "Frame sequence for State 1 (e.g. B1-B10)"}),
                "anim_state2": ("STRING", {"default": "B1-B10", "tooltip": "Frame sequence for State 2 (e.g. C1-C10)"}),
                "fps": ("INT", {"default": 8, "min": 0, "max": 30, "step": 1, "tooltip": "Playback speed (0 = frozen on first frame)"}),
                "stop_after_run": ("BOOLEAN", {"default": True, "tooltip": "Stop animation when workflow execution finishes"}),
                "watch_node_id": ("STRING", {"default": "", "tooltip": "Node ID to watch — stops animation when that node finishes (overrides stop_after_run)"}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1, "tooltip": "Display size multiplier"}),
            },
            "optional": {
                "any_input": (ANY, {"tooltip": "Input value for state evaluation"}),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Design"
    OUTPUT_NODE = True

    def _eval_math(self, val, expression):
        """Evaluate a math comparison expression like '>1.0', '<=2.5', '!=0'."""
        expression = expression.strip()
        if not expression:
            return False
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
        try:
            return val == float(expression)
        except ValueError:
            return False

    def execute(self, sprite_sheet, columns, rows, trigger_type, state_1_value, state_2_value,
                anim_idle, anim_state1, anim_state2, fps, stop_after_run, watch_node_id, scale, any_input=None):
        state = 0
        pass_value = any_input

        if any_input is None:
            # No input connected — default to State 1
            state = 1
        elif any_input is not None:
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
                    if self._eval_math(val, state_2_value):
                        state = 2
                    elif self._eval_math(val, state_1_value):
                        state = 1
                except (ValueError, TypeError):
                    state = 0

            elif trigger_type == "String":
                input_str = str(any_input)
                if input_str == state_2_value:
                    state = 2
                elif input_str == state_1_value:
                    state = 1

            elif trigger_type == "Regex":
                input_str = str(any_input)
                try:
                    if state_2_value and re.search(state_2_value, input_str):
                        state = 2
                    elif state_1_value and re.search(state_1_value, input_str):
                        state = 1
                except re.error:
                    state = 0

            elif trigger_type == "Boolean":
                recognized, b = _safe_bool_strict(any_input)
                if recognized:
                    state = 1 if b else 2
                else:
                    state = 0

        return {"ui": {"state": [state]}, "result": (pass_value,)}


NODE_CLASS_MAPPINGS = {
    "Shima.NoodmanSticker": ShimaNoodmanSticker,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.NoodmanSticker": "Shima Noodman (Sprite Mascot)",
}
