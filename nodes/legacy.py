import sys
import torch
import numpy as np
import subprocess
import math
import platform
from PIL import Image, ImageFilter, ImageDraw, ImageFont

# =============================================================================
# HELPERS
# =============================================================================

def or_convert(im, mode):
    return im if im.mode == mode else im.convert(mode)

def hue_rotate(im, deg=0):
    cos_hue = math.cos(math.radians(deg))
    sin_hue = math.sin(math.radians(deg))

    matrix = [
        .213 + cos_hue * .787 - sin_hue * .213,
        .715 - cos_hue * .715 - sin_hue * .715,
        .072 - cos_hue * .072 + sin_hue * .928,
        0,
        .213 - cos_hue * .213 + sin_hue * .143,
        .715 + cos_hue * .285 + sin_hue * .140,
        .072 - cos_hue * .072 - sin_hue * .283,
        0,
        .213 - cos_hue * .213 - sin_hue * .787,
        .715 - cos_hue * .715 + sin_hue * .715,
        .072 + cos_hue * .928 + sin_hue * .072,
        0,
    ]

    rotated = or_convert(im, 'RGB').convert('RGB', matrix)
    return or_convert(rotated, im.mode)

def add_text_to_image(img, font_ttf, size, x, y, text, color_rgb, center=False, rotate=0):
    draw = ImageDraw.Draw(img)
    myFont = ImageFont.truetype(font_ttf, size)
    # Using textbbox instead of textsize for newer PIL compatibility if needed, 
    # but keeping original logic as it "works"
    try:
        left, top, right, bottom = draw.textbbox((0, 0), text, font=myFont)
        text_width = right - left
        text_height = bottom - top
    except AttributeError:
        text_width, text_height = draw.textsize(text, font=myFont)

    if center:
        x -= text_width // 2
        y -= text_height // 2

    if rotate != 0:
        text_img = Image.new('RGBA', img.size, (255, 255, 255, 0))
        text_draw = ImageDraw.Draw(text_img)
        text_draw.text((x, y), text, font=myFont, fill=color_rgb)
        text_img = text_img.rotate(rotate, resample=Image.BICUBIC, expand=True)
        img.paste(text_img, (0, 0), text_img)
    else:
        draw.text((x, y), text, font=myFont, fill=color_rgb)

    return img

# =============================================================================
# PASSERS
# =============================================================================

class ShimaMultiPassXL:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "latent": ("LATENT",),
                "model": ("MODEL",),                
                "vae": ("VAE",),
                "clip": ("CLIP",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "refiner model":("MODEL",),
                "refiner clip":("CLIP",),
                "refiner positive":("CONDITIONING",),
                "refiner negative":("CONDITIONING",),
                "sdxl tuple": ("SDXL_TUPLE",),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "LATENT", "MODEL", "VAE", "CLIP", "CONDITIONING", "CONDITIONING", "MODEL", "CLIP", "CONDITIONING", "CONDITIONING", "SDXL_TUPLE",)
    RETURN_NAMES = ("image", "mask", "latent", "model", "vae", "clip", "positive", "negative", "refiner model", "refiner clip", "refiner positive", "refiner negative", "sdxl tuple",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"

    def execute(self, **kwargs):
        output_order = ("image", "mask", "latent", "model", "vae", "clip", "positive", "negative", "refiner model", "refiner clip", "refiner positive", "refiner negative", "sdxl tuple",)
        outputs = []
        for key in output_order:
            outputs.append(kwargs.get(key, None))
        return outputs

class ShimaMultiPass:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "latent": ("LATENT",),
                "model": ("MODEL",),                
                "vae": ("VAE",),
                "clip": ("CLIP",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "sdxl tuple": ("SDXL_TUPLE",),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "LATENT", "MODEL", "VAE", "CLIP", "CONDITIONING", "CONDITIONING", "SDXL_TUPLE",)
    RETURN_NAMES = ("image", "mask", "latent", "model", "vae", "clip", "positive", "negative", "sdxl tuple",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"

    def execute(self, **kwargs):
        output_order = ("image", "mask", "latent", "model", "vae", "clip", "positive", "negative", "sdxl tuple",)
        outputs = []
        for key in output_order:
            outputs.append(kwargs.get(key, None))
        return outputs

class ShimaModelPass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"model": ("MODEL",)}}
    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("model",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, model=None):
        return (model,)

class ShimaClipPass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"clip": ("CLIP",)}}
    RETURN_TYPES = ("CLIP",)
    RETURN_NAMES = ("clip",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, clip=None):
        return (clip,)

class ShimaVaePass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"vae": ("VAE",)}}
    RETURN_TYPES = ("VAE",)
    RETURN_NAMES = ("vae",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, vae=None):
        return (vae,)

class ShimaImagePass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"image": ("IMAGE",), "mask": ("MASK",)}}
    RETURN_TYPES = ("IMAGE", "MASK",)
    RETURN_NAMES = ("image", "mask",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, image=None, mask=None):
        return (image, mask)

class ShimaLatentPass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"latent": ("LATENT",)}}
    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("latent",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, latent=None):
        return (latent,)

class ShimaMaskPass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"mask": ("MASK",)}}
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, mask=None):
        return (mask,)

class ShimaPosNegPass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"positive": ("CONDITIONING",), "negative": ("CONDITIONING",)}}
    RETURN_TYPES = ("CONDITIONING", "CONDITIONING",)
    RETURN_NAMES = ("positive", "negative",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, positive=None, negative=None):
        return (positive, negative)

class ShimaConditioningPass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"conditioning": ("CONDITIONING",)}}
    RETURN_TYPES = ("CONDITIONING",)
    RETURN_NAMES = ("conditioning",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, conditioning=None):
        return (conditioning,)

class ShimaSdxlTuplePass:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {"sdxl tuple": ("SDXL_TUPLE",)}}
    RETURN_TYPES = ("SDXL_TUPLE",)
    RETURN_NAMES = ("sdxl tuple",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, **kwargs):
        return (kwargs.get("sdxl tuple", None),)

class ShimaPlaceholderTuple:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }
    RETURN_TYPES = ("SDXL_TUPLE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, **kwargs):
        provided_tuple_string = "(<comfy.model_patcher.ModelPatcher object at 0x00000215AF92E410>, " \
                                "<comfy.sd.CLIP object at 0x0000021582576110>, " \
                                "[[tensor([[[-0.3921,  0.0278, -0.0675,  ..., -0.4916, -0.3165,  0.0655], " \
                                "[-0.6300, -0.3306,  0.3012,  ...,  0.2379, -0.3163,  0.4271], " \
                                "[ 0.2102,  0.3428,  0.3694,  ..., -1.1688, -1.4279, -0.7521], " \
                                "..., " \
                                "[-0.3279, -0.1775, -1.6074,  ..., -0.3802, -1.1385, -0.0408], " \
                                "[-0.3222, -0.1721, -1.5919,  ..., -0.3691, -1.1436, -0.0270], " \
                                "[-0.3520, -0.0728, -1.5434,  ..., -0.3932, -1.0915, -0.0713]]]), {'pooled_output': None}]], " \
                                "[[tensor([[[-0.3921,  0.0278, -0.0675,  ..., -0.4916, -0.3165,  0.0655], " \
                                "[-0.6300, -0.3306,  0.3012,  ...,  0.2379, -0.3163,  0.4271], " \
                                "[ 0.2102,  0.3428,  0.3694,  ..., -1.1688, -1.4279, -0.7521], " \
                                "..., " \
                                "[-0.2891, -0.6821, -1.5167,  ..., -0.6290, -1.7984,  0.3385], " \
                                "[-0.2864, -0.6799, -1.5096,  ..., -0.6233, -1.7977,  0.3522], " \
                                "[-0.2866, -0.5871, -1.4560,  ..., -0.6451, -1.7306,  0.2990]]]), {'pooled_output': None}]], " \
                                "None, None, None, None)"
        result = tuple(provided_tuple_string.split(", "))
        return (result,)

class ShimaControlnetPreprocBus:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Input": ("INT", {"default": 1, "min": 1, "max": 9}),
            },
            "optional": {
                "c1_passthrough": ("IMAGE",),
                "c2_normal_lineart": ("IMAGE",),
                "c3_anime_lineart": ("IMAGE",),
                "c4_manga_lineart": ("IMAGE",),
                "c5_midas_depthmap": ("IMAGE",),
                "c6_color_palette": ("IMAGE",),
                "c7_canny_edge": ("IMAGE",),
                "c8_openpose_recognizer": ("IMAGE",),
                "c9_scribble_lines": ("IMAGE",),
                "c10_yourchoice1": ("IMAGE",),
                "c11_yourchoice2": ("IMAGE",),
            }
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities/Passers"
    def execute(self, Input, **kwargs):
        keys = ["c1_passthrough", "c2_normal_lineart", "c3_anime_lineart", "c4_manga_lineart", "c5_midas_depthmap", "c6_color_palette", "c7_canny_edge", "c8_openpose_recognizer", "c9_scribble_lines", "c10_yourchoice1", "c11_yourchoice2"]
        if 1 <= Input <= len(keys):
            return (kwargs.get(keys[Input-1]), )
        return (None,)

# =============================================================================
# PIPES
# =============================================================================

class ShimaMultiPipeIn15:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "latent": ("LATENT",),
                "model": ("MODEL",),                
                "vae": ("VAE",),
                "clip": ("CLIP",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "image_width": ("INT", {"default": 512, "min": 64, "max": 0xffffffffffffffff, "forceInput": True}),
                "image_height": ("INT", {"default": 512, "min": 64, "max": 0xffffffffffffffff, "forceInput": True}),
                "latent_width": ("INT", {"default": 512, "min": 64, "max": 0xffffffffffffffff, "forceInput": True}),
                "latent_height": ("INT", {"default": 512, "min": 64, "max": 0xffffffffffffffff, "forceInput": True}),
            },
        }
    RETURN_TYPES = ("PIPE_LINE", )
    RETURN_NAMES = ("pipe", )
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    def execute(self, image=0, mask=0, latent=0, model=0, vae=0, clip=0, positive=0, negative=0,image_width=0, image_height=0, latent_width=0, latent_height=0):
        pipe_line = (image, mask, latent, model, vae, clip, positive, negative, image_width, image_height, latent_width, latent_height)
        return (pipe_line, )

class ShimaMultiPipeOut15:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"pipe": ("PIPE_LINE",)}}
    RETURN_TYPES = ("PIPE_LINE", "IMAGE", "MASK", "LATENT", "MODEL", "VAE", "CLIP", "CONDITIONING", "CONDITIONING", "INT", "INT", "INT", "INT",)
    RETURN_NAMES = ("pipe", "image", "mask", "latent", "model", "vae", "clip", "positive", "negative", "image_width", "image_height", "latent_width", "latent_height",)  
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    def execute(self, pipe):
        image, mask, latent, model, vae, clip, positive, negative, image_width, image_height, latent_width, latent_height  = pipe 
        return (pipe, image, mask, latent, model, vae, clip, positive, negative, image_width, image_height, latent_width, latent_height,)

class ShimaMultiPipeInXL:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "sdxl_tuple": ("SDXL_TUPLE",),
                "latent": ("LATENT",),
                "model": ("MODEL",),                
                "vae": ("VAE",),
                "clip": ("CLIP",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "refiner_model": ("MODEL",),
                "refiner_vae": ("VAE",),                                
                "refiner_clip": ("CLIP",),
                "refiner_positive": ("CONDITIONING",),
                "refiner_negative": ("CONDITIONING",),                
                "image_width": ("INT", {"default": 1024, "min": 64, "max": 0xffffffffffffffff, "forceInput": True}),
                "image_height": ("INT", {"default": 1024, "min": 64, "max": 0xffffffffffffffff, "forceInput": True}),
                "latent_width": ("INT", {"default": 1024, "min": 64, "max": 0xffffffffffffffff, "forceInput": True}),
                "latent_height": ("INT", {"default": 1024, "min": 64, "max": 0xffffffffffffffff, "forceInput": True}),
            },
        }
    RETURN_TYPES = ("PIPE_LINE", )
    RETURN_NAMES = ("pipe", )
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    def execute(self, image=0, sdxl_tuple=0, mask=0, latent=0, model=0, vae=0, clip=0, positive=0, negative=0, refiner_model=0, refiner_vae=0, refiner_clip=0, refiner_positive=0, refiner_negative=0, image_width=0, image_height=0, latent_width=0, latent_height=0 ):
        pipe_line = (image, mask, sdxl_tuple, latent, model, vae, clip, positive, negative, refiner_model, refiner_vae, refiner_clip, refiner_positive, refiner_negative, image_width, image_height, latent_width, latent_height)
        return (pipe_line, )

class ShimaMultiPipeOutXL:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"pipe": ("PIPE_LINE",)}}
    RETURN_TYPES = ("IMAGE", "MASK", "SDXL_TUPLE", "LATENT", "MODEL", "VAE", "CLIP", "CONDITIONING", "CONDITIONING", "MODEL", "VAE", "CLIP", "CONDITIONING", "CONDITIONING", "INT", "INT", "INT", "INT",) 
    RETURN_NAMES = ("image", "mask", "sdxl_tuple", "latent", "model", "vae", "clip", "positive", "negative", "refiner_model", "refiner_vae", "refiner_clip", "refiner_positive", "refiner_negative", "image_width", "image_height", "latent_width", "latent_height",) 
    FUNCTION = "execute"
    CATEGORY = "Shima/Routing"
    def execute(self, pipe):
        image, mask, sdxl_tuple, latent, model, vae, clip, positive, negative, refiner_model, refiner_vae, refiner_clip, refiner_positive, refiner_negative, image_width, image_height, latent_width, latent_height = pipe  
        return (image, mask, sdxl_tuple, latent, model, vae, clip, positive, negative, refiner_model, refiner_vae, refiner_clip, refiner_positive, refiner_negative, image_width, image_height, latent_width, latent_height, ) 

# =============================================================================
# FX
# =============================================================================

class ShimaBrightnessContrast:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": (["brightness", "contrast"],),
                "strength": ("FLOAT", {"default": 0.5, "min": -1.0, "max": 1.0, "step": 0.01}),
                "enabled": ("BOOLEAN", {"default": True},),
            },
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"
    def execute(self, image, mode, strength, enabled):
        if enabled:
            if mode == "brightness":
                image = np.clip(image + strength, 0.0, 1.0)
            elif mode == "contrast":
                image = np.clip(image * strength, 0.0, 1.0)
        return (image,)

class ShimaImageFlip:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "flip_type": (["horizontal", "vertical"],),
                "enabled": ("BOOLEAN", {"default": True},),
            },
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"
    def execute(self, image, flip_type, enabled):
        if not enabled:
            return (image,)
        image_np = 255. * image.cpu().numpy().squeeze()
        if flip_type == "horizontal":
            flipped_image_np = np.flip(image_np, axis=1)
        elif flip_type == "vertical":
            flipped_image_np = np.flip(image_np, axis=0)
        else:
            return (image,)
        flipped_image_np = flipped_image_np.astype(np.float32) / 255.0
        flipped_image_tensor = torch.from_numpy(flipped_image_np).unsqueeze(0)
        return (flipped_image_tensor,)

class ShimaGaussianBlur:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 200.0, "step": 0.01}),
                "enabled": ("BOOLEAN", {"default": True},),
            },
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"
    def execute(self, image, strength, enabled):
        if not enabled:
            return (image,)
        i = 255. * image.cpu().numpy().squeeze()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        blurred_img = img.filter(ImageFilter.GaussianBlur(radius=strength))
        blurred_image_np = np.array(blurred_img).astype(np.float32) / 255.0
        blurred_image_tensor = torch.from_numpy(blurred_image_np).unsqueeze(0)
        return (blurred_image_tensor,)

class ShimaFlattenColors:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"images": ("IMAGE",),},
            "optional": {"number_of_colors": ("INT", {"default": 5, "min": 1, "max": 4000, "step": 1}),},
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"
    def execute(self, images, number_of_colors):
        total_images = []
        for image in images:
            i = 255. * image.cpu().numpy().squeeze()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            img = img.convert('P', palette=Image.ADAPTIVE, colors=number_of_colors)
            out_image = np.array(img.convert("RGB")).astype(np.float32) / 255.0
            out_image = torch.from_numpy(out_image).unsqueeze(0)
            total_images.append(out_image)
        return (torch.cat(total_images, 0),)

class ShimaHueRotation:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"images": ("IMAGE",),},
            "optional": {"hue_rotation": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 360.0, "step": 0.1}),},
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"
    def execute(self, images, hue_rotation):
        total_images = []
        for image in images:
            i = 255. * image.cpu().numpy().squeeze()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            img = hue_rotate(img, hue_rotation)
            out_image = np.array(img.convert("RGB")).astype(np.float32) / 255.0
            out_image = torch.from_numpy(out_image).unsqueeze(0)
            total_images.append(out_image)
        return (torch.cat(total_images, 0),)

class ShimaSwapColorMode:
    MODES = {
        'RGB': 'RGB', 'RGBA': 'RGBA', 'luminance': 'L', 'luminance_alpha': 'LA',
        'cmyk': 'CMYK', 'ycbcr': 'YCbCr', 'lab': 'LAB', 'hsv': 'HSV', 'single_channel': '1',
    }
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"images": ("IMAGE",),},
            "optional": {"color_mode": (['default', 'luminance', 'single_channel', 'RGB', 'RGBA', 'lab', 'hsv', 'cmyk', 'ycbcr'],),},
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"
    def execute(self, images, color_mode='default'):
        total_images = []
        for image in images:
            i = 255. * image.cpu().numpy().squeeze()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            if color_mode != 'default':
                img = img.convert(self.MODES[color_mode])
            out_image = np.array(img).astype(np.float32) / 255.0
            out_image = torch.from_numpy(out_image).unsqueeze(0)
            total_images.append(out_image)
        return (torch.cat(total_images, 0),)

# Optional dependencies for filters
try:
    import pilgram
except ModuleNotFoundError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pilgram"])
    import pilgram

class ShimaInstagramFilters:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"images": ("IMAGE",),},
            "optional": {"instagram_filter": ([
                "_1977", "aden", "brannan", "brooklyn", "clarendon", "earlybird", "gingham", "hudson", 
                "inkwell", "kelvin", "lark", "lofi", "maven", "mayfair", "moon", "nashville", 
                "perpetua", "reyes", "rise", "slumber", "stinson", "toaster", "valencia", "walden", 
                "willow", "xpro2"
            ],),},
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"
    def execute(self, images, instagram_filter):
        total_images = []
        filter_fn = getattr(pilgram, instagram_filter)
        for image in images:
            i = 255. * image.cpu().numpy().squeeze()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            img = filter_fn(img)
            out_image = np.array(img.convert("RGB")).astype(np.float32) / 255.0
            out_image = torch.from_numpy(out_image).unsqueeze(0)
            total_images.append(out_image)
        return (torch.cat(total_images, 0),)

try:
    from glitch_this import ImageGlitcher
except ModuleNotFoundError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "glitch-this"])
    from glitch_this import ImageGlitcher

class ShimaGlitchEffect:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"images": ("IMAGE",),},
            "optional": {
                "glitch_amount": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.01}),
                "color_offset": (['Disable', 'Enable'],),
                "scan_lines": (['Disable', 'Enable'],),
                "seed": ("INT", {"default": 0, "min": 0, "max": 100, "step": 1}),
            },
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Image"
    def execute(self, images, glitch_amount=1, color_offset='Disable', scan_lines='Disable', seed=0):
        glitcher = ImageGlitcher()
        total_images = []
        for image in images:
            i = 255. * image.cpu().numpy().squeeze()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            img = glitcher.glitch_image(img, glitch_amount, color_offset=(color_offset=='Enable'), scan_lines=(scan_lines=='Enable'), seed=seed)
            out_image = np.array(img.convert("RGB")).astype(np.float32) / 255.0
            out_image = torch.from_numpy(out_image).unsqueeze(0)
            total_images.append(out_image)
        return (torch.cat(total_images, 0),)

# =============================================================================
# UTILITIES
# =============================================================================

class ShimaAddFontText:
    def __init__(self):
        os_name = platform.system()
        if os_name == 'Windows':
            self.default_font_path = 'C:/Windows/Fonts/arial.ttf'
        elif os_name == 'Darwin':
            self.default_font_path = '/System/Library/Fonts/SFNS.ttf'
        elif os_name == 'Linux':
            self.default_font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
        else:
            self.default_font_path = ''

    @classmethod
    def INPUT_TYPES(cls):
        default_font_path = cls().default_font_path
        return {
            "required": {"images": ("IMAGE",),},
            "optional": {
                "font_ttf": ("STRING", {"default": default_font_path}),
                "size": ("INT", {"default": 50, "min": 2, "max": 1000, "step": 1}),
                "x": ("INT", {"default": 50, "min": 2, "max": 10000, "step": 1}),
                "y": ("INT", {"default": 50, "min": 2, "max": 10000, "step": 1}),
                "text": ("STRING", {"default": "Hello World", "multiline": True}),
                "color": ("STRING", {"default": 'rgba(255, 255, 255, 255)'}),
                "anchor": (["Bottom Left Corner", "Center"],),
                "rotate": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 360.0, "step": 0.1}),
                "color_mode": (["RGB", "RGBA"],),
            },
        }
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    def execute(self, images, font_ttf, size, x, y, color, anchor, rotate, color_mode, text):
        total_images = []
        center_anchor = True if anchor == 'Center' else False
        if color.startswith('#'):
            color_rgba = tuple(int(color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
        else:
            color_rgba = tuple(map(int, color.strip('rgba()').split(',')))
        for image in images:
            i = 255. * image.cpu().numpy().squeeze()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            img = add_text_to_image(img, font_ttf, size, x, y, text, color_rgba, center_anchor, rotate)
            out_image = np.array(img.convert(color_mode)).astype(np.float32) / 255.0
            out_image = torch.from_numpy(out_image).unsqueeze(0)
            total_images.append(out_image)
        return (torch.cat(total_images, 0),)

class ShimaBinaryIntSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"Input": ("INT", {"default": 1, "min": 1, "max": 2}),},
            "optional": {"int1": ("INT", {"forceInput": True}), "int2": ("INT", {"forceInput": True}),}
        }
    RETURN_TYPES = ("INT", )
    RETURN_NAMES = ("choice", )
    FUNCTION = "execute"
    CATEGORY = "Shima/Utilities"
    def execute(self, Input, int1=None, int2=None):
        return (int1 if Input == 1 else int2,)

# =============================================================================
# MAPPINGS
# =============================================================================

NODE_CLASS_MAPPINGS = {
    "Shima.MultiPass": ShimaMultiPass,
    "Shima.MultiPassXL": ShimaMultiPassXL,
    "Shima.ImagePass": ShimaImagePass,
    "Shima.MaskPass": ShimaMaskPass,
    "Shima.LatentPass": ShimaLatentPass,
    "Shima.ModelPass": ShimaModelPass,
    "Shima.VaePass": ShimaVaePass,
    "Shima.ClipPass": ShimaClipPass,
    "Shima.ConditioningPass": ShimaConditioningPass,
    "Shima.PosNegPass": ShimaPosNegPass,
    "Shima.SdxlTuplePass": ShimaSdxlTuplePass,
    "Shima.ControlnetPreprocBus": ShimaControlnetPreprocBus,
    "Shima.PlaceholderTuple": ShimaPlaceholderTuple,
    "Shima.MultiPipeIn15": ShimaMultiPipeIn15,
    "Shima.MultiPipeOut15": ShimaMultiPipeOut15,
    "Shima.MultiPipeInXL": ShimaMultiPipeInXL,
    "Shima.MultiPipeOutXL": ShimaMultiPipeOutXL,
    "Shima.BrightnessContrast": ShimaBrightnessContrast,
    "Shima.ImageFlip": ShimaImageFlip,
    "Shima.GaussianBlur": ShimaGaussianBlur,
    "Shima.FlattenColors": ShimaFlattenColors,
    "Shima.HueRotation": ShimaHueRotation,
    "Shima.SwapColorMode": ShimaSwapColorMode,
    "Shima.InstagramFilters": ShimaInstagramFilters,
    "Shima.GlitchEffect": ShimaGlitchEffect,
    "Shima.AddFontText": ShimaAddFontText,
    "Shima.BinaryIntSwitch": ShimaBinaryIntSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.MultiPass": "Shima Multi Pass",
    "Shima.MultiPassXL": "Shima Multi Pass XL",
    "Shima.ImagePass": "Shima Image Pass",
    "Shima.MaskPass": "Shima Mask Pass",
    "Shima.LatentPass": "Shima Latent Pass",
    "Shima.ModelPass": "Shima Model Pass",
    "Shima.VaePass": "Shima VAE Pass",
    "Shima.ClipPass": "Shima CLIP Pass",
    "Shima.ConditioningPass": "Shima Conditioning Pass",
    "Shima.PosNegPass": "Shima Pos/Neg Pass",
    "Shima.SdxlTuplePass": "Shima SDXL Tuple Pass",
    "Shima.ControlnetPreprocBus": "Shima CN Preprocessor Bus",
    "Shima.PlaceholderTuple": "Shima Placeholder Tuple",
    "Shima.MultiPipeIn15": "Shima MultiPipe 1.5 In",
    "Shima.MultiPipeOut15": "Shima MultiPipe 1.5 Out",
    "Shima.MultiPipeInXL": "Shima MultiPipe XL In",
    "Shima.MultiPipeOutXL": "Shima MultiPipe XL Out",
    "Shima.BrightnessContrast": "Shima Brightness/Contrast",
    "Shima.ImageFlip": "Shima Image Flip",
    "Shima.GaussianBlur": "Shima Gaussian Blur",
    "Shima.FlattenColors": "Shima Flatten Colors",
    "Shima.HueRotation": "Shima Hue Rotation",
    "Shima.SwapColorMode": "Shima Swap Color Mode",
    "Shima.InstagramFilters": "Shima Instagram Filters",
    "Shima.GlitchEffect": "Shima Glitch Effect",
    "Shima.AddFontText": "Shima Add Font Text",
    "Shima.BinaryIntSwitch": "Shima Int Switch",
}
