import json
import os

data_path = r"E:\ComfyDev\Docs\Old System JSON\data.json"
targets = [
    "absolutereality",
    "juggernaut",
    "lumina",
    "perfect hands",
    "add-detail-xl"
]

with open(data_path, "r") as f:
    data = json.load(f)

print("Searching for matches in data.json...")
results = {}

def search_recursive(obj):
    if isinstance(obj, dict):
        if "filename" in obj and "url" in obj:
            fname = obj["filename"].lower()
            for t in targets:
                if t in fname:
                    if t not in results: results[t] = []
                    results[t].append(obj)
        for val in obj.values():
            search_recursive(val)
    elif isinstance(obj, list):
        for item in obj:
            search_recursive(item)

search_recursive(data)

for t, matches in results.items():
    print(f"\n--- Matches for '{t}' ---")
    for m in matches:
        print(f"  Name: {m.get('name')}")
        print(f"  Filename: {m.get('filename')}")
        print(f"  URL: {m.get('url')}")
