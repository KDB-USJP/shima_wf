import json
import os
import re

# Load hardened deps
hardened_path = r"e:\ComfyDev\Shima\workflow_deps_hardened.txt"
old_data_path = r"E:\ComfyDev\Docs\Old System JSON\data.json"

with open(hardened_path, "r") as f:
    hardened_lines = f.readlines()

# Improved capture for models in the hardened report: "  Path"
active_models = []
for line in hardened_lines:
    if line.startswith("  ") and "|" in line:
        # Capture the path before the pipe
        path = line.split("|")[0].strip()
        if path:
            active_models.append(path)

# Load old data
with open(old_data_path, "r") as f:
    old_data = json.load(f)

# Build flattened registry from old data
registry = {}
for section in old_data:
    if isinstance(old_data[section], dict) and "models" in old_data[section]:
        for m in old_data[section]["models"]:
            registry[m["filename"]] = m

# Official Bundle
official_bundle = {
    "id": "shima_official_deps",
    "name": "Official Shima WF Dependencies---Stable Diffusion",
    "description": "Essential models for official Shima 'Finals' workflows.",
    "is_bundle": True,
    "models": []
}

processed = set()

def add_model(path):
    filename = os.path.basename(path)
    if filename in processed: return
    
    m_info = registry.get(filename, {})
    
    # Infer type from path/registry
    m_type = "Checkpoints"
    if "lora" in path.lower() or "loras" in path.lower(): m_type = "LoRAs"
    elif "vae" in path.lower() and "checkpoints" not in path.lower(): m_type = "VAEs"
    
    entry = {
        "id": path.replace("\\", "/"),
        "name": filename,
        "type": m_info.get("type", m_type),
        "url": m_info.get("url", "https://INSERT_URL_HERE"),
        "filename": filename,
        "description": m_info.get("description", f"Essential component for {m_type}.")
    }
    official_bundle["models"].append(entry)
    processed.add(filename)

# Add active models
for m in active_models:
    add_model(m)

# Output final JSON
output_path = r"e:\ComfyDev\Shima\config\official_dependencies.json"
with open(output_path, "w") as f:
    json.dump(official_bundle, f, indent=4)

print(f"Generated {len(official_bundle['models'])} dependencies to {output_path}")
matched = [m for m in official_bundle['models'] if 'INSERT' not in m['url']]
print(f"Matched {len(matched)} models from registry:")
for m in matched:
    print(f"  - {m['name']}")
