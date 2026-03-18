import torch
import torch.nn.functional as F
import numpy as np
import comfy.utils
from nodes import MAX_RESOLUTION

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

# Fallback internal processors for high quality depth and lineart
from .nikosis_compat import get_depth_processor, get_lineart_processor

class ShimaControlAgent:
    """
    Shima ControlNet Agent
    Auto-resizes the input image to match the latent dimensions provided by CommonParams.
    Outputs a packed `shima.controlbus` instruction bundle for the MasterPrompt.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "control_type": (["canny", "depth", "pose", "lineart", "scribble", "color"], {"default": "canny"}),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.05}),
                "fit_method": (["crop to fit", "pad to fit", "stretch"], {"default": "crop to fit"}),
                "bypass_preprocessing": ("BOOLEAN", {"default": False, "tooltip": "Check this box if your image is already properly formatted for your chosen controlnet."}),
            },
            "optional": {
                "shima.commonparams": ("DICT", {"forceInput": True, "tooltip": "Provides the target latent resolution for auto-sizing."}),
                "modelcitizen.bndl": ("BNDL", {"forceInput": True, "tooltip": "Fallback bundle to parse commonparams if direct commonparams are unavailable."}),
                "shima.controlbus": ("LIST", {"forceInput": True, "tooltip": "Daisy-chain previous ControlAgents here."}),
                
                "use_commonparams": ("BOOLEAN", {"default": True, "tooltip": "If True, use target resolutions from Shima.Commons or ModelCitizen."}),
                "allow_external_linking": ("BOOLEAN", {"default": False, "tooltip": "Allow connections outside the Island"}),
                "panelinputs.bndl": ("BNDL", {"forceInput": True, "tooltip": "Overrides panel settings using an external PanelBNDLer node"}),
            }
        }

    RETURN_TYPES = ("LIST", "IMAGE")
    RETURN_NAMES = ("shima.controlbus", "processed_image")
    FUNCTION = "apply_control"
    CATEGORY = "Shima/ControlNet"

    def apply_control(self, image, control_type, strength, fit_method, bypass_preprocessing=False, use_commonparams=True, **kwargs):
        # 0. Intercept PanelInputs overrides
        panelinputs = kwargs.get("panelinputs.bndl")
        if panelinputs:
            control_type = panelinputs.get("control_type", control_type)
            strength = panelinputs.get("strength", strength)
            fit_method = panelinputs.get("fit_method", fit_method)
            bypass_preprocessing = panelinputs.get("bypass_preprocessing", bypass_preprocessing)

        # 1. Resolve Target Dimensions
        target_w, target_h = 1024, 1024 # Safest fallback
        
        # Look for explicit commonparams first (if not disabled by switch)
        common_params = {}
        if use_commonparams:
            common_params = kwargs.get("shima.commonparams", {})
            
            if not common_params:
                 mc_bndl = kwargs.get("modelcitizen.bndl", {})
                 if mc_bndl and mc_bndl.get("bndl_type") == "modelcitizen":
                     common_params = mc_bndl.get("shima.commonparams", {})
        
        if common_params:
            target_w = common_params.get("width", target_w)
            target_h = common_params.get("height", target_h)
            
        print(f"[ShimaControlAgent] Target Latent Resolution resolved to: {target_w}x{target_h}")

        # 2. Extract dimensions from the BCHW image tensor (ComfyUI uses BHWC by default)
        # ComfyUI image format is [Batch, Height, Width, Channels]
        img_h, img_w = image.shape[1], image.shape[2]
        
        processed_image = image
        
        # 3. Handle Auto-Resizing if the dimensions don't match
        if img_w != target_w or img_h != target_h:
            # We must convert to BCHW for PyTorch interpolate
            # Permute: [B, H, W, C] -> [B, C, H, W]
            tensor_bchw = image.permute(0, 3, 1, 2)
            
            if fit_method == "stretch":
                tensor_bchw = F.interpolate(tensor_bchw, size=(target_h, target_w), mode="bilinear", align_corners=False)
            
            elif fit_method == "crop to fit":
                # Determine aspect ratios
                target_ar = target_w / target_h
                img_ar = img_w / img_h
                
                if img_ar > target_ar:
                    # Image is wider than target. Crop width.
                    new_w = int(img_h * target_ar)
                    offset = (img_w - new_w) // 2
                    tensor_bchw = tensor_bchw[:, :, :, offset:offset+new_w]
                else:
                    # Image is taller than target. Crop height.
                    new_h = int(img_w / target_ar)
                    offset = (img_h - new_h) // 2
                    tensor_bchw = tensor_bchw[:, :, offset:offset+new_h, :]
                    
                # Resize cropped square to target
                tensor_bchw = F.interpolate(tensor_bchw, size=(target_h, target_w), mode="bilinear", align_corners=False)
                
            elif fit_method == "pad to fit":
                target_ar = target_w / target_h
                img_ar = img_w / img_h
                
                if img_ar > target_ar:
                    # Image is wider. Pad top/bottom.
                    new_h = int(img_w / target_ar)
                    pad_total = new_h - img_h
                    pad_top = pad_total // 2
                    pad_bottom = pad_total - pad_top
                    tensor_bchw = F.pad(tensor_bchw, (0, 0, pad_top, pad_bottom), mode="constant", value=0)
                else:
                    # Image is taller. Pad left/right.
                    new_w = int(img_h * target_ar)
                    pad_total = new_w - img_w
                    pad_left = pad_total // 2
                    pad_right = pad_total - pad_left
                    tensor_bchw = F.pad(tensor_bchw, (pad_left, pad_right, 0, 0), mode="constant", value=0)
                    
                # Downsize/Upsize the padded image to the exact target size
                tensor_bchw = F.interpolate(tensor_bchw, size=(target_h, target_w), mode="bilinear", align_corners=False)

            # Convert back to BHWC
            processed_image = tensor_bchw.permute(0, 2, 3, 1)
            print(f"[ShimaControlAgent] Resized/Cropped image from {img_w}x{img_h} to {target_w}x{target_h} using {fit_method}")

        # ----------------------------------------------------
        # PREPROCESSOR ROUTING LOGIC
        # ----------------------------------------------------
        # We apply the selected preprocessor to the correctly-sized `processed_image` tensor.
        # Tensor is in [B, H, W, C] with values 0.0-1.0.

        c_type = control_type.lower()
        processed_np = None

        if bypass_preprocessing:
            # Bypass processing entirely, assume user provided a formatted map
            pass
            
        elif c_type == "color":
            # Extremely fast pixelation for color mood boards
            tensor_bchw = processed_image.permute(0, 3, 1, 2)
            # Downscale 64x
            small = F.interpolate(tensor_bchw, size=(target_h//64, target_w//64), mode="area")
            # Upscale back to target using nearest neighbor for sharp distinct blocks
            processed_image = F.interpolate(small, size=(target_h, target_w), mode="nearest").permute(0, 2, 3, 1)
            
        elif c_type == "depth":
            # Use Nikosis depth model (downloads automatically if missing)
            img_np = processed_image[0].cpu().numpy()
            processor = get_depth_processor()
            result_np = processor.process(img_np, resolution=min(target_w, target_h))
            processed_image = torch.from_numpy(result_np).unsqueeze(0)
            
        elif c_type == "lineart":
            # Use Nikosis lineart model (downloads automatically if missing)
            img_np = processed_image[0].cpu().numpy()
            processor = get_lineart_processor()
            result_np = processor.process(img_np)
            processed_image = torch.from_numpy(result_np).unsqueeze(0)
            
        elif c_type in ["canny", "scribble"]:
            if HAS_CV2:
                # Convert 0.0-1.0 tensor to 0-255 uint8 numpy [H, W, C]
                img_np = (processed_image[0].cpu().numpy() * 255).astype(np.uint8)
                
                if c_type == "canny":
                    # Classic Canny Edge Detection
                    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
                    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
                    # Dynamic thresholding based on median
                    v = np.median(blurred)
                    lower = int(max(0, (1.0 - 0.33) * v))
                    upper = int(min(255, (1.0 + 0.33) * v))
                    edges = cv2.Canny(blurred, lower, upper)
                    # Convert back to RGB format 0.0-1.0 tensor
                    processed_np = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB).astype(np.float32) / 255.0
                    
                elif c_type == "scribble":
                    # Adaptive Thresholding creates a sketch/scribble look
                    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
                    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
                    edges = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
                    processed_np = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB).astype(np.float32) / 255.0

                if processed_np is not None:
                    processed_image = torch.from_numpy(processed_np).unsqueeze(0)
            else:
                print("[ShimaControlAgent] WARNING: OpenCV (cv2) is not installed. Canny/Scribble fallbacks are disabled. Passing raw image.")
        
        elif c_type == "pose":
            print("[ShimaControlAgent] WARNING: Native Pose detection requires an external node. Passing raw image to allow standard ControlNet to fail gracefully or use a pre-rendered map.")
        
        # 4. Create the Instruction Dict
        instruction = {
            "control_type": c_type,
            "strength": strength,
            "image": processed_image,
        }
        
        # 5. Append to the Daisy-Chain Bus
        bus = kwargs.get("shima.controlbus", [])
        
        # Copy the list to prevent mutating earlier steps
        new_bus = list(bus)
        new_bus.append(instruction)

        return (new_bus, processed_image)

class ShimaPanelControlAgent(ShimaControlAgent):
    """
    Panelized variant of ShimaControlAgent.
    Frontend Javascript hides all native widgets and renders a sleek PCB chassis + double-click HTML modal.
    """
    FUNCTION = "apply_control"
    CATEGORY = "Shima/Panels"

NODE_CLASS_MAPPINGS = {
    "Shima.ControlAgent": ShimaControlAgent,
    "Shima.PanelControlAgent": ShimaPanelControlAgent,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.ControlAgent": "Shima ControlNet Agent",
    "Shima.PanelControlAgent": "Shima Panel Control Agent",
}
