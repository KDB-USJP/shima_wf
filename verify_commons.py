
import sys
import os

# Add nodes dir to path
sys.path.append(os.path.join(os.path.dirname(__file__), "nodes"))

# Mock imports
from unittest.mock import MagicMock
sys.modules['torch'] = MagicMock()
sys.modules['numpy'] = MagicMock()
shim_pil = MagicMock()
sys.modules['PIL'] = shim_pil
sys.modules['PIL.Image'] = shim_pil.Image

from commons import ShimaCommons

def test():
    c = ShimaCommons()
    
    # Test SDXL (lowercase input) -> Should be 1024
    res_sdxl = c._calculate_dimensions("sdxl", "1:1", 0, 0)
    print(f"SDXL 1:1 ('sdxl') -> {res_sdxl}")
    
    # Test SD1.5 (lowercase input) -> Should be 512
    res_sd15 = c._calculate_dimensions("sd1.5", "1:1", 0, 0)
    print(f"SD 1.5 1:1 ('sd1.5') -> {res_sd15}")
    
    # Test Uppercase fallback
    res_UPPER = c._calculate_dimensions("SDXL", "1:1", 0, 0)
    print(f"SDXL 1:1 ('SDXL') -> {res_UPPER}")

    if res_sdxl == (1024, 1024) and res_sd15 == (512, 512):
        print("SUCCESS: Logic Correct")
        exit(0)
    else:
        print("FAILURE: Logic Incorrect")
        exit(1)

if __name__ == "__main__":
    test()
