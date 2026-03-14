"""
Shima Utility: Clean Python Cache

Cleans all __pycache__ folders and .pyc files from ComfyUI custom_nodes.
Run this when nodes aren't updating properly after code changes.

Usage:
    python clean_pycache.py
"""

import os
import shutil
from pathlib import Path


def clean_pycache(base_path: Path = None):
    """Remove all __pycache__ directories and .pyc files recursively."""
    
    if base_path is None:
        # Default to the Shima directory
        base_path = Path(__file__).parent
    
    removed_dirs = 0
    removed_files = 0
    
    # Walk through all directories
    for root, dirs, files in os.walk(base_path, topdown=False):
        root_path = Path(root)
        
        # Remove __pycache__ directories
        if root_path.name == "__pycache__":
            print(f"  Removing: {root_path}")
            shutil.rmtree(root_path, ignore_errors=True)
            removed_dirs += 1
            continue
        
        # Remove .pyc files
        for file in files:
            if file.endswith(".pyc"):
                file_path = root_path / file
                print(f"  Removing: {file_path}")
                file_path.unlink(missing_ok=True)
                removed_files += 1
    
    return removed_dirs, removed_files


def clean_all_custom_nodes():
    """Clean pycache from all custom_nodes directories."""
    
    # Try to find ComfyUI's custom_nodes directory
    shima_dir = Path(__file__).parent
    custom_nodes_dir = shima_dir.parent  # Go up from Shima to custom_nodes
    
    if custom_nodes_dir.name != "custom_nodes":
        print(f"Warning: Expected to be in custom_nodes, found: {custom_nodes_dir.name}")
        print(f"Cleaning only Shima directory: {shima_dir}")
        dirs, files = clean_pycache(shima_dir)
    else:
        print(f"Cleaning all custom_nodes: {custom_nodes_dir}")
        dirs, files = clean_pycache(custom_nodes_dir)
    
    print(f"\n[OK] Cleaned {dirs} __pycache__ directories and {files} .pyc files")
    print("Restart ComfyUI for changes to take effect.")


if __name__ == "__main__":
    print("=" * 50)
    print("Shima Pycache Cleaner")
    print("=" * 50)
    print()
    clean_all_custom_nodes()
