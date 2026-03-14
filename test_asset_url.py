import os
import json
from pathlib import Path
import sys

# Add the current directory to sys.path so we can import utils
sys.path.append(os.getcwd())

from utils.settings_utils import ShimaSettings
from utils.asset_manager import AssetManager

def test_url_resolution():
    print("--- Testing URL Resolution ---")
    
    # 1. Setup mock user settings
    # We need to make sure we are using the correct config path for ShimaSettings
    config_dir = Path("config")
    config_dir.mkdir(exist_ok=True)
    user_settings_file = config_dir / "shima_settings.json"
    
    test_api_base = "https://dev-server.shima.wf"
    with open(user_settings_file, "w") as f:
        json.dump({"api_base": test_api_base}, f)
    
    # 2. Invalidate cache and reload
    ShimaSettings._user_config = None
    ShimaSettings.reload_user()
    print(f"Current API Base: {ShimaSettings.get_api_base()}")
    
    # 3. Initialize AssetManager
    manager = AssetManager(os.getcwd())
    
    # 4. Test resolving a relative URL
    pack_name = "Walking Woman"
    if pack_name in manager.packs:
        url = manager.packs[pack_name]
        print(f"Original URL for '{pack_name}': {url}")
        
        # Simulate what download_pack does internally
        if url.startswith("/"):
            api_base = ShimaSettings.get_api_base().rstrip("/")
            resolved_url = f"{api_base}{url}"
            print(f"Resolved URL: {resolved_url}")
            
            expected = f"{test_api_base}{url}"
            if resolved_url == expected:
                print("✅ PASSED: URL resolved correctly.")
            else:
                print(f"❌ FAILED: Expected {expected}, got {resolved_url}")
        else:
            print(f"⚠️ '{pack_name}' is not a relative URL. Check site_default_settings.json.")
    else:
        print(f"❌ FAILED: '{pack_name}' not found in packs.")
        print(f"Available packs: {list(manager.packs.keys())}")

if __name__ == "__main__":
    test_url_resolution()
