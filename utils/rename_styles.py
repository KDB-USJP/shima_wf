import os
import re
import shutil

STYLES_DIR = r"C:\AI\custom_nodes\Shima\assets\styles"
BACKUP_DIR = r"C:\AI\custom_nodes\Shima\assets\styles_backup"

def rename_styles():
    if not os.path.exists(STYLES_DIR):
        print(f"Error: Styles directory not found at {STYLES_DIR}")
        return

    # Create backup
    if not os.path.exists(BACKUP_DIR):
        print(f"Creating backup at {BACKUP_DIR}...")
        shutil.copytree(STYLES_DIR, BACKUP_DIR)
    else:
        print(f"Backup already exists at {BACKUP_DIR}, skipping backup.")

    files = os.listdir(STYLES_DIR)
    print(f"Found {len(files)} files.")

    count = 0
    for filename in files:
        if not filename.endswith(".png"):
            continue

        # Match "123_Name... .png"
        match = re.match(r"^(\d+)_.*\.png$", filename)
        if match:
            id_part = match.group(1)
            new_name = f"{id_part}.png"
            
            old_path = os.path.join(STYLES_DIR, filename)
            new_path = os.path.join(STYLES_DIR, new_name)

            if old_path != new_path:
                try:
                    os.rename(old_path, new_path)
                    # print(f"Renamed: {filename} -> {new_name}")
                    count += 1
                except Exception as e:
                    print(f"Failed to rename {filename}: {e}")
    
    print(f"Successfully renamed {count} files.")

if __name__ == "__main__":
    rename_styles()
