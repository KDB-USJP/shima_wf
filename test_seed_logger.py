
import sys
import os
import unittest
from unittest.mock import MagicMock

# Add nodes dir to path
sys.path.append(os.path.join(os.path.dirname(__file__), "nodes"))

# Mock imports that might be missing
sys.modules['torch'] = MagicMock()
sys.modules['numpy'] = MagicMock()
shim_pil = MagicMock()
sys.modules['PIL'] = shim_pil
sys.modules['PIL.Image'] = shim_pil.Image

# Now import the node
from seed_logger import ShimaSeedLogger

class TestShimaSeedLogger(unittest.TestCase):
    
    def setUp(self):
        # Reset history
        ShimaSeedLogger.HISTORY = []
        self.logger = ShimaSeedLogger()
        
    def test_log_seed_basic(self):
        # Log entry
        ret = self.logger.log_seed(
            s33d=12345,
            history_limit=10,
        )
        
        # Unpack result
        ui = ret['ui']
        
        # Check History
        self.assertEqual(len(ShimaSeedLogger.HISTORY), 1)
        self.assertEqual(ShimaSeedLogger.HISTORY[0]['seed'], 12345)
        
        # Check UI Payload
        content = ui['content'][0]
        self.assertIn("12345", content)
        self.assertIn("shima-simple-seed-list", content)

    def test_history_limit(self):
        # Log 5 entries with limit 3
        for i in range(5):
            self.logger.log_seed(s33d=i, history_limit=3)
            
        self.assertEqual(len(ShimaSeedLogger.HISTORY), 3)
        # Should have kept last 3 (2, 3, 4)
        self.assertEqual(ShimaSeedLogger.HISTORY[0]['seed'], 2)
        self.assertEqual(ShimaSeedLogger.HISTORY[2]['seed'], 4)

if __name__ == '__main__':
    unittest.main()
