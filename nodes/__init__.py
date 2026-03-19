"""
Shima Custom Nodes

This module exports all Shima custom nodes for ComfyUI registration.
"""

from .latent_maker import NODE_CLASS_MAPPINGS as LATENT_MAKER_NODES
from .latent_maker import NODE_DISPLAY_NAME_MAPPINGS as LATENT_MAKER_DISPLAY_NAMES
from .seed_controller import NODE_CLASS_MAPPINGS as SEED_CONTROLLER_NODES
from .seed_controller import NODE_DISPLAY_NAME_MAPPINGS as SEED_CONTROLLER_DISPLAY_NAMES
from .file_namer import NODE_CLASS_MAPPINGS as FILE_NAMER_NODES
from .file_namer import NODE_DISPLAY_NAME_MAPPINGS as FILE_NAMER_DISPLAY_NAMES
from .file_saver import NODE_CLASS_MAPPINGS as FILE_SAVER_NODES
from .file_saver import NODE_DISPLAY_NAME_MAPPINGS as FILE_SAVER_DISPLAY_NAMES
from .multi_saver import NODE_CLASS_MAPPINGS as MULTI_SAVER_NODES
from .multi_saver import NODE_DISPLAY_NAME_MAPPINGS as MULTI_SAVER_DISPLAY_NAMES
from .sampler import NODE_CLASS_MAPPINGS as SAMPLER_NODES
from .sampler import NODE_DISPLAY_NAME_MAPPINGS as SAMPLER_DISPLAY_NAMES
from .sampler_commons import NODE_CLASS_MAPPINGS as SAMPLER_COMMONS_NODES
from .sampler_commons import NODE_DISPLAY_NAME_MAPPINGS as SAMPLER_COMMONS_DISPLAY_NAMES
from .preview import NODE_CLASS_MAPPINGS as PREVIEW_NODES
from .preview import NODE_DISPLAY_NAME_MAPPINGS as PREVIEW_DISPLAY_NAMES
from .preview import ShimaPreview
from .preview_compare import NODE_CLASS_MAPPINGS as PREVIEW_COMPARE_NODES
from .preview_compare import NODE_DISPLAY_NAME_MAPPINGS as PREVIEW_COMPARE_DISPLAY_NAMES
from .carousel_preview import NODE_CLASS_MAPPINGS as CAROUSEL_PREVIEW_NODES
from .carousel_preview import NODE_DISPLAY_NAME_MAPPINGS as CAROUSEL_PREVIEW_DISPLAY_NAMES
from .commons import NODE_CLASS_MAPPINGS as COMMONS_NODES
from .commons import NODE_DISPLAY_NAME_MAPPINGS as COMMONS_DISPLAY_NAMES
from .primitives import NODE_CLASS_MAPPINGS as PRIMITIVES_NODES
from .primitives import NODE_DISPLAY_NAME_MAPPINGS as PRIMITIVES_DISPLAY_NAMES
from .utilities import NODE_CLASS_MAPPINGS as UTILITIES_NODES
from .utilities import NODE_DISPLAY_NAME_MAPPINGS as UTILITIES_DISPLAY_NAMES
from .rich_content import NODE_CLASS_MAPPINGS as RICH_CONTENT_NODES
from .rich_content import NODE_DISPLAY_NAME_MAPPINGS as RICH_CONTENT_DISPLAY_NAMES
from .transformer import NODE_CLASS_MAPPINGS as TRANSFORMER_NODES
from .transformer import NODE_DISPLAY_NAME_MAPPINGS as TRANSFORMER_DISPLAY_NAMES
from .transform_one import NODE_CLASS_MAPPINGS as TRANSFORM_ONE_NODES
from .transform_one import NODE_DISPLAY_NAME_MAPPINGS as TRANSFORM_ONE_DISPLAY_NAMES

from .sticker import NODE_CLASS_MAPPINGS as STICKER_NODES
from .sticker import NODE_DISPLAY_NAME_MAPPINGS as STICKER_DISPLAY_NAMES
from .headline import NODE_CLASS_MAPPINGS as HEADLINE_NODES
from .headline import NODE_DISPLAY_NAME_MAPPINGS as HEADLINE_DISPLAY_NAMES
from .legacy import NODE_CLASS_MAPPINGS as LEGACY_NODES
from .legacy import NODE_DISPLAY_NAME_MAPPINGS as LEGACY_DISPLAY_NAMES
from .nsfw_checker import NODE_CLASS_MAPPINGS as NSFW_NODES
from .nsfw_checker import NODE_DISPLAY_NAME_MAPPINGS as NSFW_DISPLAY_NAMES
from .master_prompt import NODE_CLASS_MAPPINGS as MASTER_PROMPT_NODES
from .master_prompt import NODE_CLASS_MAPPINGS as MASTER_PROMPT_NODES
from .master_prompt import NODE_DISPLAY_NAME_MAPPINGS as MASTER_PROMPT_DISPLAY_NAMES
from .seed_logger import ShimaSeedLogger
from .inspector import ShimaInspector
from .batch_processor import ShimaBatchImageProcessor
from .smart_reroute import NODE_CLASS_MAPPINGS as SMART_REROUTE_NODES
from .smart_reroute import NODE_DISPLAY_NAME_MAPPINGS as SMART_REROUTE_DISPLAY_NAMES
from .datapreview_test import NODE_CLASS_MAPPINGS as DATAPREVIEW_TEST_NODES
from .datapreview_test import NODE_DISPLAY_NAME_MAPPINGS as DATAPREVIEW_TEST_DISPLAY_NAMES
from .workflow_image import ShimaWorkflowImage
from .model_citizen import ShimaModelCitizen, ShimaLoraStack, ShimaPanelModelCitizen
from .photo_remix import ShimaPhotoRemix
from .styler import ShimaStyleSelector, ShimaStyleIterator, ShimaStyleGallery
from .control_agent import NODE_CLASS_MAPPINGS as CONTROL_AGENT_NODES
from .control_agent import NODE_DISPLAY_NAME_MAPPINGS as CONTROL_AGENT_DISPLAY_NAMES
from .interactive_crop import NODE_CLASS_MAPPINGS as INTERACTIVE_CROP_NODES
from .interactive_crop import NODE_DISPLAY_NAME_MAPPINGS as INTERACTIVE_CROP_DISPLAY_NAMES
from .segs_nodes import NODE_CLASS_MAPPINGS as SEGS_NODES
from .segs_nodes import NODE_DISPLAY_NAME_MAPPINGS as SEGS_DISPLAY_NAMES
from .segs_nodes import NODE_CLASS_MAPPINGS as SEGS_NODES
from .segs_nodes import NODE_DISPLAY_NAME_MAPPINGS as SEGS_DISPLAY_NAMES
from .styler_favorites import ShimaStyleFavorites
from .hub import NODE_CLASS_MAPPINGS as HUB_NODES
from .hub import NODE_DISPLAY_NAME_MAPPINGS as HUB_DISPLAY_NAMES
from .mascot import NODE_CLASS_MAPPINGS as MASCOT_NODES
from .mascot import NODE_DISPLAY_NAME_MAPPINGS as MASCOT_DISPLAY_NAMES
from .system_utils import NODE_CLASS_MAPPINGS as SYSTEM_NODES
from .system_utils import NODE_DISPLAY_NAME_MAPPINGS as SYSTEM_DISPLAY_NAMES
from .panel_bndler import NODE_CLASS_MAPPINGS as PANEL_BNDLER_NODES
from .panel_bndler import NODE_DISPLAY_NAME_MAPPINGS as PANEL_BNDLER_DISPLAY_NAMES
from .workflow_checker import NODE_CLASS_MAPPINGS as WORKFLOW_CHECKER_NODES
from .workflow_checker import NODE_DISPLAY_NAME_MAPPINGS as WORKFLOW_CHECKER_DISPLAY_NAMES
from .dependency_nodes import NODE_CLASS_MAPPINGS as DEPENDENCY_NODES
from .dependency_nodes import NODE_DISPLAY_NAME_MAPPINGS as DEPENDENCY_DISPLAY_NAMES

# Import server to register routes
from . import server

# Combine all node mappings
NODE_CLASS_MAPPINGS = {
    **LATENT_MAKER_NODES,
    **SEED_CONTROLLER_NODES,
    **FILE_NAMER_NODES,
    **FILE_SAVER_NODES,
    **MULTI_SAVER_NODES,
    **SAMPLER_NODES,
    **SAMPLER_COMMONS_NODES,
    **PREVIEW_NODES,
    **PREVIEW_COMPARE_NODES,
    **CAROUSEL_PREVIEW_NODES,
    **COMMONS_NODES,
    **PRIMITIVES_NODES,
    **UTILITIES_NODES,
    **RICH_CONTENT_NODES,
    **STICKER_NODES,
    **HEADLINE_NODES,
    **LEGACY_NODES,
    **NSFW_NODES,
    **MASTER_PROMPT_NODES,
    **SMART_REROUTE_NODES,
    **TRANSFORMER_NODES,
    **TRANSFORM_ONE_NODES,
    **DATAPREVIEW_TEST_NODES,
    "Shima.SeedLogger": ShimaSeedLogger,
    "Shima.Inspector": ShimaInspector,
    "Shima.BatchImageProcessor": ShimaBatchImageProcessor,
    "Shima.WorkflowImage": ShimaWorkflowImage,
    "Shima.ModelCitizen": ShimaModelCitizen,
    "Shima.PanelModelCitizen": ShimaPanelModelCitizen,
    "Shima.LoraStack": ShimaLoraStack,
    "Shima.PhotoRemix": ShimaPhotoRemix,
    "Shima.StyleSelector": ShimaStyleSelector,
    "Shima.StyleIterator": ShimaStyleIterator,
    "Shima.StyleGallery": ShimaStyleGallery,
    "Shima.StyleFavorites": ShimaStyleFavorites,
    **HUB_NODES,
    **MASCOT_NODES,
    **SYSTEM_NODES,
    **CONTROL_AGENT_NODES,
    **INTERACTIVE_CROP_NODES,
    **SEGS_NODES,
    **PANEL_BNDLER_NODES,
    **WORKFLOW_CHECKER_NODES,
    **DEPENDENCY_NODES,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    **LATENT_MAKER_DISPLAY_NAMES,
    **SEED_CONTROLLER_DISPLAY_NAMES,
    **FILE_NAMER_DISPLAY_NAMES,
    **FILE_SAVER_DISPLAY_NAMES,
    **MULTI_SAVER_DISPLAY_NAMES,
    **SAMPLER_DISPLAY_NAMES,
    **SAMPLER_COMMONS_DISPLAY_NAMES,
    **PREVIEW_DISPLAY_NAMES,
    **PREVIEW_COMPARE_DISPLAY_NAMES,
    **CAROUSEL_PREVIEW_DISPLAY_NAMES,
    **COMMONS_DISPLAY_NAMES,
    **PRIMITIVES_DISPLAY_NAMES,
    **UTILITIES_DISPLAY_NAMES,
    **RICH_CONTENT_DISPLAY_NAMES,
    **STICKER_DISPLAY_NAMES,
    **HEADLINE_DISPLAY_NAMES,
    **LEGACY_DISPLAY_NAMES,
    **NSFW_DISPLAY_NAMES,
    **MASTER_PROMPT_DISPLAY_NAMES,
    **SMART_REROUTE_DISPLAY_NAMES,
    **TRANSFORMER_DISPLAY_NAMES,
    **TRANSFORM_ONE_DISPLAY_NAMES,
    **DATAPREVIEW_TEST_DISPLAY_NAMES,
    "Shima.SeedLogger": "Shima Seed Logger",
    "Shima.Inspector": "Shima Inspector",
    "Shima.BatchImageProcessor": "Shima Batch Image Processor",
    "Shima.WorkflowImage": "Shima Workflow Image Creator",
    "Shima.ModelCitizen": "Shima Model Citizen",
    "Shima.PanelModelCitizen": "Shima Panel Model Citizen",
    "Shima.LoraStack": "Shima Lora Stack",
    "Shima.PhotoRemix": "Shima Photo Remix",
    "Shima.StyleSelector": "Shima Styler (Selector)",
    "Shima.StyleIterator": "Shima Styler (Iterator)",
    "Shima.StyleGallery": "Shima Styler (Gallery)",
    "Shima.StyleFavorites": "Shima Styler (Favorites)",
    **HUB_DISPLAY_NAMES,
    **MASCOT_DISPLAY_NAMES,
    **SYSTEM_DISPLAY_NAMES,
    **CONTROL_AGENT_DISPLAY_NAMES,
    **INTERACTIVE_CROP_DISPLAY_NAMES,
    **SEGS_DISPLAY_NAMES,
    **PANEL_BNDLER_DISPLAY_NAMES,
    **WORKFLOW_CHECKER_DISPLAY_NAMES,
    **DEPENDENCY_DISPLAY_NAMES,
}

# ============================================================================
# API Routes (registered safely after imports)
# ============================================================================

def register_api_routes():
    """Register API routes for Shima nodes."""
    try:
        from server import PromptServer
        from aiohttp import web
        import os
        import subprocess
        
        @PromptServer.instance.routes.post("/shima/preview/save")
        async def save_preview(request):
            """Save current preview to filesystem."""
            try:
                data = await request.json()
                focused_index = data.get("focused_index", -1)
                default_folder = data.get("default_folder", "")
                result = ShimaPreview.save_current(focused_index=focused_index, folder=default_folder)
                return web.json_response(result)
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)
        
        @PromptServer.instance.routes.post("/shima/preview/open_editor")
        async def open_in_editor(request):
            """Open image in external editor or file explorer."""
            try:
                import folder_paths
                data = await request.json()
                relative_path = data.get("path", "")
                editor_path = data.get("editor_path", "")
                
                # Build full path from temp folder
                if relative_path.startswith("temp/"):
                    filename = relative_path.replace("temp/", "")
                    full_path = os.path.join(folder_paths.get_temp_directory(), filename)
                else:
                    full_path = relative_path
                
                if not os.path.exists(full_path):
                    return web.json_response({"error": f"Image not found: {full_path}"}, status=404)
                
                if editor_path and os.path.exists(editor_path):
                    # Use specified editor
                    subprocess.Popen([editor_path, full_path])
                else:
                    # Open folder containing file (select the file)
                    if os.name == 'nt':  # Windows
                        subprocess.Popen(['explorer', '/select,', full_path])
                    elif os.name == 'posix':  # Linux/Mac
                        folder = os.path.dirname(full_path)
                        subprocess.Popen(['xdg-open', folder])
                
                return web.json_response({"success": True, "path": full_path})
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)
        
        @PromptServer.instance.routes.post("/shima/deps/batch_install")
        async def batch_install_deps(request):
            """Download a list of ad-hoc dependencies."""
            try:
                data = await request.json()
                deps = data.get("dependencies", [])
                
                from .utils.asset_manager import AssetManager
                import threading
                import folder_paths
                
                asset_manager = AssetManager()
                
                def run_batch(items):
                    for item in items:
                        url = item.get("url")
                        filename = item.get("filename")
                        # Determine destination root
                        import folder_paths
                        
                        target_sub = item.get("save_path", "")
                        base_category = "others"
                        sub_path = ""
                        
                        if target_sub and target_sub != "default":
                            # Check if the first part is a known category (e.g. "controlnet/preprocessors")
                            parts = target_sub.replace("\\", "/").split("/")
                            first_part = parts[0]
                            if first_part in folder_paths.folder_names_and_paths:
                                base_category = first_part
                                sub_path = "/".join(parts[1:])
                            else:
                                # Fallback to existing m_type logic
                                m_type = item.get("type", "checkpoints").lower()
                                if "checkpoint" in m_type: base_category = "checkpoints"
                                elif "lora" in m_type: base_category = "loras"
                                elif "vae" in m_type: base_category = "vae"
                                sub_path = target_sub
                        else:
                            # Direct fallback
                            m_type = item.get("type", "checkpoints").lower()
                            if "checkpoint" in m_type: base_category = "checkpoints"
                            elif "lora" in m_type: base_category = "loras"
                            elif "vae" in m_type: base_category = "vae"
                        
                        try:
                            root_paths = folder_paths.get_folder_paths(base_category)
                            if not root_paths:
                                # Final fallback to models root if possible
                                root_paths = folder_paths.get_folder_paths("checkpoints")
                                base_dir = os.path.dirname(root_paths[0])
                            else:
                                base_dir = root_paths[0]
                        except:
                            base_dir = "models" # Absolute fallback
                            
                        # Combine base + subfolder
                        if sub_path:
                            dest_dir = os.path.join(base_dir, sub_path)
                            os.makedirs(dest_dir, exist_ok=True)
                        else:
                            dest_dir = base_dir
                            
                        dest_path = os.path.join(dest_dir, filename)
                        
                        print(f"[Shima.Deps] Starting download: {filename} from {url} -> {dest_path}")
                        try:
                            asset_manager.download_file(url, dest_path)
                        except Exception as e:
                            print(f"[Shima.Deps] Failed to download {filename}: {e}")

                thread = threading.Thread(target=run_batch, args=(deps,))
                thread.daemon = True
                thread.start()
                
                return web.json_response({"success": True, "message": "Batch download started in background"})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        print("[Shima] API routes registered successfully")
        
    except Exception as e:
        print(f"[Shima] Warning: Could not register API routes: {e}")

# Register routes (safe - won't crash if server not ready)
try:
    register_api_routes()
except Exception as e:
    print(f"[Shima] Warning: API route registration deferred: {e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
