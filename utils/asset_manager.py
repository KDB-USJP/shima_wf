import os
import urllib.request
import zipfile
from pathlib import Path
from .settings_utils import ShimaSettings

class AssetManager:
    def __init__(self, extension_root):
        self.extension_root = Path(extension_root)
        self.default_assets_dir = self.extension_root / "assets" / "styles"
        self.packs = ShimaSettings.get_asset_packs()

    def get_asset_dir(self, custom_path=None):
        """Returns the effective asset directory."""
        if custom_path and os.path.isdir(custom_path):
            return Path(custom_path)
        return self.default_assets_dir

    def download_pack(self, pack_name, target_dir=None):
        """Download and unzip a style pack."""
        if pack_name not in self.packs:
            raise ValueError(f"Unknown pack: {pack_name}")

        url = self.packs[pack_name]
        
        # Handle relative URLs by prepending Shima API Base
        if url.startswith("/"):
            api_base = ShimaSettings.get_api_base().rstrip("/")
            url = f"{api_base}{url}"
            print(f"[Shima] Resolved relative URL to: {url}")
        target_path = self.get_asset_dir(target_dir)
        # We'll extract into a subfolder named after the pack for organized detection
        pack_folder = target_path / pack_name
        pack_folder.mkdir(parents=True, exist_ok=True)

        zip_path = target_path / f"{pack_name}.zip"

        print(f"[Shima] Downloading {pack_name} assets to {pack_folder}...")
        
        try:
            # Simple downloader
            def reporthook(blocknum, blocksize, totalsize):
                readsofar = blocknum * blocksize
                if totalsize > 0:
                    percent = readsofar * 1e2 / totalsize
                    s = "\r%5.1f%% %*d / %d" % (
                        percent, len(str(totalsize)), readsofar, totalsize)
                    print(s, end="")
                else:
                    print("\rRead %d" % (readsofar), end="")

            urllib.request.urlretrieve(url, zip_path, reporthook)
            print("\n[Shima] Download complete. Unzipping...")

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(pack_folder)

            os.remove(zip_path)
            print(f"[Shima] {pack_name} pack installed successfully in {pack_folder}.")
            return True
        except Exception as e:
            print(f"[Shima] Error installing {pack_name}: {e}")
            if zip_path.exists():
                os.remove(zip_path)
            return False

    def list_available_packs(self):
        return list(self.packs.keys())
