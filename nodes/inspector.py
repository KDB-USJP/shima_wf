
import torch

class ShimaInspector:
    """
    Shima Inspector (Display Any / Multipass)
    Accepts up to 10 inputs of any type, displays their type and value/shape,
    and passes them through for easy inline debugging.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        # Generate 10 optional wildcard inputs
        inputs = {}
        for i in range(1, 11):
            inputs[f"any_{i:02d}"] = ("*", {"optional": True})
            
        return {
            "required": {},
            "optional": inputs
        }

    # 10 Outputs corresponding to inputs
    RETURN_TYPES = ("*",) * 10
    RETURN_NAMES = tuple(f"any_{i:02d}" for i in range(1, 11))
    OUTPUT_NODE = True
    FUNCTION = "inspect_and_pass"
    CATEGORY = "Shima/Hidden"
    
    def inspect_and_pass(self, **kwargs):
        # Prepare list for UI
        # We look for any_01 ... any_10 in kwargs
        
        inspection_data = []
        
        # We must return a tuple of 10 items (some might be None)
        outputs = []
        
        for i in range(1, 11):
            key = f"any_{i:02d}"
            value = kwargs.get(key, None)
            
            # Add to pass-through outputs
            outputs.append(value)
            
            # Inspect logic
            if value is not None:
                type_name = type(value).__name__
                display_val = str(value)
                
                # Special handling for common Comfy objects
                if isinstance(value, torch.Tensor):
                    # Tensor: Show Shape and Dtype
                    type_name = "TENSOR"
                    display_val = f"Shape: {list(value.shape)} | {value.dtype}"
                elif isinstance(value, (list, tuple)):
                    # Collections: Show Length
                    type_name = f"{type(value).__name__.upper()}[{len(value)}]"
                    # Maybe show first item logic?
                    try:
                        display_val = f"Preview: {str(value)[:100]}..."
                    except:
                        display_val = "..."
                elif isinstance(value, dict):
                    type_name = f"DICT[{len(value)}]"
                    try:
                        display_val = f"Keys: {list(value.keys())[:5]}..."
                    except:
                        display_val = "..."
                elif isinstance(value, str):
                    type_name = "STRING"
                    # display_val is already set, but truncated if huge?
                    if len(display_val) > 200:
                        display_val = display_val[:200] + "..."
                        
                inspection_data.append({
                    "name": key,
                    "type": type_name,
                    "value": display_val
                })
        
        # Prepare UI payload
        # Simple HTML table
        rows = []
        for item in inspection_data:
            rows.append(f"""
            <div class="shima-inspect-row">
                <div class="shima-inspect-key">{item['name']}</div>
                <div class="shima-inspect-type">{item['type']}</div>
                <div class="shima-inspect-val" title="{item['value']}">{item['value']}</div>
            </div>
            """)
            
        if not rows:
            rows.append("<div style='padding:10px; color:#666;'>No inputs connected</div>")

        html = f"""
        <style>
            .shima-inspector-table {{
                font-family: sans-serif;
                font-size: 12px;
                color: #ddd;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }}
            .shima-inspect-row {{
                display: flex;
                background: #333;
                border-radius: 4px;
                padding: 4px;
                align-items: center;
            }}
            .shima-inspect-key {{
                width: 50px;
                font-weight: bold;
                color: #8af;
                flex-shrink: 0;
            }}
            .shima-inspect-type {{
                width: 80px;
                color: #fa8;
                font-size: 10px;
                flex-shrink: 0;
            }}
            .shima-inspect-val {{
                flex-grow: 1;
                white-space: nowrap; 
                overflow: hidden; 
                text-overflow: ellipsis;
                background: #222;
                padding: 2px 4px;
                border-radius: 2px;
                color: #eee;
                font-family: monospace;
            }}
        </style>
        <div class="shima-inspector-table">
            {"".join(rows)}
        </div>
        """
        
        return {
            "ui": {
                "content": [html],
            },
            "result": tuple(outputs)
        }
