
import sys
import os
import unittest
from unittest.mock import MagicMock

# Add nodes dir to path
sys.path.append(os.path.join(os.path.dirname(__file__), "nodes"))

# Mock dependencies
sys.modules['numpy'] = MagicMock()
shim_pil = MagicMock()
sys.modules['PIL'] = shim_pil
sys.modules['PIL.Image'] = shim_pil.Image

# Proper Mock for Torch Tensor to support isinstance
class MockTensor:
    def __init__(self):
        self.shape = (1, 3, 512, 512)
        self.dtype = "torch.float32"

mock_torch = MagicMock()
mock_torch.Tensor = MockTensor
sys.modules['torch'] = mock_torch

import torch
from inspector import ShimaInspector

class TestShimaInspector(unittest.TestCase):
    
    def setUp(self):
        self.inspector = ShimaInspector()
        
    def test_basic_types(self):
        # Test basic pass-through and inspection
        ret = self.inspector.inspect_and_pass(
            any_01="Hello World",
            any_02=123,
            any_03=3.14
        )
        
        # Check pass-through outputs (returns tuple of 10)
        outputs = ret['result']
        self.assertEqual(len(outputs), 10)
        self.assertEqual(outputs[0], "Hello World") # any_01
        self.assertEqual(outputs[1], 123)           # any_02
        self.assertEqual(outputs[2], 3.14)          # any_03
        self.assertIsNone(outputs[9])               # any_10 (unused)
        
        # Check UI
        ui_content = ret['ui']['content'][0]
        self.assertIn("Hello World", ui_content)
        self.assertIn("STRING", ui_content)
        self.assertIn("123", ui_content)
        
    def test_complex_types(self):
        # Mock Tensor
        mock_tensor = torch.Tensor()
        # Shape/Dtype are set in __init__ of MockTensor above
        
        # Mock Dict and List
        my_list = [1, 2, 3, 4]
        my_dict = {"a": 1, "b": 2}
        
        ret = self.inspector.inspect_and_pass(
            any_01=mock_tensor,
            any_02=my_list,
            any_03=my_dict
        )
        
        ui_content = ret['ui']['content'][0]
        
        # Check Tensor Inspection
        self.assertIn("TENSOR", ui_content)
        self.assertIn("[1, 3, 512, 512]", ui_content)
        
        # Check Collection Inspection
        self.assertIn("LIST[4]", ui_content)
        self.assertIn("DICT[2]", ui_content)

if __name__ == '__main__':
    unittest.main()
