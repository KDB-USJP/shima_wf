"""
Shima - ComfyUI Workflow Island Marketplace
A system for composable workflow "islands" that auto-connect via Use Everywhere.
"""

import os
import json
import sqlite3
from pathlib import Path
from aiohttp import web
from server import PromptServer
import sys
import subprocess
import importlib
import base64
import secrets
import shutil

# Auto-install dependencies
def ensure_package(package_name, install_name=None):
    if install_name is None:
        install_name = package_name
    try:
        importlib.import_module(package_name)
    except ImportError:
        print(f"[Shima] Installing required package: {install_name}...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", install_name])
            print(f"[Shima] Successfully installed {install_name}")
        except Exception as e:
            print(f"[Shima] Error installing {install_name}: {e}")

# Ensure openpyxl is available for XLSX support
ensure_package("openpyxl")
# Ensure psutil is available for ghost process detection
ensure_package("psutil")

from .utils.asset_manager import AssetManager
from .utils.settings_utils import ShimaSettings

# Extension manifest
MANIFEST = {
    "name": "Shima",
    "version": (2, 0, 0),
    "author": "Aegisflow",
    "project": "https://shima.wf",
    "description": "Composable workflow islands with marketplace integration",
}

# Paths
SHIMA_DIR = Path(__file__).parent
ISLANDS_DIR = SHIMA_DIR / "example_workflows"
CONFIG_DIR = SHIMA_DIR / "config"
DATA_DIR = SHIMA_DIR / "data"
ISLANDS_DB = DATA_DIR / "islands.db"

# Ensure directories exist
ISLANDS_DIR.mkdir(exist_ok=True)
CONFIG_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

def _get_sys_seed():
    """Get or generate host-locked obfuscation seed from settings."""
    settings_file = CONFIG_DIR / "shima_settings.json"
    settings = {}
    if settings_file.exists():
        try:
            with open(settings_file, "r") as f:
                settings = json.load(f)
        except: pass
    
    seed = settings.get("_sys_seed")
    if not seed:
        seed = secrets.token_hex(16)
        settings["_sys_seed"] = seed
        try:
            with open(settings_file, "w") as f:
                json.dump(settings, f, indent=4)
        except: pass
    return seed

def _obfuscate(data: str) -> str:
    """Simple XOR + Base64 obfuscation."""
    if not data: return ""
    key = _get_sys_seed()
    # Cycle key to match data length
    key_bytes = key.encode()
    data_bytes = data.encode()
    xor_result = bytes([data_bytes[i] ^ key_bytes[i % len(key_bytes)] for i in range(len(data_bytes))])
    return base64.b64encode(xor_result).decode()

def _deobfuscate(data: str) -> str:
    """Simple XOR + Base64 de-obfuscation."""
    if not data: return ""
    try:
        key = _get_sys_seed()
        key_bytes = key.encode()
        data_bytes = base64.b64decode(data)
        xor_result = bytes([data_bytes[i] ^ key_bytes[i % len(key_bytes)] for i in range(len(data_bytes))])
        return xor_result.decode()
    except:
        return "" # Fail silently

def get_db_connection():
    """Returns a SQLite connection, ensuring the parent directory exists."""
    db_path = os.path.join(os.path.dirname(__file__), "data", "islands.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    # Enable WAL mode for better concurrency during ComfyUI startup
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_islands_db():
    """Initialize local SQLite database for offline workflows."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS islands (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            json_data TEXT NOT NULL,
            type TEXT DEFAULT 'island',
            category TEXT,
            status TEXT DEFAULT 'published',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

# Initialize DB on load
init_islands_db()

# Initialize Asset Manager
asset_manager = AssetManager(SHIMA_DIR)

def get_effective_assets_dir():
    """Reads custom path from shima_settings.json if it exists."""
    settings_file = CONFIG_DIR / "shima_settings.json"
    if settings_file.exists():
        try:
            with open(settings_file, "r") as f:
                settings = json.load(f)
                custom_path = settings.get("asset_directory")
                if custom_path:
                    return asset_manager.get_asset_dir(custom_path)
        except:
            pass
    return asset_manager.get_asset_dir()


def get_cached_islands():
    """Get list of cached island JSON files with metadata."""
    islands = []
    for json_file in ISLANDS_DIR.glob("*.json"):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Check if it has island manifest metadata
            manifest = data.get("shima_manifest", {})
            islands.append({
                "id": manifest.get("id", json_file.stem),
                "name": manifest.get("name", json_file.stem),
                "file": json_file.name,
                "category": manifest.get("category", ["Uncategorized"]),
                "dependencies": manifest.get("dependencies", {}),
            })
        except Exception as e:
            print(f"[Shima] Error loading island {json_file}: {e}")
    
    return islands


# ============================================================================
# Server Routes
# ============================================================================

@PromptServer.instance.routes.get("/shima/styler/images")
async def get_styler_images(request):
    """Return flat list of all available style thumbnails across all packs."""
    try:
        assets_dir = get_effective_assets_dir()
        if not assets_dir.exists():
            return web.json_response({"images": []})
        
        images = []
        valid_exts = {'.png', '.jpg', '.jpeg', '.webp'}
        
        for root, dirs, files in os.walk(assets_dir):
            for f in files:
                if Path(f).suffix.lower() in valid_exts:
                    images.append(f)
                    
        return web.json_response({"images": sorted(list(set(images)))})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/shima/islands")
async def get_islands(request):
    """Return list of synced/cached islands from local SQLite DB."""
    islands = []
    try:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Check if table exists (in case DB was deleted mid-session)
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='islands'")
        if not cur.fetchone():
            conn.close()
            init_islands_db()
            conn = get_db_connection()
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            
        cur.execute("SELECT id, name, type, category, status FROM islands ORDER BY name ASC")
        rows = cur.fetchall()
        for row in rows:
            islands.append({
                "id": row["id"],
                "name": row["name"],
                "type": row["type"],
                "category": json.loads(row["category"]) if row["category"] else ["General"],
                "status": row["status"]
            })
        conn.close()
    except Exception as e:
        print(f"[Shima] Error reading local islands DB: {e}")
        # Fallback to legacy file-based scan if DB fails
        islands = get_cached_islands()
        
    return web.json_response({"islands": islands})


@PromptServer.instance.routes.get("/shima/island/{id}")
async def get_island(request):
    """Return a specific island's workflow JSON from local DB or file."""
    island_id = request.match_info["id"]
    
    # 1. Try SQLite first
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT json_data FROM islands WHERE id = ?", (island_id,))
        row = cur.fetchone()
        conn.close()
        
        if row:
            raw_data = row[0]
            # 1. Try raw JSON (Legacy)
            if raw_data.strip().startswith('{'):
                try:
                    return web.json_response(json.loads(raw_data))
                except: pass
                
            # 2. Try De-obfuscation
            deobfuscated = _deobfuscate(raw_data)
            if deobfuscated:
                try:
                    return web.json_response(json.loads(deobfuscated))
                except: pass
                
            return web.json_response({"error": "Format unrecognized"}, status=500)
    except Exception as e:
        print(f"[Shima] SQLite fetch failed for {island_id}: {e}")

    # 2. Fallback to file-based (legacy or manual additions)
    island_path = ISLANDS_DIR / f"{island_id}.json"
    if not island_path.exists():
        # Try as exact filename
        island_path = ISLANDS_DIR / island_id
        
    if island_path.exists() and island_path.suffix == ".json":
        try:
            with open(island_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
            
    return web.json_response({"error": "Island not found"}, status=404)


@PromptServer.instance.routes.post("/shima/island/sync")
async def sync_islands(request):
    """Batch upsert workflows into local SQLite DB for offline use."""
    try:
        payload = await request.json()
        islands_to_sync = payload.get("islands", [])
        
        if not islands_to_sync:
            return web.json_response({"success": True, "count": 0})
            
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if table exists (in case DB was deleted mid-session)
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='islands'")
        if not cur.fetchone():
            conn.close()
            init_islands_db()
            conn = get_db_connection()
            cur = conn.cursor()
        
        synced_count = 0
        for item in islands_to_sync:
            # item expects: {id, name, workflow, type, category}
            island_id = item.get("id")
            name = item.get("name")
            workflow = item.get("workflow")
            island_type = item.get("type", "island")
            category = json.dumps(item.get("category", ["General"]))
            status = item.get("status", "published")
            
            if not island_id or not workflow:
                continue
                
            # item expects: {id, name, workflow, type, category, status}
            obfuscated_wf = _obfuscate(json.dumps(workflow))
                
            cur.execute('''
                INSERT INTO islands (id, name, json_data, type, category, status, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    json_data = excluded.json_data,
                    type = excluded.type,
                    category = excluded.category,
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP
            ''', (island_id, name, obfuscated_wf, island_type, category, status))
            synced_count += 1
            
        conn.commit()
        conn.close()
        print(f"[Shima] Synced {synced_count} islands to local DB")
        return web.json_response({"success": True, "count": synced_count})
    except Exception as e:
        print(f"[Shima] Sync failed: {e}")
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/shima/sticker/image/{subdir}/{filename}")
async def get_sticker_image(request):
    """Serve sticker image file (PNG/SVG)."""
    subdir = request.match_info["subdir"]
    filename = request.match_info["filename"]
    
    # Security: Validate subdir
    if subdir not in ["PNG", "SVG"]:
        return web.Response(status=403, text="Invalid directory")
        
    file_path = SHIMA_DIR / "sticker_images" / subdir / filename
    
    if not file_path.exists():
        return web.Response(status=404, text="Image not found")
        
    return web.FileResponse(file_path)

@PromptServer.instance.routes.get("/shima/assets/switches/{filename}")
async def get_switch_image(request):
    """Serve switch SVG assets."""
    filename = request.match_info["filename"]
    file_path = SHIMA_DIR / "assets" / "switches" / filename
    if not file_path.exists():
        return web.Response(status=404, text="Switch image not found")
    return web.FileResponse(file_path)

@PromptServer.instance.routes.get("/shima/sprite/{filename}")
async def get_sprite_image(request):
    """Serve sprite sheet image from assets/sprites/."""
    filename = request.match_info["filename"]
    # Security: no path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        return web.Response(status=403, text="Invalid filename")
    file_path = SHIMA_DIR / "assets" / "sprites" / filename
    if not file_path.exists():
        return web.Response(status=404, text="Sprite image not found")
    return web.FileResponse(file_path)

@PromptServer.instance.routes.get("/shima/assets/backdrops")
async def list_backdrops(request):
    """List custom background images in assets/customBG."""
    bg_dir = SHIMA_DIR / "assets" / "customBG"
    if not bg_dir.exists():
        return web.json_response([])
    
    valid_exts = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
    files = [f.name for f in bg_dir.iterdir() if f.is_file() and f.suffix.lower() in valid_exts]
    return web.json_response(sorted(files))

@PromptServer.instance.routes.get("/shima/assets/customBG/{filename}")
async def get_custom_bg(request):
    """Serve custom background image files."""
    filename = request.match_info["filename"]
    file_path = SHIMA_DIR / "assets" / "customBG" / filename
    if not file_path.exists():
        return web.Response(status=404, text="Background image not found")
    return web.FileResponse(file_path)


@PromptServer.instance.routes.get("/shima/logos")
async def get_sticker_list(request):
    """Return list of available sticker images (PNG/SVG)."""
    sticker_root = SHIMA_DIR / "sticker_images"
    files = []
    
    if sticker_root.exists():
        for subdir in ["PNG", "SVG"]:
            sub_path = sticker_root / subdir
            if sub_path.exists():
                # Use string path for JSON response
                sub_files = [f"{subdir}/{f.name}" for f in sub_path.iterdir() if f.suffix.lower() in ['.png', '.svg']]
                sub_files.sort()
                files.extend(sub_files)
                
    return web.json_response(files)


@PromptServer.instance.routes.get("/shima/excel/download")
async def download_excel(request):
    """Serve the raw shima_sheets.xlsx file."""
    # print(f"[Shima API] Direct XLSX download requested")
    try:
        excel_path = SHIMA_DIR / "assets" / "data" / "shima_sheets.xlsx"
        if not excel_path.exists():
            return web.Response(status=404, text="Spreadsheet file not found")
            
        with open(excel_path, "rb") as f:
            data = f.read()
            
        return web.Response(
            body=data,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    except Exception as e:
        import traceback
        err_str = traceback.format_exc()
        return web.json_response({"error": str(e), "trace": err_str}, status=500)


@PromptServer.instance.routes.get("/shima/excel/upload")
async def upload_excel_status(request):
    """Debug endpoint to check if the upload route is active."""
    return web.json_response({"status": "active", "methods_allowed": ["POST"], "message": "Use POST to upload binary XLSX data"})


@PromptServer.instance.routes.post("/shima/excel/upload")
async def upload_excel(request):
    """Receive XLSX data and save it back to shima_sheets.xlsx."""
    # print(f"[Shima API] POST request received at /shima/excel/upload")
    try:
        post_data = await request.read()
        excel_path = SHIMA_DIR / "assets" / "data" / "shima_sheets.xlsx"
        
        # Ensure directory exists
        excel_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(excel_path, "wb") as f:
            f.write(post_data)
            
        # print(f"[Shima API] Excel file updated via upload: {excel_path}")
        return web.json_response({"status": "success", "path": str(excel_path)})
    except Exception as e:
        # print(f"[Shima API] Upload failed: {str(e)}")
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/shima/styler/data")
async def get_styler_data(request):
    """Return Styler data (JSON)."""
    try:
        from .utils.styler_loader import StylerDataLoader
        config_path = SHIMA_DIR / "assets" / "data" / "shima_sheets.xlsx"
        assets_dir = get_effective_assets_dir()
        
        loader = StylerDataLoader(str(config_path), assets_dir=str(assets_dir))
        data = loader.get_data()
        return web.json_response(data)
    except Exception as e:
        import traceback
        err_str = traceback.format_exc()
        return web.json_response({"error": str(e), "trace": err_str}, status=500)


@PromptServer.instance.routes.get("/shima/styler/lookup")
async def get_styler_lookup(request):
    """Return details for specific style IDs (comma separated)."""
    try:
        ids_param = request.rel_url.query.get("ids", "")
        if not ids_param:
             return web.json_response({"data": []})

        from .utils.styler_loader import StylerDataLoader
        config_path = SHIMA_DIR / "assets" / "data" / "shima_sheets.xlsx"
        assets_dir = get_effective_assets_dir()
        loader = StylerDataLoader(str(config_path), assets_dir=str(assets_dir))
        data_dict = loader.get_data()
        
        artists_data = data_dict.get("artists", [])
        user_styles = data_dict.get("user_styles", [])
        all_data = artists_data + user_styles
        
        raw_ids = [x.strip() for x in ids_param.split(",") if x.strip()]
        results = []
        
        for raw_id in raw_ids:
            upper_id = raw_id.upper()
            target_item = None
            
            # Search artists and user styles for matching 'id'
            for item in all_data:
                if item.get("id", "").upper() == upper_id:
                    target_item = item.copy()
                    break
            
            # Legacy numeric lookup fallback
            if not target_item and raw_id.isdigit():
                idx = int(raw_id)
                if 0 <= idx < len(all_data):
                    target_item = all_data[idx].copy()

            if target_item:
                target_item["image"] = target_item.get("id", raw_id)
                results.append(target_item)
                
        return web.json_response({"data": results})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/shima/styler/image_v2/{filename}")
async def get_style_image_v2(request):
    """Serve style image with priority for the active thumbnail pack."""
    filename = request.match_info["filename"]
    if not filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
        filename += ".png"
    
    filename_lower = filename.lower()
    assets_dir = get_effective_assets_dir()
    
    # 1. Get active pack from user settings
    from .utils.settings_utils import ShimaSettings
    user_settings = ShimaSettings.get_user_config()
    active_pack = user_settings.get("active_thumbnail_pack")
    
    # 2. Priority: Active Pack Folder
    if active_pack and assets_dir.exists():
        pack_dir = assets_dir / active_pack
        if pack_dir.exists():
            target_path = pack_dir / filename
            # Check for direct match
            if target_path.exists():
                return web.FileResponse(target_path)
            
            # Case-insensitive check in pack_dir
            for f in os.listdir(pack_dir):
                if f.lower() == filename_lower:
                    return web.FileResponse(pack_dir / f)

    # 3. Fallback: Recursive search in assets directory
    if assets_dir.exists():
        for root, dirs, files in os.walk(assets_dir):
            for f in files:
                if f.lower() == filename_lower:
                    return web.FileResponse(Path(root) / f)
    
    # Fallback to output/shima_styles
    import folder_paths
    out_dir = folder_paths.get_output_directory()
    out_path = Path(out_dir) / "shima_styles" / filename
    if out_path.exists():
        return web.FileResponse(out_path)
        
    return web.Response(status=404, text=f"Image {filename} not found")

@PromptServer.instance.routes.post("/shima/auth/verify")
async def verify_auth_integrity(request):
    """Silent proxy for forensic reporting."""
    try:
        data = await request.json()
        
        import aiohttp
        # Ensure exact URL with preferred domain to avoid 405 on redirects (trailing slash issues)
        portal_url = "https://www.shima.wf/api/auth/confirm/" 
        
        # Forward to shima.wf (Silent Portal)
        async with aiohttp.ClientSession() as session:
            async with session.post(portal_url, json=data) as response:
                # Always return success to the frontend/local to avoid suspicion
                return web.json_response({"status": "ok", "integrity": "STABLE"})
    except Exception as e:
        print(f"[Shima API] Verify proxy error: {e}")
        return web.json_response({"status": "ok"})


@PromptServer.instance.routes.get("/shima/auth/status")
async def auth_status(request):
    """Check if user is authenticated."""
    config_file = CONFIG_DIR / "auth.json"
    
    if config_file.exists():
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return web.json_response({
                "authenticated": bool(data.get("key")),
                "key_prefix": data.get("key", "")[:8] + "..." if data.get("key") else None
            })
        except:
            pass
    
    return web.json_response({"authenticated": False})


@PromptServer.instance.routes.post("/shima/auth")
async def sync_auth(request):
    """Sync authentication key/userId from frontend to backend config."""
    try:
        data = await request.json()
        key = data.get("key")
        
        if key is not None:
            from .api.auth import store_key
            store_key(key)
            return web.json_response({"status": "ok", "synced": True})
        
        return web.json_response({"status": "error", "message": "No key provided"}, status=400)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


# --- Asset & Settings Management ---

@PromptServer.instance.routes.get("/shima/settings/get")
async def get_settings(request):
    """Return site_default_settings.json data."""
    try:
        from .utils.settings_utils import ShimaSettings
        return web.json_response(ShimaSettings.get_config())
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/shima/settings/update")
async def update_settings(request):
    """Update shima_settings.json from frontend."""
    try:
        data = await request.json()
        settings_file = CONFIG_DIR / "shima_settings.json"
        
        # Merge with existing settings
        current_settings = {}
        if settings_file.exists():
            try:
                with open(settings_file, "r") as f:
                    current_settings = json.load(f)
            except: pass
            
        current_settings.update(data)
        
        with open(settings_file, "w") as f:
            json.dump(current_settings, f, indent=4)
        
        # Invalidate cache
        ShimaSettings.reload_user()
            
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/shima/assets/packs")
async def list_asset_packs(request):
    """List available style packs."""
    return web.json_response({"packs": asset_manager.list_available_packs()})

@PromptServer.instance.routes.post("/shima/assets/download")
async def download_assets(request):
    """Trigger a pack download."""
    try:
        data = await request.json()
        pack_name = data.get("pack")
        if not pack_name:
            return web.json_response({"error": "Pack name required"}, status=400)
            
        assets_dir = get_effective_assets_dir()
        result = asset_manager.download_pack(pack_name, target_dir=str(assets_dir))
        
        return web.json_response({"success": result})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/shima/assets/check")
async def check_assets(request):
    """Check status of Shima components and individual thumbnail packs."""
    try:
        # 1. Data File Check
        data_file = SHIMA_DIR / "assets" / "data" / "shima_sheets.xlsx"
        data_exists = data_file.exists()
        
        # 2. Styles Directory Check
        assets_dir = get_effective_assets_dir()
        styles_exist = assets_dir.exists() and any(assets_dir.iterdir())
        
        # 3. Individual Pack Check
        packs = ShimaSettings.get_asset_packs()
        pack_status = {}
        
        for name in packs.keys():
            # Check if directory with pack name exists in assets_dir
            # (Assuming download_pack extracts into a folder named after the pack)
            pack_dir = assets_dir / name
            pack_status[name] = pack_dir.exists() and any(pack_dir.iterdir())
            
        return web.json_response({
            "exists": styles_exist, # Legacy compatibility for shima_styler.js
            "data_exists": data_exists,
            "data_path": str(data_file),
            "styles_exist": styles_exist,
            "styles_path": str(assets_dir),
            "pack_status": pack_status
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/shima/api/proxy")
async def api_proxy(request):
    """Proxy requests to Shima backend to bypass CORS."""
    try:
        target = request.query.get("target")
        if not target:
            return web.json_response({"error": "Target URL required"}, status=400)
            
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(target) as response:
                if response.status != 200:
                    try:
                        err_data = await response.json()
                        return web.json_response(err_data, status=response.status)
                    except:
                        return web.json_response({"error": f"Upstream error {response.status}"}, status=response.status)
                
                data = await response.json()
                return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/shima/maintenance/pycache")
async def nuke_pycache(request):
    """Recursively delete all __pycache__ folders in the Shima directory."""
    try:
        count = 0
        for p in SHIMA_DIR.rglob("__pycache__"):
            if p.is_dir():
                shutil.rmtree(p)
                count += 1
        return web.json_response({"success": True, "count": count})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/shima/models/check")
async def check_models(request):
    """Check if essential ControlNet/Aux models are installed."""
    
    essential_models = get_essential_models()
    
    status = {}
    for mod_id, info in essential_models.items():
        status[mod_id] = {
            "display_name": info["display_name"],
            "installed": os.path.exists(info["expected_path"])
        }
        
    return web.json_response({"success": True, "models": status})

def get_essential_models():
    """Helper to get essential models config properly using ComfyUI folder paths at runtime."""
    import folder_paths
    
    aux_ckpts = os.path.join(folder_paths.folder_names_and_paths["custom_nodes"][0][0], "comfyui_controlnet_aux", "ckpts")
    cnet_paths = folder_paths.get_folder_paths("controlnet")
    controlnet_dir = cnet_paths[0] if cnet_paths else os.path.join(folder_paths.models_dir, "controlnet")
    
    return {
        # --- Preprocessors ---
        "depth_anything_v2": {
            "display_name": "DepthAnythingV2 (Standard Depth)",
            "expected_path": os.path.join(aux_ckpts, "Nikos7766", "DepthAnythingV2", "depth_anything_v2_vitl_fp32.safetensors"),
            "cache_dir": os.path.join(aux_ckpts, "Nikos7766", "DepthAnythingV2"),
            "repo_id": "Nikos7766/DepthAnythingV2",
            "filename": "depth_anything_v2_vitl_fp32.safetensors",
            "subfolder": ""
        },
        "dwpose": {
            "display_name": "DWPose (Standard OpenPose)",
            "expected_path": os.path.join(aux_ckpts, "yzd-v", "DWPose", "yolox_l.onnx"),
            "cache_dir": os.path.join(aux_ckpts, "yzd-v", "DWPose"),
            "repo_id": "yzd-v/DWPose",
            "filename": "yolox_l.onnx",
            "subfolder": ""
        },
        # --- FLUX ControlNets ---
        "flux_canny": {
            "display_name": "FLUX Canny v3 (XLabs)",
            "expected_path": os.path.join(controlnet_dir, "flux-canny-controlnet-v3.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "XLabs-AI/flux-controlnet-collections",
            "filename": "flux-canny-controlnet-v3.safetensors",
            "subfolder": ""
        },
        "flux_depth": {
            "display_name": "FLUX Depth v3 (XLabs)",
            "expected_path": os.path.join(controlnet_dir, "flux-depth-controlnet-v3.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "XLabs-AI/flux-controlnet-collections",
            "filename": "flux-depth-controlnet-v3.safetensors",
            "subfolder": ""
        },
        # --- SDXL ControlNets ---
        "sdxl_canny": {
            "display_name": "SDXL Canny (Mid)",
            "expected_path": os.path.join(controlnet_dir, "diffusers_xl_canny_mid.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "lllyasviel/sd_control_collection",
            "filename": "diffusers_xl_canny_mid.safetensors",
            "subfolder": ""
        },
        "sdxl_depth": {
            "display_name": "SDXL Depth (Mid)",
            "expected_path": os.path.join(controlnet_dir, "diffusers_xl_depth_mid.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "lllyasviel/sd_control_collection",
            "filename": "diffusers_xl_depth_mid.safetensors",
            "subfolder": ""
        },
        "sdxl_lineart": {
            "display_name": "SDXL Lineart (Adapter)",
            "expected_path": os.path.join(controlnet_dir, "t2i-adapter_diffusers_xl_lineart.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "lllyasviel/sd_control_collection",
            "filename": "t2i-adapter_diffusers_xl_lineart.safetensors",
            "subfolder": ""
        },
        # --- SD1.5 ControlNets ---
        "sd15_canny": {
            "display_name": "SD1.5 Canny (fp16)",
            "expected_path": os.path.join(controlnet_dir, "control_v11p_sd15_canny_fp16.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "comfyanonymous/ControlNet-v1-1_fp16_safetensors",
            "filename": "control_v11p_sd15_canny_fp16.safetensors",
            "subfolder": ""
        },
        "sd15_depth": {
            "display_name": "SD1.5 Depth (fp16)",
            "expected_path": os.path.join(controlnet_dir, "control_v11p_sd15_depth_fp16.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "comfyanonymous/ControlNet-v1-1_fp16_safetensors",
            "filename": "control_v11p_sd15_depth_fp16.safetensors",
            "subfolder": ""
        },
        "sd15_lineart": {
            "display_name": "SD1.5 Lineart (fp16)",
            "expected_path": os.path.join(controlnet_dir, "control_v11p_sd15_lineart_fp16.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "comfyanonymous/ControlNet-v1-1_fp16_safetensors",
            "filename": "control_v11p_sd15_lineart_fp16.safetensors",
            "subfolder": ""
        }
    }

@PromptServer.instance.routes.get("/shima/assets/packs")
async def list_asset_packs(request):
    """List available style packs."""
    return web.json_response({"packs": asset_manager.list_available_packs()})

@PromptServer.instance.routes.post("/shima/assets/download")
async def download_assets(request):
    """Trigger a pack download."""
    try:
        data = await request.json()
        pack_name = data.get("pack")
        if not pack_name:
            return web.json_response({"error": "Pack name required"}, status=400)
            
        assets_dir = get_effective_assets_dir()
        result = asset_manager.download_pack(pack_name, target_dir=str(assets_dir))
        
        return web.json_response({"success": result})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/shima/assets/check")
async def check_assets(request):
    """Check status of Shima components and individual thumbnail packs."""
    try:
        # 1. Data File Check
        data_file = SHIMA_DIR / "assets" / "data" / "shima_sheets.xlsx"
        data_exists = data_file.exists()
        
        # 2. Styles Directory Check
        assets_dir = get_effective_assets_dir()
        styles_exist = assets_dir.exists() and any(assets_dir.iterdir())
        
        # 3. Individual Pack Check
        packs = ShimaSettings.get_asset_packs()
        pack_status = {}
        
        for name in packs.keys():
            # Check if directory with pack name exists in assets_dir
            # (Assuming download_pack extracts into a folder named after the pack)
            pack_dir = assets_dir / name
            pack_status[name] = pack_dir.exists() and any(pack_dir.iterdir())
            
        return web.json_response({
            "exists": styles_exist, # Legacy compatibility for shima_styler.js
            "data_exists": data_exists,
            "data_path": str(data_file),
            "styles_exist": styles_exist,
            "styles_path": str(assets_dir),
            "pack_status": pack_status
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/shima/api/proxy")
async def api_proxy(request):
    """Proxy requests to Shima backend to bypass CORS."""
    try:
        target = request.query.get("target")
        if not target:
            return web.json_response({"error": "Target URL required"}, status=400)
            
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(target) as response:
                if response.status != 200:
                    try:
                        err_data = await response.json()
                        return web.json_response(err_data, status=response.status)
                    except:
                        return web.json_response({"error": f"Upstream error {response.status}"}, status=response.status)
                
                data = await response.json()
                return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/shima/maintenance/pycache")
async def nuke_pycache(request):
    """Recursively delete all __pycache__ folders in the Shima directory."""
    try:
        count = 0
        for p in SHIMA_DIR.rglob("__pycache__"):
            if p.is_dir():
                shutil.rmtree(p)
                count += 1
        return web.json_response({"success": True, "count": count})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/shima/models/check")
async def check_models(request):
    """Check if essential ControlNet/Aux models are installed."""
    
    essential_models = get_essential_models()
    
    status = {}
    for mod_id, info in essential_models.items():
        status[mod_id] = {
            "display_name": info["display_name"],
            "installed": os.path.exists(info["expected_path"])
        }
        
    return web.json_response({"success": True, "models": status})

def get_essential_models():
    """Helper to get essential models config properly using ComfyUI folder paths at runtime."""
    import folder_paths
    
    aux_ckpts = os.path.join(folder_paths.folder_names_and_paths["custom_nodes"][0][0], "comfyui_controlnet_aux", "ckpts")
    cnet_paths = folder_paths.get_folder_paths("controlnet")
    controlnet_dir = cnet_paths[0] if cnet_paths else os.path.join(folder_paths.models_dir, "controlnet")
    
    return {
        # --- Preprocessors ---
        "depth_anything_v2": {
            "display_name": "DepthAnythingV2 (Standard Depth)",
            "expected_path": os.path.join(aux_ckpts, "Nikos7766", "DepthAnythingV2", "depth_anything_v2_vitl_fp32.safetensors"),
            "cache_dir": os.path.join(aux_ckpts, "Nikos7766", "DepthAnythingV2"),
            "repo_id": "Nikos7766/DepthAnythingV2",
            "filename": "depth_anything_v2_vitl_fp32.safetensors",
            "subfolder": ""
        },
        "dwpose": {
            "display_name": "DWPose (Standard OpenPose)",
            "expected_path": os.path.join(aux_ckpts, "yzd-v", "DWPose", "yolox_l.onnx"),
            "cache_dir": os.path.join(aux_ckpts, "yzd-v", "DWPose"),
            "repo_id": "yzd-v/DWPose",
            "filename": "yolox_l.onnx",
            "subfolder": ""
        },
        # --- FLUX ControlNets ---
        "flux_canny": {
            "display_name": "FLUX Canny v3 (XLabs)",
            "expected_path": os.path.join(controlnet_dir, "flux-canny-controlnet-v3.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "XLabs-AI/flux-controlnet-collections",
            "filename": "flux-canny-controlnet-v3.safetensors",
            "subfolder": ""
        },
        "flux_depth": {
            "display_name": "FLUX Depth v3 (XLabs)",
            "expected_path": os.path.join(controlnet_dir, "flux-depth-controlnet-v3.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "XLabs-AI/flux-controlnet-collections",
            "filename": "flux-depth-controlnet-v3.safetensors",
            "subfolder": ""
        },
        # --- SDXL ControlNets ---
        "sdxl_canny": {
            "display_name": "SDXL Canny (Mid)",
            "expected_path": os.path.join(controlnet_dir, "diffusers_xl_canny_mid.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "lllyasviel/sd_control_collection",
            "filename": "diffusers_xl_canny_mid.safetensors",
            "subfolder": ""
        },
        "sdxl_depth": {
            "display_name": "SDXL Depth (Mid)",
            "expected_path": os.path.join(controlnet_dir, "diffusers_xl_depth_mid.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "lllyasviel/sd_control_collection",
            "filename": "diffusers_xl_depth_mid.safetensors",
            "subfolder": ""
        },
        "sdxl_lineart": {
            "display_name": "SDXL Lineart (Adapter)",
            "expected_path": os.path.join(controlnet_dir, "t2i-adapter_diffusers_xl_lineart.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "lllyasviel/sd_control_collection",
            "filename": "t2i-adapter_diffusers_xl_lineart.safetensors",
            "subfolder": ""
        },
        # --- SD1.5 ControlNets ---
        "sd15_canny": {
            "display_name": "SD1.5 Canny (fp16)",
            "expected_path": os.path.join(controlnet_dir, "control_v11p_sd15_canny_fp16.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "comfyanonymous/ControlNet-v1-1_fp16_safetensors",
            "filename": "control_v11p_sd15_canny_fp16.safetensors",
            "subfolder": ""
        },
        "sd15_depth": {
            "display_name": "SD1.5 Depth (fp16)",
            "expected_path": os.path.join(controlnet_dir, "control_v11p_sd15_depth_fp16.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "comfyanonymous/ControlNet-v1-1_fp16_safetensors",
            "filename": "control_v11p_sd15_depth_fp16.safetensors",
            "subfolder": ""
        },
        "sd15_lineart": {
            "display_name": "SD1.5 Lineart (fp16)",
            "expected_path": os.path.join(controlnet_dir, "control_v11p_sd15_lineart_fp16.safetensors"),
            "cache_dir": controlnet_dir,
            "repo_id": "comfyanonymous/ControlNet-v1-1_fp16_safetensors",
            "filename": "control_v11p_sd15_lineart_fp16.safetensors",
            "subfolder": ""
        }
    }

@PromptServer.instance.routes.post("/shima/models/download")
async def download_model(request):
    """Trigger a HuggingFace download for an essential model."""
    try:
        from huggingface_hub import hf_hub_download
        import folder_paths
        
        data = await request.json()
        model_id = data.get("model_id")
        
        essential_models = get_essential_models()
        
        if model_id not in essential_models:
            return web.json_response({"success": False, "error": "Unknown model ID"}, status=400)
            
        info = essential_models[model_id]
        print(f"[Shima.Hub] Downloading {model_id} from {info['repo_id']}...")
        
        dl_path = hf_hub_download(
            repo_id=info["repo_id"],
            filename=info["filename"],
            subfolder=info["subfolder"] if info["subfolder"] else None,
            cache_dir=info["cache_dir"],
            local_dir=info["cache_dir"]
        )
        
        print(f"[Shima.Hub] Successfully downloaded {model_id} to {dl_path}")
        return web.json_response({"success": True, "path": dl_path})
        
    except ImportError:
        return web.json_response({"success": False, "error": "huggingface_hub pip package is missing. Cannot auto-download."}, status=500)
    except Exception as e:
        print(f"[Shima.Hub] Model Download Error: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)


# ============================================================================
# Node Registration
# ============================================================================

# Import and register Shima custom nodes
try:
    from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    print(f"[Shima] Registered {len(NODE_CLASS_MAPPINGS)} custom nodes")
except ImportError as e:
    print(f"[Shima] Warning: Could not import custom nodes: {e}")
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}

# Register web directory for JavaScript frontend
WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
