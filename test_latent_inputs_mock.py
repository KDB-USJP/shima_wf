
import sys
import os
from unittest.mock import MagicMock

# Mock ALL dependencies
sys.modules['torch'] = MagicMock()
sys.modules['numpy'] = MagicMock()
sys.modules['PIL'] = MagicMock()
sys.modules['cv2'] = MagicMock()
sys.modules['aiohttp'] = MagicMock()
sys.modules['server'] = MagicMock()
sys.modules['folder_paths'] = MagicMock()

# Add path
sys.path.append(os.getcwd())

# Import DIRECTLY from file path to avoid package init issues if possible
# or just rely on mocks
try:
    from nodes.latent_maker import ShimaLatentMaker
except ImportError:
    # Fallback for direct execution in nodes dir
    sys.path.append(os.path.join(os.getcwd(), "nodes"))
    from latent_maker import ShimaLatentMaker

print("--- ShimaLatentMaker Input Analysis ---")
inputs = ShimaLatentMaker.INPUT_TYPES()

required = inputs.get("required", {})
optional = inputs.get("optional", {})

print("\n[Required Inputs]")
for idx, key in enumerate(required.keys()):
    print(f"{idx}: {key}")

print("\n[Optional Inputs]")
for idx, key in enumerate(optional.keys()):
    print(f"{idx}: {key}")
