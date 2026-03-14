"""
Shima MultiSaver Preprocessor Module

This module provides lineart and depth estimation capabilities with automatic
model downloading from HuggingFace. It is self-contained and does not require
comfyui-nikosis-preprocessors to be installed (but will use it if available).

Lineart and Depth processing algorithms adapted from:
https://github.com/Nikosis/ComfyUI-Nikosis-Preprocessors

MIT License (Original Nikosis Code)
====================================
Copyright (c) 2025 Nikosis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

import os
import gc
import numpy as np
from pathlib import Path

# Optional dependencies with graceful degradation
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    import torch
    import torch.nn as nn
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

try:
    from huggingface_hub import hf_hub_download
    HAS_HF_HUB = True
except ImportError:
    HAS_HF_HUB = False

# Try to import folder_paths for ComfyUI model directory
try:
    import folder_paths
    HAS_FOLDER_PATHS = True
except ImportError:
    HAS_FOLDER_PATHS = False


# ============================================================================
# Model Configuration
# ============================================================================

LINEART_MODELS = [
    "sk_model_fine.safetensors",
    "sk_model_coarse.safetensors",
]

DEPTH_MODELS = [
    "depth_anything_v2_vits_fp16.safetensors",
    "depth_anything_v2_vits_fp32.safetensors",
    "depth_anything_v2_vitb_fp16.safetensors", 
    "depth_anything_v2_vitb_fp32.safetensors",
    "depth_anything_v2_vitl_fp16.safetensors",
    "depth_anything_v2_vitl_fp32.safetensors",
    "depth_anything_v2_metric_hypersim_vitl_fp32.safetensors",
    "depth_anything_v2_metric_vkitti_vitl_fp32.safetensors",
    "greyscale",  # Fallback option (no model needed)
]

DEFAULT_DEPTH_MODEL = "depth_anything_v2_vitl_fp32.safetensors"

# HuggingFace model registry
MODEL_REGISTRY = {
    "lineart": {
        "repo_id": "Nikos7766/lineart-models",
        "subfolder": "controlnet/preprocessors/lineart"
    },
    "depth": {
        "repo_id": "Nikos7766/DepthAnythingV2",
        "subfolder": "controlnet/preprocessors/depthanythingv2"
    },
}

# Normal estimation models
NORMAL_MODELS = [
    "bae",      # BAE Normal - uses comfyui_controlnet_aux
    "dsine",    # DSINE Normal - uses comfyui_controlnet_aux
    "sobel",    # Simple Sobel gradient (no model needed)
]

DEFAULT_NORMAL_MODEL = "bae"



# ============================================================================
# Model Download Utilities
# ============================================================================

def get_models_dir():
    """Get the models directory for storing downloaded models."""
    if HAS_FOLDER_PATHS:
        return Path(folder_paths.models_dir)
    else:
        # Fallback to current directory
        return Path(os.getcwd()) / "models"


def get_model_path(model_type: str, model_name: str) -> str:
    """
    Find or download a model file.
    
    Args:
        model_type: "lineart" or "depth"
        model_name: Filename of the model
    
    Returns:
        Absolute path to the model file
    """
    if model_type not in MODEL_REGISTRY:
        raise ValueError(f"Unknown model type: {model_type}")
    
    config = MODEL_REGISTRY[model_type]
    subfolder = Path(config["subfolder"])
    models_dir = get_models_dir() / subfolder
    local_path = models_dir / model_name
    
    # Check if already exists
    if local_path.exists():
        print(f"[Shima.MultiSaver] Found {model_name} at {local_path}")
        return str(local_path)
    
    # Try to download from HuggingFace
    if HAS_HF_HUB:
        print(f"[Shima.MultiSaver] Downloading {model_name} from HuggingFace...")
        try:
            models_dir.mkdir(parents=True, exist_ok=True)
            downloaded_path = hf_hub_download(
                repo_id=config["repo_id"],
                filename=model_name,
                local_dir=str(models_dir),
            )
            print(f"[Shima.MultiSaver] Downloaded to {downloaded_path}")
            return downloaded_path
        except Exception as e:
            print(f"[Shima.MultiSaver] Download failed: {e}")
            raise
    else:
        raise FileNotFoundError(
            f"Model {model_name} not found at {local_path} and huggingface_hub "
            f"is not installed for automatic download. Please run: pip install huggingface_hub"
        )


# ============================================================================
# Lineart Model Architecture (from Nikosis, MIT Licensed)
# ============================================================================

if HAS_TORCH:
    class ShimaResidualBlock(nn.Module):
        """Residual block with conv_block substructure."""
        def __init__(self, in_features):
            super().__init__()
            self.conv_block = nn.Sequential(
                nn.ReflectionPad2d(1),
                nn.Conv2d(in_features, in_features, 3),
                nn.InstanceNorm2d(in_features),
                nn.ReLU(inplace=True),
                nn.ReflectionPad2d(1),
                nn.Conv2d(in_features, in_features, 3),
                nn.InstanceNorm2d(in_features)
            )

        def forward(self, x):
            return x + self.conv_block(x)

    class ShimaLineartGenerator(nn.Module):
        """Generator model for line art sketch processing (Nikosis architecture)."""
        def __init__(self, input_nc=3, output_nc=1, n_residual_blocks=3, sigmoid=True):
            super().__init__()
            norm_layer = nn.InstanceNorm2d
            
            # Initial convolution
            model0 = [
                nn.ReflectionPad2d(3),
                nn.Conv2d(input_nc, 64, 7),
                norm_layer(64),
                nn.ReLU(inplace=True)
            ]
            self.model0 = nn.Sequential(*model0)
            
            # Downsampling
            model1 = []
            in_features = 64
            out_features = in_features * 2
            for _ in range(2):
                model1 += [
                    nn.Conv2d(in_features, out_features, 3, stride=2, padding=1),
                    norm_layer(out_features),
                    nn.ReLU(inplace=True)
                ]
                in_features = out_features
                out_features = in_features * 2
            self.model1 = nn.Sequential(*model1)
            
            # Residual blocks
            model2 = [ShimaResidualBlock(in_features) for _ in range(n_residual_blocks)]
            self.model2 = nn.Sequential(*model2)
            
            # Upsampling
            model3 = []
            out_features = in_features // 2
            for _ in range(2):
                model3 += [
                    nn.ConvTranspose2d(in_features, out_features, 3, stride=2, padding=1, output_padding=1),
                    norm_layer(out_features),
                    nn.ReLU(inplace=True)
                ]
                in_features = out_features
                out_features = in_features // 2
            self.model3 = nn.Sequential(*model3)
            
            # Output convolution
            model4 = [nn.ReflectionPad2d(3), nn.Conv2d(64, output_nc, 7)]
            if sigmoid:
                model4 += [nn.Sigmoid()]
            self.model4 = nn.Sequential(*model4)

        def forward(self, x):
            out = self.model0(x)
            out = self.model1(out)
            out = self.model2(out)
            out = self.model3(out)
            out = self.model4(out)
            return out


# ============================================================================
# Image Utilities
# ============================================================================

def img_to_hwc3(img):
    """Convert image to HWC format with 3 channels."""
    if img.dtype != np.uint8:
        img = (img * 255).clip(0, 255).astype(np.uint8)
    
    if img.ndim == 2:
        return np.repeat(img[:, :, None], 3, axis=2)
    
    if img.ndim != 3:
        raise ValueError(f"Unsupported image shape: {img.shape}")
    
    if img.shape[0] in [1, 3, 4]:  # Likely CHW format
        img = np.transpose(img, (1, 2, 0))
    
    height, width, channel = img.shape
    
    if channel == 3:
        return img
    if channel == 1:
        return np.repeat(img, 3, axis=2)
    if channel == 4:
        # RGBA to RGB using alpha blending
        color = img[:, :, 0:3].astype(np.float32)
        alpha = img[:, :, 3:4].astype(np.float32) / 255.0
        return (color * alpha + 255.0 * (1.0 - alpha)).clip(0, 255).astype(np.uint8)
    
    raise ValueError(f"Unsupported channel count: {channel}")


def resize_to_multiple(img, target_res, multiple=16):
    """Resize image to have dimensions as multiples of 'multiple'."""
    if not HAS_CV2:
        return img
    
    H, W = img.shape[:2]
    aspect_ratio = W / H
    
    if H < W:
        new_H = target_res
        new_W = int(new_H * aspect_ratio)
    else:
        new_W = target_res
        new_H = int(new_W / aspect_ratio)
    
    # Round to nearest multiple
    new_H = max(multiple, (new_H // multiple) * multiple)
    new_W = max(multiple, (new_W // multiple) * multiple)
    
    return cv2.resize(img, (new_W, new_H), interpolation=cv2.INTER_AREA)


# ============================================================================
# Lineart Processor
# ============================================================================

class ShimaLineartProcessor:
    """Self-contained lineart sketch processor with auto model download."""
    
    def __init__(self):
        self.model = None
        self.current_model_name = None
        self.device = None
        
        if HAS_TORCH:
            try:
                import comfy.model_management as mm
                self.device = mm.get_torch_device()
            except ImportError:
                self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    def _load_model(self, model_name: str):
        """Load lineart model, downloading if necessary."""
        if self.model is not None and self.current_model_name == model_name:
            # Model already loaded
            self.model.to(self.device)
            return
        
        # Get model path (downloads if needed)
        model_path = get_model_path("lineart", model_name)
        
        # Load the model
        print(f"[Shima.MultiSaver] Loading lineart model: {model_name}")
        self.model = ShimaLineartGenerator(3, 1, 3)
        
        # Load weights
        try:
            from comfy.utils import load_torch_file
            state_dict = load_torch_file(model_path)
        except ImportError:
            from safetensors.torch import load_file
            state_dict = load_file(model_path)
        
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()
        self.current_model_name = model_name
    
    def _cleanup(self):
        """Offload model from GPU to save VRAM."""
        if self.model is not None:
            self.model.to("cpu")
        gc.collect()
        if HAS_TORCH and torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    def process(
        self,
        image_np: np.ndarray,
        model_name: str = "sk_model_fine.safetensors",
        resolution: int = 1024,
        reverse: bool = False,
    ) -> np.ndarray:
        """
        Process image to lineart sketch.
        
        Args:
            image_np: Input image [H, W, C] in 0-1 float range
            model_name: Which lineart model to use
            resolution: Processing resolution
            reverse: If True, invert result (white lines on black)
        
        Returns:
            Lineart image [H, W, C] in 0-1 float range
        """
        orig_h, orig_w = image_np.shape[:2]
        
        if not HAS_TORCH:
            print("[Shima.MultiSaver] Warning: torch not available, using fallback lineart")
            return self._process_fallback(image_np, resolution, reverse)
        
        try:
            self._load_model(model_name)
            result = self._process_with_model(image_np, resolution)
        except Exception as e:
            print(f"[Shima.MultiSaver] Lineart model failed: {e}, using fallback")
            result = self._process_fallback(image_np, resolution, reverse=False)
        finally:
            self._cleanup()
        
        # Resize back to original dimensions
        if result.shape[:2] != (orig_h, orig_w) and HAS_CV2:
            result_uint8 = (result * 255).clip(0, 255).astype(np.uint8)
            result_uint8 = cv2.resize(result_uint8, (orig_w, orig_h), interpolation=cv2.INTER_AREA)
            result = result_uint8.astype(np.float32) / 255.0
        
        if reverse:
            result = 1.0 - result
        
        return result
    
    def _process_with_model(self, image_np: np.ndarray, resolution: int) -> np.ndarray:
        """Process using the loaded model."""
        # Convert to uint8 and resize
        image_uint8 = (image_np * 255).clip(0, 255).astype(np.uint8)
        image_uint8 = img_to_hwc3(image_uint8)
        image_resized = resize_to_multiple(image_uint8, resolution)
        
        # Convert to tensor [B, C, H, W]
        tensor = torch.from_numpy(image_resized).float().to(self.device) / 255.0
        tensor = tensor.permute(2, 0, 1).unsqueeze(0)  # HWC -> BCHW
        
        # Run model
        with torch.no_grad():
            output = self.model(tensor)
            line = output.squeeze(1)  # Remove channel dim
            line_np = (line.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        
        # Convert to HWC RGB (invert for black lines on white)
        if line_np.ndim == 3:
            line_np = line_np[0]  # Remove batch dim
        result = img_to_hwc3(line_np)
        result = 255 - result  # Invert: black lines on white
        
        return result.astype(np.float32) / 255.0
    
    def _process_fallback(self, image_np: np.ndarray, resolution: int, reverse: bool = False) -> np.ndarray:
        """Fallback edge detection when model not available."""
        if not HAS_CV2:
            gray = np.mean(image_np, axis=2) if image_np.ndim == 3 else image_np
            result = np.stack([gray, gray, gray], axis=-1)
            return 1.0 - result if not reverse else result
        
        image_uint8 = (image_np * 255).clip(0, 255).astype(np.uint8)
        image_resized = resize_to_multiple(image_uint8, resolution)
        
        if image_resized.ndim == 3:
            gray = cv2.cvtColor(image_resized, cv2.COLOR_RGB2GRAY)
        else:
            gray = image_resized
        
        # Difference of Gaussians for sketch-like effect
        blur1 = cv2.GaussianBlur(gray, (0, 0), 1.0)
        blur2 = cv2.GaussianBlur(gray, (0, 0), 2.0)
        dog = np.abs(blur1.astype(np.float32) - blur2.astype(np.float32))
        dog = (dog - dog.min()) / (dog.max() - dog.min() + 1e-6)
        
        edges = ((1.0 - dog) * 255).clip(0, 255).astype(np.uint8)
        result = np.stack([edges, edges, edges], axis=-1)
        
        return result.astype(np.float32) / 255.0


# ============================================================================
# Depth Processor
# ============================================================================

class ShimaDepthProcessor:
    """Self-contained depth processor using DepthAnythingV2 with HuggingFace auto-download.
    
    Uses the DINOv2 + DPT architecture from Meta/Nikosis with proper licensing.
    """
    
    # Model configurations
    MODEL_CONFIGS = {
        "vits": {'encoder': 'vits', 'features': 64, 'out_channels': [48, 96, 192, 384]},
        "vitb": {'encoder': 'vitb', 'features': 128, 'out_channels': [96, 192, 384, 768]},
        "vitl": {'encoder': 'vitl', 'features': 256, 'out_channels': [256, 512, 1024, 1024]},
    }
    
    def __init__(self):
        self.model = None
        self.current_model_name = None
        self.device = None
        self.depth_available = False
        
        if HAS_TORCH:
            try:
                import comfy.model_management as mm
                self.device = mm.get_torch_device()
            except ImportError:
                self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            
            # Check if our depth model is importable
            try:
                from .processors.depth_anything_v2 import DepthAnythingV2
                self.DepthAnythingV2 = DepthAnythingV2
                self.depth_available = True
                print("[Shima.MultiSaver] Local DepthAnythingV2 model loaded successfully")
            except ImportError as e:
                print(f"[Shima.MultiSaver] Could not load depth model: {e}")
                self.depth_available = False
    
    def _get_model_config(self, model_name: str) -> dict:
        """Parse model name to get configuration."""
        # Determine encoder type from model name
        if "vitl" in model_name:
            encoder = "vitl"
        elif "vitb" in model_name:
            encoder = "vitb"
        else:
            encoder = "vits"
        
        # Determine dtype from model name
        dtype = torch.float16 if "fp16" in model_name else torch.float32
        
        # Check if metric model
        is_metric = "metric" in model_name
        max_depth = 20.0 if "hypersim" in model_name else 80.0
        
        config = self.MODEL_CONFIGS[encoder].copy()
        config['is_metric'] = is_metric
        config['max_depth'] = max_depth
        config['dtype'] = dtype
        
        return config
    
    def _load_model(self, model_name: str):
        """Load depth model, downloading if necessary."""
        if self.model is not None and self.current_model_name == model_name:
            # Already loaded
            self.model.to(self.device)
            return
        
        # Get model path (downloads if needed)
        model_path = get_model_path("depth", model_name)
        config = self._get_model_config(model_name)
        
        print(f"[Shima.MultiSaver] Loading depth model: {model_name}")
        
        # Create model
        self.model = self.DepthAnythingV2(
            encoder=config['encoder'],
            features=config['features'],
            out_channels=config['out_channels'],
            is_metric=config['is_metric'],
            max_depth=config['max_depth']
        )
        
        # Load weights
        try:
            from comfy.utils import load_torch_file
            state_dict = load_torch_file(model_path)
        except ImportError:
            from safetensors.torch import load_file
            state_dict = load_file(model_path)
        
        # Load weights into the model
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        
        self.model.eval()
        self.current_model_name = model_name
    
    def _cleanup(self):
        """Offload model from GPU to save VRAM."""
        if self.model is not None:
            try:
                import comfy.model_management as mm
                offload_device = mm.unet_offload_device()
                self.model.to(offload_device)
            except ImportError:
                self.model.to("cpu")
        gc.collect()
        if HAS_TORCH and torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    def process(
        self,
        image_np: np.ndarray,
        model_name: str = "depth_anything_v2_vitl_fp32.safetensors",
        resolution: int = 1024,
    ) -> np.ndarray:
        """
        Process image to depth map.
        
        Args:
            image_np: Input image [H, W, C] in 0-1 float range
            model_name: Depth model name (or 'greyscale')
            resolution: Processing resolution
        
        Returns:
            Depth map [H, W, C] in 0-1 float range
        """
        orig_h, orig_w = image_np.shape[:2]
        
        if model_name == "greyscale":
            return self._process_greyscale(image_np)
        
        if self.depth_available and HAS_TORCH:
            try:
                self._load_model(model_name)
                result = self._process_with_model(image_np, model_name, resolution)
            except Exception as e:
                print(f"[Shima.MultiSaver] Depth model failed: {e}, using greyscale")
                result = self._process_greyscale(image_np)
            finally:
                self._cleanup()
        else:
            if not self.depth_available:
                print("[Shima.MultiSaver] Depth model not available, using greyscale fallback")
            result = self._process_greyscale(image_np)
        
        # Resize back to original dimensions
        if result.shape[:2] != (orig_h, orig_w) and HAS_CV2:
            result_uint8 = (result * 255).clip(0, 255).astype(np.uint8)
            result_uint8 = cv2.resize(result_uint8, (orig_w, orig_h), interpolation=cv2.INTER_AREA)
            result = result_uint8.astype(np.float32) / 255.0
        
        return result
    
    def _process_with_model(self, image_np: np.ndarray, model_name: str, resolution: int) -> np.ndarray:
        """Process using the loaded DepthAnythingV2 model."""
        import torch.nn.functional as F
        from torchvision import transforms
        from contextlib import nullcontext
        
        config = self._get_model_config(model_name)
        dtype = config['dtype']
        
        # Convert to tensor [B, H, W, C]
        image_tensor = torch.from_numpy(image_np).float()
        if image_tensor.ndim == 3:
            image_tensor = image_tensor.unsqueeze(0)
        
        B, H, W, C = image_tensor.shape
        orig_H, orig_W = H, W
        
        # Move to device and permute to [B, C, H, W]
        image_tensor = image_tensor.to(self.device).permute(0, 3, 1, 2)
        
        # Resize to resolution with padding to multiple of 14
        def resize_to_nearest_multiple(img, target_res, multiple=14):
            B, C, H, W = img.shape
            aspect_ratio = W / H
            target_res = max(multiple, (target_res // multiple) * multiple)
            
            if H < W:
                new_H = target_res
                new_W = int(new_H * aspect_ratio)
            else:
                new_W = target_res
                new_H = int(new_W / aspect_ratio)
            
            new_H = max(multiple, (new_H // multiple) * multiple)
            new_W = max(multiple, (new_W // multiple) * multiple)
            
            return F.interpolate(img, size=(new_H, new_W), mode="bilinear", align_corners=False)
        
        # Use higher resolution for better quality
        base_res = max(resolution, min(orig_H, orig_W))
        image_tensor = resize_to_nearest_multiple(image_tensor, base_res)
        
        # Normalize for DINOv2
        normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        normalized = normalize(image_tensor)
        
        # Run inference
        try:
            import comfy.model_management as mm
            autocast_condition = dtype != torch.float32 and not mm.is_device_mps(self.device)
        except ImportError:
            autocast_condition = dtype != torch.float32
        
        with torch.autocast(str(self.device).split(':')[0], dtype=dtype) if autocast_condition else nullcontext():
            with torch.no_grad():
                depth = self.model(normalized.to(self.device))
                depth = (depth - depth.min()) / (depth.max() - depth.min() + 1e-6)
        
        # Convert to numpy [H, W, C] format
        depth_np = depth.cpu().unsqueeze(-1).repeat(1, 1, 1, 3).numpy()
        if depth_np.ndim == 4:
            depth_np = depth_np[0]
        
        # Invert if metric model
        if config['is_metric']:
            depth_np = 1.0 - depth_np
        
        return depth_np.astype(np.float32).clip(0, 1)
    
    def _process_greyscale(self, image_np: np.ndarray) -> np.ndarray:
        """Convert to high-quality greyscale as depth fallback."""
        if image_np.ndim == 3 and image_np.shape[2] >= 3:
            # Standard luminance weights
            gray = (
                0.299 * image_np[:, :, 0] +
                0.587 * image_np[:, :, 1] +
                0.114 * image_np[:, :, 2]
            )
        elif image_np.ndim == 3:
            gray = image_np[:, :, 0]
        else:
            gray = image_np
        
        return np.stack([gray, gray, gray], axis=-1).astype(np.float32)


# ============================================================================
# Normal Processor
# ============================================================================

class ShimaNormalProcessor:
    """Normal estimation using BAE, DSINE, or Sobel.
    
    BAE and DSINE use comfyui_controlnet_aux if installed.
    Falls back to Sobel gradient if not available.
    """
    
    def __init__(self):
        self.bae_available = False
        self.dsine_available = False
        self.bae_detector = None
        self.dsine_detector = None
        self.device = None
        
        if HAS_TORCH:
            try:
                import comfy.model_management as mm
                self.device = mm.get_torch_device()
            except ImportError:
                self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            
            # Add comfyui_controlnet_aux/src to path if needed
            try:
                import folder_paths
                custom_nodes = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                controlnet_aux_path = os.path.join(custom_nodes, "comfyui_controlnet_aux")
                controlnet_aux_src = os.path.join(controlnet_aux_path, "src")
                
                # Add both the main path and src path
                if controlnet_aux_path not in sys.path and os.path.exists(controlnet_aux_path):
                    sys.path.insert(0, controlnet_aux_path)
                if controlnet_aux_src not in sys.path and os.path.exists(controlnet_aux_src):
                    sys.path.insert(0, controlnet_aux_src)
            except Exception:
                pass
            
            # Check for BAE
            try:
                from custom_controlnet_aux.normalbae import NormalBaeDetector
                self.bae_class = NormalBaeDetector
                self.bae_available = True
                print("[Shima.MultiSaver] BAE Normal detector available")
            except ImportError as e:
                print(f"[Shima.MultiSaver] BAE Normal not available: {e}")
            
            # Check for DSINE
            try:
                from custom_controlnet_aux.dsine import DsineDetector
                self.dsine_class = DsineDetector
                self.dsine_available = True
                print("[Shima.MultiSaver] DSINE Normal detector available")
            except ImportError as e:
                print(f"[Shima.MultiSaver] DSINE Normal not available: {e}")
    
    def _cleanup(self):
        """Offload models from GPU."""
        self.bae_detector = None
        self.dsine_detector = None
        gc.collect()
        if HAS_TORCH and torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    def process(
        self,
        image_np: np.ndarray,
        model_name: str = "bae",
        resolution: int = 512,
        strength: float = 1.0,
        dsine_fov: float = 60.0,
        dsine_iterations: int = 5,
    ) -> np.ndarray:
        """
        Process image to normal map.
        
        Args:
            image_np: Input image [H, W, C] in 0-1 float range
            model_name: "bae", "dsine", or "sobel"
            resolution: Processing resolution
            strength: Normal strength multiplier
            dsine_fov: Field of view for DSINE
            dsine_iterations: Iterations for DSINE
        
        Returns:
            Normal map [H, W, C] in 0-1 float range
        """
        orig_h, orig_w = image_np.shape[:2]
        
        if model_name == "sobel":
            return self._process_sobel(image_np, strength)
        
        if model_name == "bae" and self.bae_available:
            try:
                result = self._process_bae(image_np, resolution)
            except Exception as e:
                print(f"[Shima.MultiSaver] BAE failed: {e}, using Sobel fallback")
                result = self._process_sobel(image_np, strength)
            finally:
                self._cleanup()
        elif model_name == "dsine" and self.dsine_available:
            try:
                result = self._process_dsine(image_np, resolution, dsine_fov, dsine_iterations)
            except Exception as e:
                print(f"[Shima.MultiSaver] DSINE failed: {e}, using Sobel fallback")
                result = self._process_sobel(image_np, strength)
            finally:
                self._cleanup()
        else:
            # Fallback to Sobel
            if model_name != "sobel":
                print(f"[Shima.MultiSaver] {model_name} not available, using Sobel fallback")
            result = self._process_sobel(image_np, strength)
        
        return result
    
    def _process_bae(self, image_np: np.ndarray, resolution: int) -> np.ndarray:
        """Process using BAE Normal detector."""
        # Convert to tensor
        image_tensor = torch.from_numpy(image_np).float()
        if image_tensor.ndim == 3:
            image_tensor = image_tensor.unsqueeze(0)
        
        # Load model
        model = self.bae_class.from_pretrained().to(self.device)
        
        # Process using utils from comfyui_controlnet_aux
        try:
            from utils import common_annotator_call
        except ImportError:
            # Fallback to src path
            from custom_controlnet_aux.util import resize_image_with_pad
            # Direct call without common_annotator_call
            from PIL import Image
            pil_img = Image.fromarray((image_np * 255).astype(np.uint8))
            normal_pil = model(pil_img, output_type="pil")
            result = np.array(normal_pil).astype(np.float32) / 255.0
            del model
            return result
        
        result = common_annotator_call(model, image_tensor, resolution=resolution)
        del model
        
        # Convert back to numpy
        if result.ndim == 4:
            result = result[0].cpu().numpy()
        else:
            result = result.cpu().numpy()
        
        return result.astype(np.float32)
    
    def _process_dsine(self, image_np: np.ndarray, resolution: int, fov: float, iterations: int) -> np.ndarray:
        """Process using DSINE Normal detector."""
        # Convert to tensor
        image_tensor = torch.from_numpy(image_np).float()
        if image_tensor.ndim == 3:
            image_tensor = image_tensor.unsqueeze(0)
        
        # Load model
        model = self.dsine_class.from_pretrained().to(self.device)
        
        # Process using utils from comfyui_controlnet_aux
        try:
            from utils import common_annotator_call
        except ImportError:
            # Fallback - call detector directly
            from PIL import Image
            pil_img = Image.fromarray((image_np * 255).astype(np.uint8))
            normal_pil = model(pil_img, fov=fov, iterations=iterations, output_type="pil")
            result = np.array(normal_pil).astype(np.float32) / 255.0
            del model
            return result
        
        result = common_annotator_call(model, image_tensor, fov=fov, iterations=iterations, resolution=resolution)
        del model
        
        # Convert back to numpy
        if result.ndim == 4:
            result = result[0].cpu().numpy()
        else:
            result = result.cpu().numpy()
        
        return result.astype(np.float32)
    
    def _process_sobel(self, image_np: np.ndarray, strength: float = 1.0) -> np.ndarray:
        """Simple Sobel-based normal estimation."""
        # Convert to grayscale for gradient calculation
        if image_np.ndim == 3 and image_np.shape[2] >= 3:
            gray = (
                0.299 * image_np[:, :, 0] +
                0.587 * image_np[:, :, 1] +
                0.114 * image_np[:, :, 2]
            )
        else:
            gray = image_np[:, :, 0] if image_np.ndim == 3 else image_np
        
        if HAS_CV2:
            # Use OpenCV Sobel for better quality
            sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
            sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        else:
            # Fallback to numpy gradient
            sobel_y, sobel_x = np.gradient(gray)
        
        # Apply strength
        sobel_x = sobel_x * strength
        sobel_y = sobel_y * strength
        
        # Create normal map (X, Y, Z)
        # Z = 1.0 (pointing towards camera)
        normal_z = np.ones_like(gray)
        
        # Normalize
        magnitude = np.sqrt(sobel_x**2 + sobel_y**2 + normal_z**2)
        normal_x = sobel_x / (magnitude + 1e-6)
        normal_y = sobel_y / (magnitude + 1e-6)
        normal_z = normal_z / (magnitude + 1e-6)
        
        # Convert from [-1, 1] to [0, 1] range (standard normal map encoding)
        # R = X, G = Y, B = Z
        normal_map = np.stack([
            (normal_x + 1) / 2,  # R
            (normal_y + 1) / 2,  # G (may need to flip for ComfyUI convention)
            (normal_z + 1) / 2,  # B
        ], axis=-1).astype(np.float32)
        
        return normal_map.clip(0, 1)


# ============================================================================
# Module-level singletons
# ============================================================================

_lineart_processor = None
_depth_processor = None
_normal_processor = None


def get_lineart_processor() -> ShimaLineartProcessor:
    """Get or create the singleton lineart processor."""
    global _lineart_processor
    if _lineart_processor is None:
        _lineart_processor = ShimaLineartProcessor()
    return _lineart_processor


def get_depth_processor() -> ShimaDepthProcessor:
    """Get or create the singleton depth processor."""
    global _depth_processor
    if _depth_processor is None:
        _depth_processor = ShimaDepthProcessor()
    return _depth_processor


def get_normal_processor() -> ShimaNormalProcessor:
    """Get or create the singleton normal processor."""
    global _normal_processor
    if _normal_processor is None:
        _normal_processor = ShimaNormalProcessor()
    return _normal_processor


# Track capability status for external use
HAS_NIKOSIS_LINEART = False  # We have our own implementation now
HAS_NIKOSIS_DEPTH = False  # We have our own implementation now

