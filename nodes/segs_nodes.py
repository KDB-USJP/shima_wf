import os
import torch
import json
import folder_paths
import numpy as np
from PIL import Image

class ShimaSEGSelector:
    """
    Shima SEGSelector
    Takes an IMAGE and SEGS (from Impact Pack, etc) and outputs filtered SEGS.
    Sends all segregation data and a preview image to the frontend UI for interactive picking.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "segs": ("SEGS",),
                "image": ("IMAGE",),
                # Hidden string widget to hold the commaseparated list of chosen segment indices.
                # If "all" or empty, depends on fallback_behavior
                "selected_indices": ("STRING", {"default": "all", "multiline": False}),
            },
            "optional": {
                "fallback_behavior": (["Output All", "Output None"], {"default": "Output All"}),
            }
        }

    RETURN_TYPES = ("SEGS",)
    RETURN_NAMES = ("filtered_segs",)
    FUNCTION = "filter_segs"
    CATEGORY = "Shima/SEGs"
    OUTPUT_NODE = True 

    def filter_segs(self, segs, image, selected_indices, fallback_behavior="Output All"):
        # 1. Parse SEGS tuple
        if not segs or len(segs) != 2:
            return (segs,)
        
        shape = segs[0]
        seg_list = segs[1]
        
        # 2. Parse selected indices
        active_indices = set()
        is_all = selected_indices.strip().lower() == "all"
        
        if not is_all and selected_indices.strip():
            # Parse comma separated integers (e.g. "0, 2, 4")
            try:
                parts = selected_indices.replace(" ", "").split(",")
                active_indices = {int(p) for p in parts if p.isdigit()}
            except ValueError:
                pass
                
        # 3. Filter SEGS
        filtered_seg_list = []
        if is_all:
            # First run, or user reset to "all"
            if fallback_behavior == "Output All":
                filtered_seg_list = seg_list
                active_indices = set(range(len(seg_list)))
            else:
                filtered_seg_list = []
                active_indices = set()
        else:
            for i, seg in enumerate(seg_list):
                if i in active_indices:
                    filtered_seg_list.append(seg)
                    
        # Construct output SEGS tuple exactly matching Impact Pack specs
        out_segs = (shape, filtered_seg_list)
        
        # 4. Prepare UI Update (Preview Image + Seg boxes)
        # We need to save the first image in the batch to temp so the UI can load it.
        # Format is B, H, W, C
        img_tensor = image[0]
        i = 255. * img_tensor.cpu().numpy()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        
        import random
        import string
        prefix = ''.join(random.choice(string.ascii_lowercase) for _ in range(8))
        filename = f"shima_seg_preview_{prefix}.png"
        
        temp_dir = folder_paths.get_temp_directory()
        img.save(os.path.join(temp_dir, filename))
        
        # Extract SEG metadata for UI (boxes: x1, y1, x2, y2)
        ui_segs = []
        for i, seg in enumerate(seg_list):
            # seg is namedtuple: ['cropped_image', 'cropped_mask', 'confidence', 'crop_region', 'bbox', 'label', 'control_net_wrapper']
            bbox = getattr(seg, 'bbox', [0,0,0,0])
            label = getattr(seg, 'label', f"SEG {i}")
            if not label: label = f"SEG {i}"
            conf = getattr(seg, 'confidence', 1.0)
            
            ui_segs.append({
                "id": i,
                "bbox": [int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])],
                "label": label,
                "confidence": float(conf),
                "selected": i in active_indices or (is_all and fallback_behavior == "Output All")
            })

        # Return format matching custom frontend spec without triggering ComfyUI's native image interceptor
        payload = json.dumps({
            "filename": filename,
            "segs": ui_segs
        })

        return {
            "ui": {
                "seg_data": [payload]
            },
            "result": (out_segs,)
        }

class ShimaSEGPromptTarget:
    """
    Shima SEGPromptTarget
    Converts a SEGS object into a Conditioning target using the standard Apply ControlNet/Conditioning
    (With Mask) paradigms. It effectively merges the selected SEGS masks, applies optional feathering, 
    and applies it to a regional conditioning.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "conditioning": ("CONDITIONING",),
                "segs": ("SEGS",),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.01}),
                "set_cond_area": (["default", "mask bounds"],),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "MASK")
    RETURN_NAMES = ("conditioning", "combined_mask")
    FUNCTION = "apply_target"
    CATEGORY = "Shima/SEGs"

    def apply_target(self, conditioning, segs, strength, set_cond_area):
        # Prevent errors on empty SEGS by returning unmodified conditioning and an empty generic mask
        if not segs[1]:
            empty_mask = torch.zeros((1, 64, 64), dtype=torch.float32, device="cpu")
            return (conditioning, empty_mask)

        import sys
        
        # Dynamically grab the mask compilation tool from Impact Pack
        from impact.core import segs_to_combined_mask
        from impact.utils import make_3d_mask
        
        # This converts the array of multiple SEG objects into a single contiguous mask layer
        # It handles all the bbox placement logic inside the full image bounds automatically.
        combined_mask = segs_to_combined_mask(segs)
        combined_mask = make_3d_mask(combined_mask)

        # Apply Conditioning (With Mask) natively via ComfyUI core logic
        from nodes import ConditioningSetMask
        
        cond_set_mask = ConditioningSetMask()
        new_cond, = cond_set_mask.append(conditioning, combined_mask, set_cond_area, strength)
        
        return (new_cond, combined_mask)

class ShimaSEGMath:
    """
    Shima SEGMath
    Allows boolean operations (Add, Subtract, Intersect) between two SEGS inputs.
    It works purely at the high-level SEG object level by manipulating the inner array list.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "segs_a": ("SEGS",),
                "segs_b": ("SEGS",),
                "operation": (["Subtract (A - B)", "Add (A + B)", "Intersect (A AND B)"],)
            }
        }
    
    RETURN_TYPES = ("SEGS",)
    RETURN_NAMES = ("segs",)
    FUNCTION = "do_math"
    CATEGORY = "Shima/SEGs"

    def do_math(self, segs_a, segs_b, operation):
        if not segs_a[1]:
            return (segs_b if operation == "Add (A + B)" else (segs_a[0], []),)
        if not segs_b[1]:
            return (segs_a if operation == "Add (A + B)" else (segs_a[0], []),)

        # All math must occur assuming they share the same base original shape
        shape = segs_a[0]
        
        # Extract the impact pack SEG objects
        list_a = segs_a[1]
        list_b = segs_b[1]
        
        def compute_iou(mask1, mask2):
            import impact.utils as utils
            inter_mask = utils.bitwise_and_masks(mask1, mask2)
            union_mask = utils.add_masks(mask1, mask2)
            inter_area = (inter_mask > 0).sum()
            union_area = (union_mask > 0).sum()
            return inter_area / union_area if union_area > 0 else 0

        # We need a robust way to decide if two SEG bounding boxes "overlap" enough to trigger boolean math.
        # Impact pack utilizes SEGSIntersectionFilter which checks for IoA > 0.5.
        
        import impact.core as core
        
        if operation == "Subtract (A - B)":
            # Remove any segment in A that heavily overlaps with any segment in B
            keep = []
            for a_seg in list_a:
                keep_segment = True
                mask_a = core.segs_to_combined_mask((shape, [a_seg]))
                for b_seg in list_b:
                    mask_b = core.segs_to_combined_mask((shape, [b_seg]))
                    
                    inter_mask = core.utils.bitwise_and_masks(mask_a, mask_b)
                    inter_area = (inter_mask > 0).sum()
                    area_a = (mask_a > 0).sum()
                    ioa = inter_area / area_a if area_a > 0 else 0
                    
                    if ioa > 0.3: # Threshold 30% overlap constitutes a hit
                        keep_segment = False
                        break
                if keep_segment:
                    keep.append(a_seg)
            return ((shape, keep),)
            
        elif operation == "Intersect (A AND B)":
            # Keep ONLY segments in A that heavily overlap with ANY segment in B
            keep = []
            for a_seg in list_a:
                keep_segment = False
                mask_a = core.segs_to_combined_mask((shape, [a_seg]))
                for b_seg in list_b:
                    mask_b = core.segs_to_combined_mask((shape, [b_seg]))
                    
                    inter_mask = core.utils.bitwise_and_masks(mask_a, mask_b)
                    inter_area = (inter_mask > 0).sum()
                    area_a = (mask_a > 0).sum()
                    ioa = inter_area / area_a if area_a > 0 else 0
                    
                    if ioa > 0.3: 
                        keep_segment = True
                        break
                if keep_segment:
                    keep.append(a_seg)
            return ((shape, keep),)

        elif operation == "Add (A + B)":
            # Just combine them. Impact Pack handles array stacks.
            combined = list(list_a)
            combined.extend(list_b)
            return ((shape, combined),)
            
class ShimaAutoYoloSEG:
    """
    Shima AutoYoloSEG
    A unified node that combines the Model Provider and the Detector node into one.
    It automatically routes the loaded model into the correct Ultralytics detector engine
    (BBOX or SEGM) based on the model's string prefix or filename.
    """
    @classmethod
    def INPUT_TYPES(cls):
        import folder_paths
        
        # Manually ensure the ultralytics folders are registered just in case Impact Pack hasn't run yet
        import os
        if "ultralytics_bbox" not in folder_paths.folder_names_and_paths:
            path = os.path.join(folder_paths.models_dir, "ultralytics", "bbox")
            if os.path.exists(path):
                folder_paths.add_folder_path_and_extensions("ultralytics_bbox", [path], folder_paths.supported_pt_extensions)
        if "ultralytics_segm" not in folder_paths.folder_names_and_paths:
            path = os.path.join(folder_paths.models_dir, "ultralytics", "segm")
            if os.path.exists(path):
                folder_paths.add_folder_path_and_extensions("ultralytics_segm", [path], folder_paths.supported_pt_extensions)

        bbox_models = ["bbox/" + x for x in folder_paths.get_filename_list("ultralytics_bbox")]
        segm_models = ["segm/" + x for x in folder_paths.get_filename_list("ultralytics_segm")]
        all_models = bbox_models + segm_models
        if not all_models:
            all_models = ["No models found in models/ultralytics/bbox or segm"]

        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        files = folder_paths.filter_files_content_types(files, ["image"])

        return {
            "required": {
                "image_path": (sorted(files), {"image_upload": True}),
                "model_name": (all_models,),
                "threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "dilation": ("INT", {"default": 10, "min": -512, "max": 512, "step": 1}),
                "crop_factor": ("FLOAT", {"default": 3.0, "min": 1.0, "max": 100, "step": 0.1}),
                "drop_size": ("INT", {"min": 1, "max": 8192, "step": 1, "default": 10}),
            },
            "optional": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE", "SEGS",)
    RETURN_NAMES = ("image", "segs",)
    FUNCTION = "detect"
    CATEGORY = "Shima/SEGs"

    @classmethod
    def IS_CHANGED(s, image_path, model_name, threshold, dilation, crop_factor, drop_size, image=None):
        import hashlib
        import folder_paths
        if image is None:
            image_full_path = folder_paths.get_annotated_filepath(image_path)
            m = hashlib.sha256()
            with open(image_full_path, 'rb') as f:
                m.update(f.read())
            return m.digest().hex()
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(s, image_path, model_name, threshold, dilation, crop_factor, drop_size, image=None):
        import folder_paths
        if image is None:
            if not folder_paths.exists_annotated_filepath(image_path):
                return "Invalid image file: {}".format(image_path)
        return True

    def detect(self, image_path, model_name, threshold, dilation, crop_factor, drop_size, image=None):
        import folder_paths
        import torch
        import numpy as np
        from PIL import Image, ImageOps, ImageSequence
        import node_helpers
        
        # --- 0. Image Resolution ---
        if image is None:
            # Load the image from the uploaded file
            full_image_path = folder_paths.get_annotated_filepath(image_path)
            img = node_helpers.pillow(Image.open, full_image_path)

            output_images = []
            w, h = None, None

            for i in ImageSequence.Iterator(img):
                i = node_helpers.pillow(ImageOps.exif_transpose, i)

                if i.mode == 'I':
                    i = i.point(lambda i: i * (1 / 255))
                img_rgb = i.convert("RGB")

                if len(output_images) == 0:
                    w = img_rgb.size[0]
                    h = img_rgb.size[1]

                if img_rgb.size[0] != w or img_rgb.size[1] != h:
                    continue

                img_np = np.array(img_rgb).astype(np.float32) / 255.0
                img_tensor = torch.from_numpy(img_np)[None,]
                output_images.append(img_tensor)

                if img.format == "MPO":
                    break

            if len(output_images) > 1:
                image = torch.cat(output_images, dim=0)
            else:
                image = output_images[0]
        if len(image) > 1:
            raise Exception('[Shima AutoYoloSEG] ERROR: Batch images are not currently supported by Impact Pack detection natively in this node.')

        if "No models found" in model_name:
            raise Exception('[Shima AutoYoloSEG] ERROR: No Ultralytics models were found in your ComfyUI/models/ultralytics/bbox or segm folders.')
        
        # Impact Pack hides its ultralytics detector in "comfyui-impact-subpack"
        import sys
        import os
        subpack_path = os.path.join(folder_paths.base_path, "custom_nodes", "comfyui-impact-subpack")
        if subpack_path not in sys.path:
            sys.path.append(subpack_path)
            
        import modules.subcore as subcore

        # 1. Resolve path
        model_path = folder_paths.get_full_path("ultralytics", model_name)
        if model_path is None:
            if model_name.startswith('bbox/'):
                model_path = folder_paths.get_full_path("ultralytics_bbox", model_name[5:])
            elif model_name.startswith('segm/'):
                model_path = folder_paths.get_full_path("ultralytics_segm", model_name[5:])

        if model_path is None or not os.path.exists(model_path):
            raise ValueError(f"[Shima AutoYoloSEG] Model file '{model_name}' could not be found.")

        # 2. Load the base YOLO model
        model = subcore.load_yolo(model_path)

        # 3. Wrap it in the correct Impact Pack Detector interface
        is_bbox = model_name.startswith("bbox/") or "-seg" not in model_name
        
        if is_bbox:
            detector = subcore.UltraBBoxDetector(model)
        else:
            detector = subcore.UltraSegmDetector(model)

        # 4. Trigger detection
        segs = detector.detect(image, threshold, dilation, crop_factor, drop_size, detailer_hook=None)
        
        return (image, segs)

class ShimaSEGSampler:
    """
    Shima SEGSampler
    A high-level "Mega Node" wrapper that abstracts away the complexity of the Impact Pack
    DetailerForEach loop. It accepts string prompts directly (encoding them internally with CLIP),
    and executes a full localization inpainting pass natively.
    """
    @classmethod
    def INPUT_TYPES(cls):
        import comfy.samplers
        import impact.core as core
        return {
            "required": {
                "image": ("IMAGE",),
                "segs": ("SEGS",),
                "positive_add": ("STRING", {"multiline": True, "default": "detailed features"}),
                "negative_add": ("STRING", {"multiline": True, "default": "blurry, generic"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS,),
                "scheduler": (core.get_schedulers(),),
                "denoise": ("FLOAT", {"default": 0.5, "min": 0.0001, "max": 1.0, "step": 0.01}),
            },
            "optional": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "modelcitizen.bndl": ("BNDL", {"forceInput": True, "tooltip": "Bundle containing Model, CLIP, and VAE"}),
                "shima.samplercommons": ("DICT", {"forceInput": True, "tooltip": "Sampler settings bundle from Shima.SamplerCommons"}),
                "inpaint_model": ("MODEL",),
                "guide_size": ("FLOAT", {"default": 512, "min": 64, "max": 8192, "step": 8}),
                "guide_size_for": ("BOOLEAN", {"default": True, "label_on": "bbox", "label_off": "crop_region"}),
                "max_size": ("FLOAT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "feather": ("INT", {"default": 5, "min": 0, "max": 100, "step": 1}),
                "upscale": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "upscale_by": ("FLOAT", {"default": 1.0, "min": 1.0, "max": 8.0, "step": 0.05}),
                "upscale_method": (["bicubic", "nearest-exact", "bilinear", "area", "lanczos"],),
                "upscale_denoise": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "upscale_steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "upscale_cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "sample"
    CATEGORY = "Shima/SEGs"

    def sample(self, image, segs, positive_add, negative_add, seed, steps, cfg, sampler_name, scheduler, denoise, model=None, clip=None, vae=None, inpaint_model=None, guide_size=512, guide_size_for=True, max_size=1024, feather=5, upscale=False, upscale_by=1.0, upscale_method="bicubic", upscale_denoise=0.0, upscale_steps=20, upscale_cfg=8.0, **kwargs):
        if len(image) > 1:
            raise Exception('[Shima SEGSampler] ERROR: Batch images are not dynamically supported in this wrapper.')

        modelcitizen = kwargs.get("modelcitizen.bndl")
        sampler_commons = kwargs.get("shima.samplercommons")

        # Extract dependencies from ModelCitizen if provided
        if modelcitizen is not None:
            model = model if model is not None else modelcitizen.get("model")
            clip = clip if clip is not None else modelcitizen.get("clip")
            vae = vae if vae is not None else modelcitizen.get("vae")

        if model is None or clip is None or vae is None:
            raise ValueError("[Shima SEGSampler] ERROR: Missing model, clip, or vae! Connect them individually or wire a modelcitizen.bndl.")

        # Extract sampler parameters from SamplerCommons if provided
        if sampler_commons is not None:
            steps = sampler_commons.get("steps", steps)
            cfg = sampler_commons.get("cfg", cfg)
            sampler_name = sampler_commons.get("sampler_name", sampler_name)
            scheduler = sampler_commons.get("scheduler", scheduler)
            denoise = sampler_commons.get("denoise", denoise)

        if not segs[1]:
            # No segments selected; bypass and return the original image
            return (image,)

        import nodes
        import impact.impact_pack as inp_pack

        # 1. Internal CLIP Encoding
        # We instantiate standard ComfyUI CLIPTextEncode nodes under the hood
        clipper = nodes.CLIPTextEncode()
        pos_cond = clipper.encode(clip, positive_add)[0]
        neg_cond = clipper.encode(clip, negative_add)[0]

        # 2. Impact Pack Detailer Execution
        # Use the inpaint_model override if it was provided, otherwise default to the standard model
        det_model = inpaint_model if inpaint_model is not None else model
        
        enhanced_img, *_ = inp_pack.DetailerForEach.do_detail(
            image=image, 
            segs=segs, 
            model=det_model, 
            clip=clip, 
            vae=vae, 
            guide_size=guide_size, 
            guide_size_for_bbox=guide_size_for, 
            max_size=max_size, 
            seed=seed, 
            steps=steps, 
            cfg=cfg, 
            sampler_name=sampler_name, 
            scheduler=scheduler,
            positive=pos_cond, 
            negative=neg_cond, 
            denoise=denoise, 
            feather=feather, 
            noise_mask=True, 
            force_inpaint=True, 
            wildcard_opt="",
            detailer_hook=None,
            cycle=1,
            inpaint_model=False,
            noise_mask_feather=0,
            scheduler_func_opt=None,
            tiled_encode=False,
            tiled_decode=False
        )
        
        # 3. Optional Global Upscale & Final Polish Pass
        if upscale and upscale_by > 1.0:
            import comfy.utils
            
            # Upscale Image
            samples = enhanced_img.movedim(-1, 1) # [B, H, W, C] -> [B, C, H, W]
            new_width = round(samples.shape[3] * upscale_by)
            new_height = round(samples.shape[2] * upscale_by)
            samples = comfy.utils.common_upscale(samples, new_width, new_height, upscale_method, "disabled")
            enhanced_img = samples.movedim(1, -1) # Back to [B, H, W, C]
            
            # Optional Denoise
            if upscale_denoise > 0.0:
                latent_image = vae.encode(enhanced_img[:,:,:,:3]) # Ensure we only encode RGB
                latent_dict = {"samples": latent_image}
                
                sampled_latent = nodes.common_ksampler(
                    model=model, 
                    seed=seed, 
                    steps=upscale_steps, 
                    cfg=upscale_cfg, 
                    sampler_name=sampler_name, 
                    scheduler=scheduler, 
                    positive=pos_cond, 
                    negative=neg_cond, 
                    latent=latent_dict, 
                    denoise=upscale_denoise
                )[0]
                
                enhanced_img = vae.decode(sampled_latent["samples"])

        return (enhanced_img,)

NODE_CLASS_MAPPINGS = {
    "Shima.SEGSelector": ShimaSEGSelector,
    "Shima.SEGPromptTarget": ShimaSEGPromptTarget,
    "Shima.SEGMath": ShimaSEGMath,
    "Shima.AutoYoloSEG": ShimaAutoYoloSEG,
    "Shima.SEGSampler": ShimaSEGSampler
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.SEGSelector": "Shima Interactive SEGSelector",
    "Shima.SEGPromptTarget": "Shima SEGPromptTarget",
    "Shima.SEGMath": "Shima SEGMath",
    "Shima.AutoYoloSEG": "Shima AutoYoloSEG",
    "Shima.SEGSampler": "Shima SEGSampler"
}

