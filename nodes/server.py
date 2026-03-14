"""
Shima Server - API endpoints for Shima nodes
"""
import os
import glob
from aiohttp import web
from server import PromptServer

# Configuration
LOGO_DIR = "E:/ComfyDev/Old System/Logos/PNG"

# Register routes
def register_shims_routes():
    # 1. List Logos API
    @PromptServer.instance.routes.get("/shima/logos")
    async def get_logos(request):
        if not os.path.isdir(LOGO_DIR):
            return web.json_response([], content_type='application/json')
        
        files = glob.glob(os.path.join(LOGO_DIR, "*.png"))
        filenames = [os.path.basename(f) for f in files]
        return web.json_response(filenames, content_type='application/json')

    # 2. Serve Logo Assets
    @PromptServer.instance.routes.get("/shima/assets/logos/{filename}")
    async def serve_logo(request):
        filename = request.match_info["filename"]
        file_path = os.path.join(LOGO_DIR, filename)
        
        if not os.path.isfile(file_path):
            return web.Response(status=404, text="File not found")
            
        return web.FileResponse(file_path)

    # 3. List Fonts API
    @PromptServer.instance.routes.get("/shima/fonts")
    async def get_fonts(request):
        fonts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fonts")
        if not os.path.isdir(fonts_dir):
            return web.json_response([], content_type='application/json')
        
        files = [f for f in os.listdir(fonts_dir) if f.lower().endswith(('.ttf', '.otf'))]
        return web.json_response(sorted(files), content_type='application/json')

    # 4. Serve Font Assets
    @PromptServer.instance.routes.get("/shima/assets/fonts/{filename}")
    async def serve_font(request):
        filename = request.match_info["filename"]
        fonts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fonts")
        file_path = os.path.join(fonts_dir, filename)
        
        if not os.path.isfile(file_path):
            return web.Response(status=404, text="Font not found")
            
        return web.FileResponse(file_path)

# Initialize
register_shims_routes()
