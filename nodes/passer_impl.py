
class ShimaPasser:
    """
    Passthrough node for Shima Common Params.
    Useful for passing global configuration into subgraphs or organizing workflows.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "shima_commonparams": ("DICT", {
                    "forceInput": True,
                    "tooltip": "Connect Shima.Commons bundle here."
                }),
            },
            "optional": {
                "allow_external_linking": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If ON, this node broadcasts/receives OUTSIDE the Island (ignores group regex)"
                }),
            }
        }
    
    RETURN_TYPES = ("DICT", "INT", "INT", "INT", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("shima.commonparams", "SEED", "WIDTH", "HEIGHT", "PROJECT_NAME", "SAVE_PATH", "COLLISION_ID", "TIMESTAMP")
    FUNCTION = "unpack"
    CATEGORY = "Shima/Panels"
    
    def unpack(self, shima_commonparams, **kwargs):
        # Unpack values from bundle
        seed = shima_commonparams.get("seed", 0)
        width = shima_commonparams.get("width", 1024)
        height = shima_commonparams.get("height", 1024)
        project = shima_commonparams.get("project_name", "")
        save_path = shima_commonparams.get("save_path", "")
        cid = shima_commonparams.get("collision_id", "")
        timestamp = shima_commonparams.get("timestamp", "")
        
        return (shima_commonparams, seed, width, height, project, save_path, cid, timestamp)
