import json

data_path = r"E:\ComfyDev\Docs\Old System JSON\data.json"
targets = ["absolute", "juggernaut", "lumina", "v9", "1.81"]

with open(data_path, "r") as f:
    data = json.load(f)

print(f"Searching {len(data)} top-level keys...")

def find_models(obj):
    found = []
    if isinstance(obj, dict):
        if "filename" in obj and "url" in obj:
            fname = obj["filename"].lower()
            for t in targets:
                if t in fname:
                    found.append(obj)
                    break
        for v in obj.values():
            found.extend(find_models(v))
    elif isinstance(obj, list):
        for item in obj:
            found.extend(find_models(item))
    return found

all_matches = find_models(data)
print(json.dumps(all_matches, indent=2))
