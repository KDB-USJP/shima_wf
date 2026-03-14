
import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Add nodes dir to path
sys.path.append(os.path.join(os.path.dirname(__file__), "nodes"))

# Mock dependencies
sys.modules['torch'] = MagicMock()
sys.modules['numpy'] = MagicMock()
sys.modules['server'] = MagicMock() # Mock ComfyUI server
shim_pil = MagicMock()
sys.modules['PIL'] = shim_pil
sys.modules['PIL.Image'] = shim_pil.Image

# Import node
from batch_processor import ShimaBatchImageProcessor

class TestBatchProcessor(unittest.TestCase):
    
    def setUp(self):
        self.node = ShimaBatchImageProcessor()
        
    @patch('batch_processor.os.path.exists')
    @patch('batch_processor.os.path.isfile')
    @patch('batch_processor.os.listdir')
    @patch('PIL.Image.open')
    def test_basic_scan(self, mock_img_open, mock_listdir, mock_isfile, mock_exists):
        # Setup Mocks
        mock_exists.return_value = True
        mock_isfile.return_value = True
        
        # Mock listdir (non-recursive)
        mock_listdir.return_value = ["img1.png", "img2.jpg", "notes.txt"]
        
        # Mock Image Open
        mock_img = MagicMock()
        mock_img.mode = "RGB"
        mock_img.getbands.return_value = ("R", "G", "B")
        mock_img_open.return_value = mock_img
        
        # Run Node at Index 0 (unique_id='test1')
        # Expecting tuple: (image, mask, parent, relative, filename, index, total)
        ctx = self.node.load_image(
            directory="C:/Images", 
            index_mode="increment", 
            index=0, 
            recursive=False, 
            path_filter="*.png, *.jpg",
            path_exclude="*_raw*",
            safety_path="C:/Output",
            unique_id="test1"
        )
        self.assertEqual(ctx[4], "img1") # filename is now at index 4
        
        # Run Node again (simulating next execution) -> Index 1 (img2)
        # Note: With auto_queue=True (default), the node trusts the index input.
        # In real ComfyUI, JS updates the widget to 1. So we simulate that here.
        ctx2 = self.node.load_image(
            directory="C:/Images", 
            index_mode="increment", 
            index=1, 
            recursive=False, 
            path_filter="*.png, *.jpg",
            path_exclude="*_raw*",
            safety_path="C:/Output",
            unique_id="test1"
        )
        self.assertEqual(ctx2[4], "img2") # filename
        
        # Run Node again -> Index 2 (Total is 3 files in our mock)
        # Wait, mock listdir has ["img1.png", "img2.jpg", "notes.txt"]
        # Filter removes notes.txt? 
        # Default Filter is "*.png, *.jpg...". notes.txt excluded.
        # So we have 2 images.
        # Run 1: Index 0
        # Run 2: Index 1
        # Run 3: Index 2 -> Should RAISE Stop Error
        
        with self.assertRaises(ValueError) as cm:
             self.node.load_image(
                directory="C:/Images", 
                index_mode="increment", 
                index=2, 
                recursive=False, 
                path_filter="*.png, *.jpg",
                path_exclude="*_raw*",
                safety_path="C:/Output",
                unique_id="test1"
            )
        self.assertIn("Batch Limit Reached", str(cm.exception))
        
    @patch('batch_processor.os.path.exists')
    @patch('batch_processor.os.path.abspath')
    def test_safety_check(self, mock_abspath, mock_exists):
        mock_exists.return_value = True
        # Identity function for abspath
        mock_abspath.side_effect = lambda x: x 
        
        with self.assertRaises(ValueError):
            self.node.load_image(
                directory="C:/Images",
                index_mode="fixed",
                index=0,
                recursive=False,
                path_filter="*.png",
                path_exclude="",
                safety_path="C:/Images", # Same path!
                unique_id="test2"
            )

    @patch('batch_processor.os.path.exists')
    @patch('batch_processor.os.path.isfile')
    @patch('batch_processor.os.walk')
    @patch('PIL.Image.open')
    def test_recursive_relative_path(self, mock_img_open, mock_walk, mock_isfile, mock_exists):
        mock_exists.return_value = True
        mock_isfile.return_value = True
        
        # Simulate structured folder
        # Root: C:/Photos
        # File: C:/Photos/Vacation/2023/beach.png
        # os.walk yields (root, dirs, files)
        mock_walk.return_value = [
            ("C:/Photos", ["Vacation"], []),
            ("C:/Photos/Vacation", ["2023"], []),
            ("C:/Photos/Vacation/2023", [], ["beach.png"])
        ]
        
        mock_img = MagicMock()
        mock_img.mode = "RGBA"
        mock_img.getbands.return_value = ("R", "G", "B", "A")
        mock_img_open.return_value = mock_img
        
        # Run Recursive Scan
        ctx = self.node.load_image(
            directory="C:/Photos", 
            index_mode="fixed", 
            index=0, 
            recursive=True, 
            path_filter="*.png",
            path_exclude="",
            safety_path="C:/Output",
            unique_id="test3"
        )
        
        # Filename (index 4)
        self.assertEqual(ctx[4], "beach")
        
        # Relative Path (index 3)
        self.assertTrue("Vacation" in ctx[3] or "2023" in ctx[3])

if __name__ == '__main__':
    unittest.main()
