import os
import urllib.request
import zipfile
from pathlib import Path
from .settings_utils import ShimaSettings

class AssetManager:
    def __init__(self, extension_root):
        self.extension_root = Path(extension_root).resolve()
        self.comfy_root = self.extension_root.parent.parent.resolve()
        self.default_assets_dir = self.extension_root / "assets" / "styles"
        self.packs = ShimaSettings.get_asset_packs()

    def get_asset_dir(self, custom_path=None):
        """Returns target directory for assets, resolving custom path if provided."""
        if custom_path:
            return self.validate_path(Path(custom_path))
        return self.default_assets_dir

    def validate_path(self, target_path: Path) -> Path:
        """ Ensures the target path is inside allowed ComfyUI subdirectories. """
        target_path = target_path.resolve()
        
        allowed_dirs = [
            self.comfy_root / "models",
            self.comfy_root / "input",
            self.comfy_root / "custom_nodes"
        ]
        
        # Check if the path is within any allowed directory
        is_safe = False
        for allowed in allowed_dirs:
            try:
                # Commonpath returns the longest common sub-path
                if os.path.commonpath([allowed, target_path]) == str(allowed):
                    is_safe = True
                    break
            except ValueError:
                continue
                
        if not is_safe:
            raise SecurityError(f"Target path {target_path} is outside allowed directories!")
            
        return target_path

    def download_file(self, url, dest_path, display_name="file"):
        """Download a single file securely with dynamic size verification."""
        dest_path = self.validate_path(Path(dest_path))
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Consistent Browser User-Agent
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        # 1. Dynamic Integrity Check: Use HEAD request to find expected size
        try:
            head_req = urllib.request.Request(url, headers=headers, method='HEAD')
            with urllib.request.urlopen(head_req) as response:
                expected_size = int(response.info().get('Content-Length', -1))
                
            if dest_path.exists():
                local_size = dest_path.stat().st_size
                if expected_size != -1 and local_size == expected_size:
                    print(f"[Shima] {display_name} already exists and matches expected size ({local_size} bytes). Skipping.")
                    return True
                else:
                    print(f"[Shima] {display_name} size mismatch (Local: {local_size}, Remote: {expected_size}). Re-downloading...")
                    dest_path.unlink() # Delete corrupted/partial file
        except Exception as e:
            print(f"[Shima] Could not verify remote size for {display_name}: {e}. Proceeding with download attempt.")

        print(f"[Shima] Securely downloading {display_name} to {dest_path}...")
        
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response:
                with open(dest_path, 'wb') as f:
                    # Optional: We could stream this to disk for better memory management, 
                    # but for now we'll stick to simple write.
                    f.write(response.read())
            
            # Final check
            if dest_path.exists() and expected_size != -1:
                if dest_path.stat().st_size != expected_size:
                    print(f"[Shima] ERROR: Downloaded file size mismatch for {display_name}!")
                    return False

            print(f"[Shima] {display_name} download complete.")
            return True
        except Exception as e:
            print(f"[Shima] Download failed for {display_name}: {e}")
            if dest_path.exists():
                dest_path.unlink()
            return False

    def download_pack(self, pack_name, target_dir=None, manifest_name=None):
        """Download and unzip a style pack."""
        packs = self.packs
        if manifest_name:
            config = ShimaSettings.load_manifest_config(manifest_name)
            packs = config.get("stylethumbs", self.packs)

        if pack_name not in packs:
            raise ValueError(f"Unknown pack: {pack_name} (Manifest: {manifest_name})")

        url = packs[pack_name]
        
        # Handle relative URLs
        if url.startswith("/"):
            api_base = ShimaSettings.get_api_base().rstrip("/")
            url = f"{api_base}{url}"

        target_path = self.get_asset_dir(target_dir)
        # Sandbox packs to styles or custom target but validate it
        pack_folder = self.validate_path(target_path / pack_name)
        pack_folder.mkdir(parents=True, exist_ok=True)

        zip_path = target_path / f"{pack_name}.zip"

        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            
            with urllib.request.urlopen(req) as response:
                with open(zip_path, 'wb') as f:
                    f.write(response.read())

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(pack_folder)

            os.remove(zip_path)
            return True
        except Exception as e:
            print(f"[Shima] Error installing {pack_name}: {e}")
            if zip_path.exists():
                os.remove(zip_path)
            return False

    def list_available_packs(self):
        return list(self.packs.keys())

class SecurityError(Exception):
    pass
