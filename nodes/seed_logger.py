
import base64
import time
from io import BytesIO
import torch
import numpy as np
from PIL import Image

class ShimaSeedLogger:
    """
    Shima Seed Logger
    Tracks a session-based history of generations (Seed, Prompt, Image Thumbnail).
    Outputs a CSV string and a Shima Rich Content Bundle (HTML).
    """
    
    # Placeholder seed that shows on load - gets cleared on first real execution
    PLACEHOLDER_SEED = 123456789101112
    
    # Module-level history storage (persistent across node executions in one session)
    # List of dicts: {id, seed, prompt, time, thumbnail_b64}
    # Start with placeholder so UI shows something on workflow load
    HISTORY = [{"id": 0, "seed": 123456789101112, "time": "--:--:--", "placeholder": True}]
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "s33d": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "forceInput": True}),
                "history_limit": ("INT", {"default": 50, "min": 0, "max": 500, "tooltip": "Max records to keep (0 = unlimited)"}),
            },
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "log_seed"
    CATEGORY = "Shima/System"
    
    def log_seed(self, s33d, history_limit):
        try:
            # Handle empty string from widget serialization issue
            if history_limit == '' or history_limit is None:
                history_limit = 50
            
            # Clear placeholder on first real execution
            if ShimaSeedLogger.HISTORY and ShimaSeedLogger.HISTORY[0].get("placeholder"):
                ShimaSeedLogger.HISTORY = []
            
            # 1. Append to History
            # We store just the seed and a timestamp for display purposes if needed, 
            # but the request implies just the number. Let's keep a simple dict for extensibility/ID.
            entry = {
                "id": len(ShimaSeedLogger.HISTORY) + 1,
                "seed": s33d,
                "time": time.strftime("%H:%M:%S")
            }
            
            # We'll append.
            ShimaSeedLogger.HISTORY.append(entry)
            
            # 2. Trim History
            if history_limit > 0 and len(ShimaSeedLogger.HISTORY) > history_limit:
                ShimaSeedLogger.HISTORY = ShimaSeedLogger.HISTORY[-history_limit:]
                    
            # 3. Generate Simple UI List
            # We need to send the list to the frontend.
            # Simple HTML for the scrolling list.
            
            html_style = """
            <style>
                .shima-simple-seed-list {
                    font-family: monospace;
                    font-size: 14px;
                    color: #ddd;
                    padding: 5px;
                }
                .shima-seed-item {
                    padding: 4px 8px;
                    border-bottom: 1px solid #333;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                }
                .shima-seed-item:hover {
                    background: #333;
                    color: #fff;
                }
                .shima-seed-item:last-child {
                    border-bottom: none;
                }
                .shima-seed-index {
                    color: #666;
                    font-size: 10px;
                    margin-right: 10px;
                    align-self: center;
                }
                .shima-seed-number {
                    font-weight: bold;
                    color: #8af;
                }
            </style>
            """
            
            # Generating rows. Reversed to show newest at top? 
            # The user image showed 1...105. Usually loggers show newest at the bottom or top.
            # Let's show newest at the TOP for easy access to the latest seed.
            html_rows = []
            for item in reversed(ShimaSeedLogger.HISTORY):
                row = f"""
                <div class="shima-seed-item" title="Click to Copy">
                    <span class="shima-seed-index">#{item['id']}</span>
                    <span class="shima-seed-number">{item['seed']}</span>
                </div>
                """
                html_rows.append(row)
            
            html_content = f"""
            {html_style}
            <div class="shima-simple-seed-list">
                {"".join(html_rows)}
            </div>
            """
            
            return {
                "ui": {
                    "content": [html_content],
                }
            }
            
        except Exception as e:
            # Return error message to UI
            return {
                "ui": {
                    "content": [f"<div style='color:red; padding:10px;'>Error: {str(e)}</div>"],
                }
            }
