"""
Shima Authentication Management
Handles storage and validation of API keys.
"""

import json
from pathlib import Path
from typing import Optional

# Default config location
CONFIG_DIR = Path(__file__).parent.parent / "config"


def get_stored_key() -> Optional[str]:
    """Retrieve the stored API key, if any."""
    auth_file = CONFIG_DIR / "auth.json"
    
    if auth_file.exists():
        try:
            with open(auth_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("key")
        except Exception:
            pass
    
    return None


def store_key(key: str) -> bool:
    """Store an API key locally."""
    try:
        CONFIG_DIR.mkdir(exist_ok=True)
        auth_file = CONFIG_DIR / "auth.json"
        
        with open(auth_file, "w", encoding="utf-8") as f:
            json.dump({"key": key}, f)
        
        return True
    except Exception as e:
        print(f"[Shima] Failed to store key: {e}")
        return False


def clear_key() -> bool:
    """Remove the stored API key."""
    auth_file = CONFIG_DIR / "auth.json"
    
    if auth_file.exists():
        try:
            auth_file.unlink()
            return True
        except Exception as e:
            print(f"[Shima] Failed to clear key: {e}")
            return False
    
    return True


def is_authenticated() -> bool:
    """Check if a key is stored (doesn't validate with server)."""
    return get_stored_key() is not None
