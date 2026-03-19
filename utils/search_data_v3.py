import json

def search(o):
    if isinstance(o, dict):
        text = str(o).lower()
        if 'absolute' in text or 'juggernaut' in text or 'reality' in text:
            if 'url' in o:
                print(json.dumps(o, indent=2))
        for v in o.values():
            search(v)
    elif isinstance(o, list):
        for i in o:
            search(i)

try:
    with open(r'E:\ComfyDev\Docs\Old System JSON\data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    if isinstance(data, dict):
        for k, v in data.items():
            search(v)
except Exception as e:
    print(f"Error: {e}")
