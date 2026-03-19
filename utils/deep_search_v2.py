import json

def deep_search(obj, target_substrings):
    results = []
    if isinstance(obj, dict):
        # We are looking for any object that has a name/filename/url and matches our targets
        text_to_check = ""
        if "name" in obj: text_to_check += " " + str(obj["name"]).lower()
        if "filename" in obj: text_to_check += " " + str(obj["filename"]).lower()
        
        is_match = False
        for target in target_substrings:
            if target.lower() in text_to_check:
                is_match = True
                break
        
        if is_match and "url" in obj:
            results.append(obj)
            
        for key, value in obj.items():
            results.extend(deep_search(value, target_substrings))
            
    elif isinstance(obj, list):
        for item in obj:
            results.extend(deep_search(item, target_substrings))
            
    return results

data_path = r"E:\ComfyDev\Docs\Old System JSON\data.json"
with open(data_path, "r", encoding="utf-8") as f:
    data = json.load(f)

targets = ["Absolute", "Juggernaut", "Reality", "v9", "1.81"]
matches = deep_search(data, targets)

# De-duplicate matches by URL
unique_matches = {}
for m in matches:
    url = m.get("url")
    if url and url not in unique_matches:
        unique_matches[url] = m

print(f"Found {len(unique_matches)} unique matches:")
for url, m in unique_matches.items():
    print(f"--- MATCH ---")
    print(f"  Name: {m.get('name')}")
    print(f"  Filename: {m.get('filename')}")
    print(f"  URL: {url}")
