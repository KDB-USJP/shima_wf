from ..utils.settings_utils import ShimaSettings

class ShimaHub:
    """
    Central hub for Shima settings, asset management, and subscription status.
    This node doesn't 'do' anything in the workflow; it's a UI anchor for the Shima Bootstrap system.
    """
    @classmethod
    def INPUT_TYPES(cls):
        # Fetch dynamic packs from settings
        packs = list(ShimaSettings.get_asset_packs().keys())
        if not packs:
            packs = ["Standard"]
            
        return {
            "required": {
                "active_pack": (packs, {"default": packs[0]}),
                "auto_update": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "custom_download_url": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("STATUS",)
    FUNCTION = "get_status"
    CATEGORY = "Shima/Panels"

    def get_status(self, active_pack, auto_update, custom_download_url=""):
        # This can report the current asset path and pack status
        return (f"Pack: {active_pack} | Auto-Update: {auto_update}",)

NODE_CLASS_MAPPINGS = {
    "Shima.Hub": ShimaHub
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Shima.Hub": "Shima Setup Hub"
}
