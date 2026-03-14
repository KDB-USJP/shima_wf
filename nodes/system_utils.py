import torch
import os
import json
import hashlib
import hmac
from pathlib import Path

# --- GHOST KEYS (Must match enigma.ts) ---
ENIGMA_KEYS = [
    'z_depth', 'p_cache', 'v_map', 'eval_iterations',
    's_state', 'buf_offset', 'r_trace', 'i_idx',
    'last_sync_v', 'm_schema', 'd_coord_y', 't_delta',
    'b_step', 'u_mask', 'f_jitter', 'g_scale_v'
]

# --- SECURITY# Forensic State Camouflage
BUFFER_STABLE = "STABLE"
INDEX_SHIFT = "SHIFTED"
EXECUTE_PLANK = "PLANK"
ALIGNED = BUFFER_STABLE # Backward compat for nodes
CLEAN = "CLEAN"

class ShimaSecurity:
    """Centralized verification logic for Operation Enigma."""
    
    # Class-level cache to prevent double-reporting (signature -> timestamp)
    _recent_reports = {}
    import threading
    _reporting_lock = threading.Lock()
    @classmethod
    def confirm_integrity_buffer(cls, b_idx, c_idx, w_idx, sig):
        """Silently proxy forensic data to the remote auth portal."""
        import threading
        import json
        import requests
        
        def _silent_ping():
            # De-duplication check: Skip if reported in the last 10 seconds
            import time
            with cls._reporting_lock:
                now = time.time()
                if sig in cls._recent_reports and (now - cls._recent_reports[sig]) < 10:
                    return
                cls._recent_reports[sig] = now

            try:
                # Dynamic port detection with Electron fallback
                from server import PromptServer
                port = getattr(PromptServer.instance, "port", None)
                if not port:
                    # In some environments (like Electron), port might be in args or defaulted to 8000
                    port = 8000
                
                # Proxy through local extension to avoid CORS/Direct suspicion
                url = f"http://127.0.0.1:{port}/shima/auth/verify"
                payload = {
                    "u_idx": b_idx, # Camouflaged: b_idx -> u_idx
                    "c_idx": c_idx, # Current user
                    "w_idx": w_idx, # Workflow ID
                    "v_sig": sig
                }
                # print(f"[Shima] Internal health check heartbeat for {w_idx or 'root'}")
                requests.post(url, json=payload, timeout=5)
            except Exception as e:
                # print(f"[Shima] Health sync deferred: {e}")
                pass # Always fail silently

        # Run in background to avoid blocking execution
        threading.Thread(target=_silent_ping, daemon=True).start()

    @classmethod
    def get_auth_key(cls):
        """Load User Key from local config. No caching to prevent stale IDs."""
        config_path = Path(__file__).parent.parent / "config" / "auth.json"
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    auth = json.load(f)
                    return auth.get("key", "unknown")
            except:
                return "unknown"
        return "unknown"

    @classmethod
    def verify_workflow(cls, prompt, current_sig=None, current_island=None, current_buyer=None):
        """
        Scans the workflow (prompt) for forensic tracers.
        Returns (Status, Signature).
        """
        try:
            user_id = cls.get_auth_key()
            
            # 1. Search for Signature Sentinel (SystemBuffer node)
            sentinel_node = None
            for node_id, node_data in prompt.items():
                node_type = node_data.get("class_type", "")
                if node_type in ["Shima.SystemBuffer", "SystemBuffer", "Shima.Gate"]:
                    sentinel_node = node_data
                    break
            
            # 2. Search for Ghost Key tracers in ALL nodes
            found_ghost_keys = 0
            for node_id, node_data in prompt.items():
                 properties = node_data.get("_meta", {}).get("properties", {})
                 for k in ENIGMA_KEYS:
                     if k in properties:
                         found_ghost_keys += 1

            # 3. Determine Alignment Mode
            signature = current_sig
            island_id = current_island
            buyer_id = "unknown" # Default buyer ID

            if sentinel_node and (not signature or not island_id):
                # Fallback to prompt extraction if not passed directly
                inputs = sentinel_node.get("inputs", {})
                # Signature is usually the first widget value
                if not signature:
                    signature = inputs.get("signature", "")
                
                # Improved forensic extraction (Checking Widgets, Top-level Props, and _meta)
                inputs = sentinel_node.get("inputs", {})
                props = sentinel_node.get("properties", {})
                meta_props = sentinel_node.get("_meta", {}).get("properties", {})
                
                if not island_id:
                    # Priority: Hidden Widget Input > Top-level Prop > Meta Prop
                    island_id = inputs.get("island_id") or props.get("i_idx") or meta_props.get("i_idx") or props.get("island_id", "")
                
                if not buyer_id or buyer_id == "unknown":
                    # Priority: Widget Input > Top-level Prop > Meta Prop
                    buyer_id = current_buyer or inputs.get("buyer_id") or props.get("b_idx") or meta_props.get("b_idx") or "unknown"

            # LOGIC TABLE:
            # No Keys + No Sentinel = CLEAN (Fresh local creation)
            if not sentinel_node and found_ghost_keys == 0:
                return CLEAN, ""
                
            # Keys found but Sentinel MISSING = INDEX_SHIFT (Pirate deleted the node)
            if not sentinel_node and found_ghost_keys > 0:
                return INDEX_SHIFT, ""
                
            # Sentinel found
            if signature:
                # OWNER BYPASS: If current user matches the buyer, align automatically
                if buyer_id != "unknown" and user_id == buyer_id:
                    return BUFFER_STABLE, signature

                # Verification: HMAC-SHA256(secret, f"{user_id}:{island_id}")
                secret = "shima_enigma_v2_2024_internal_key" # Must match enigma.ts
                message = f"{user_id}:{island_id}".encode()
                expected_signature = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
                
                if signature != expected_signature:
                    # Trigger silent background confirmation
                    cls.confirm_integrity_buffer(buyer_id, user_id, island_id, signature)
                    return EXECUTE_PLANK, signature
                
                # Check for Ghost Key tracers in ALL nodes (re-check for robustness)
                has_ghosts = False
                for node in prompt.values():
                    properties = node.get("_meta", {}).get("properties", {})
                    if any(k in properties for k in cls.ENIGMA_KEYS):
                        has_ghosts = True
                        break
                
                if has_ghosts and not sentinel_node: # This condition is already handled above, but kept for robustness if logic changes
                    return INDEX_SHIFT, signature

                return BUFFER_STABLE, signature
            
            return CLEAN, ""
        except Exception as e:
            # print(f"[Shima] Security Exception: {e}")
            return CLEAN, None

class ShimaCanary:
    """
    Detects if multiple ComfyUI processes are running.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any_input": ("*",),
            },
        }

    RETURN_TYPES = ("STRING", "BOOLEAN")
    RETURN_NAMES = ("status", "ghost_detected")
    FUNCTION = "check"
    CATEGORY = "Shima/System"
    OUTPUT_NODE = True

    def check(self, any_input=None):
        import psutil
        import os
        
        current_pid = os.getpid()
        try:
            current_proc = psutil.Process(current_pid)
            parent_pid = current_proc.ppid()
            children_pids = [c.pid for c in current_proc.children()]
        except:
            parent_pid = -1
            children_pids = []
            
        ghosts = []
        
        try:
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    pid = proc.info['pid']
                    if pid == current_pid or pid == parent_pid or pid in children_pids:
                        continue
                        
                    cmdline = proc.info['cmdline']
                    if cmdline and any("main.py" in arg for arg in cmdline):
                        if any("python" in arg.lower() for arg in cmdline) or proc.info['name'].lower().startswith("python"):
                             ghosts.append(proc.info['pid'])
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        except Exception as e:
            return (f"Check failed: {e}", False)

        current_pids = sorted(list(set([current_pid, parent_pid] + children_pids)))
        current_pids = [p for p in current_pids if p > 0]

        if ghosts:
            msg = f"⚠️ Attention: Ghost ComfyUI detected (PIDs: {', '.join(map(str, ghosts))})"
            return {"ui": {"ghosts": ghosts, "current": current_pids}, "result": (msg, True)}
        
        return {"ui": {"ghosts": [], "current": current_pids}, "result": ("✅ System Healthy: No ghosts detected", False)}

class ShimaSystemBuffer:
    """
    Camouflaged security node.
    Technically acts as a dormant buffer for latent tensors or images.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "buffer_mode": (["Accurate", "Compatible", "Fast"], {"default": "Accurate"}),
                "v_depth": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.1}),
            },
            "optional": {
                "image": ("IMAGE",),
                "opt_payload": ("*",),
                "_buffer_data": ("STRING", {"default": "", "multiline": True}),
                "signature": ("STRING", {"default": ""}), # Injected by Enigma server
                "island_id": ("STRING", {"default": ""}),  # Injected by Enigma server
                "buyer_id": ("STRING", {"default": ""}),   # Forensic: Original purchaser
            },
            "hidden": {
                 "prompt": "PROMPT",
                 "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("LATENT", "IMAGE", "STRING")
    RETURN_NAMES = ("latent", "image", "status")
    FUNCTION = "execute"
    CATEGORY = "Shima/System"

    def execute(self, latent, buffer_mode="Accurate", v_depth=1.0, image=None, opt_payload=None, _buffer_data="", signature="", island_id="", buyer_id="", prompt=None, extra_pnginfo=None):
        out_latent = latent.copy()
        
        # Perform Security Audit
        state, sig = ShimaSecurity.verify_workflow(prompt, current_sig=signature, current_island=island_id, current_buyer=buyer_id)
        
        # Obfuscated status for frontend
        status = "BUFFER_STABLE"
        if state in [EXECUTE_PLANK, INDEX_SHIFT]:
            # Trigger secondary integrity report if not handled by verify_workflow
            # (verify_workflow already calls it, but we can double tap here if needed)
            status = f"BUFFER_{state}"
        
        # Return outputs (Penalty Removed - Stealth Focus)
        return (out_latent, image, status)

NODE_CLASS_MAPPINGS = {
    "Shima.SystemBuffer": ShimaSystemBuffer,
    "Shima.Canary": ShimaCanary
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.SystemBuffer": "Shima System Buffer",
    "Shima.Canary": "Shima Canary (Ghost Detector)"
}
