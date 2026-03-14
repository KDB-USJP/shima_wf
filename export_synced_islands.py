import sqlite3
import os
from pathlib import Path
import base64
import json

def _get_sys_seed(current_dir):
    """Get host-locked obfuscation seed from settings."""
    settings_file = current_dir / "config" / "shima_settings.json"
    if settings_file.exists():
        try:
            with open(settings_file, "r") as f:
                settings = json.load(f)
                return settings.get("_sys_seed")
        except: pass
    return None

def _deobfuscate(data, seed):
    """XOR + Base64 de-obfuscation."""
    if not data or not seed: return data
    try:
        # Check if already JSON (legacy support)
        if data.strip().startswith('{'):
            return data
            
        key_bytes = seed.encode()
        data_bytes = base64.b64decode(data)
        xor_result = bytes([data_bytes[i] ^ key_bytes[i % len(key_bytes)] for i in range(len(data_bytes))])
        return xor_result.decode()
    except:
        return data

def export_islands():
    # Paths
    current_dir = Path(__file__).parent
    db_path = current_dir / "data" / "islands.db"
    export_dir = current_dir / "exported_workflows"
    
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}")
        print("Please click 'Refresh & Sync Library' in ComfyUI first.")
        return

    # Ensure export directory exists
    export_dir.mkdir(exist_ok=True)
    
    print(f"Exporting workflows to: {export_dir}")
    
    seed = _get_sys_seed(current_dir)
    
    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        cur.execute("SELECT id, name, json_data FROM islands")
        rows = cur.fetchall()
        
        if not rows:
            print("Warning: No workflows found in database.")
            return

        exported_count = 0
        for row in rows:
            island_id = row['id']
            name = row['name']
            
            raw_data = row['json_data']
            json_text = _deobfuscate(raw_data, seed)
            
            try:
                data = json.loads(json_text)
            except Exception as e:
                print(f"  Failed to parse {name}: {e}")
                continue
            
            # Clean name for filename
            clean_name = "".join([c if c.isalnum() or c in " ._-" else "_" for c in name])
            filename = f"{clean_name}.json"
            file_path = export_dir / filename

            # Forensic Bridging: Ensure buyer_id is in widgets_values for Owner Bypass
            if "nodes" in data:
                for node in data["nodes"]:
                    if node.get("type") in ["Shima.SystemBuffer", "SystemBuffer"]:
                        props = node.get("properties", {})
                        widgets = node.get("widgets_values", [])
                        
                        # Shima.SystemBuffer widget map:
                        # 0: buffer_mode, 1: v_depth, 2: _buffer_data, 3: signature, 4: island_id, 5: buyer_id
                        
                        buyer_id = props.get("b_idx") or props.get("buyer_id")
                        if buyer_id:
                            # Ensure we have at least 5 slots (up to island_id)
                            while len(widgets) < 5:
                                widgets.append("")
                            
                            # Inject buyer_id at index 5 if missing or mismatch
                            if len(widgets) == 5:
                                widgets.append(buyer_id)
                            elif len(widgets) > 5:
                                widgets[5] = buyer_id
                            
                            node["widgets_values"] = widgets
            
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            
            print(f"  Exported: {filename}")
            exported_count += 1
            
        conn.close()
        print(f"\nSuccessfully exported {exported_count} workflows!")
        print(f"Files are located in: {export_dir.absolute()}")
        
    except Exception as e:
        print(f"Error during export: {e}")

if __name__ == "__main__":
    export_islands()
