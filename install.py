import os
import sys
import subprocess
import requests

def install_dependencies():
    print("--------------------------------------------------")
    print("\033[36m[Shima]\033[0m \033[32mInitializing Installation Sequence...\033[0m")
    print("--------------------------------------------------")
    
    # 1. Determine ComfyUI custom_nodes path
    # We are currently inside ComfyUI/custom_nodes/Shima.wf
    current_dir = os.path.dirname(os.path.abspath(__file__))
    custom_nodes_dir = os.path.dirname(current_dir)
    comfyui_dir = os.path.dirname(custom_nodes_dir)
    
    print(f"Detected custom_nodes path: {custom_nodes_dir}")
    
    # 2. Define Core Dependencies
    dependencies = [
        {
            "name": "ComfyUI-Impact-Pack",
            "repo": "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git",
            "path": os.path.join(custom_nodes_dir, "ComfyUI-Impact-Pack")
        },
        {
            "name": "cg-use-everywhere",
            "repo": "https://github.com/chrisgoringe/cg-use-everywhere.git",
            "path": os.path.join(custom_nodes_dir, "cg-use-everywhere")
        }
    ]
    
    # 3. Check and Install Git Repositories
    for dep in dependencies:
        if not os.path.exists(dep["path"]):
            print(f"\033[33m[Shima]\033[0m Missing core dependency: {dep['name']}. Installing...")
            try:
                subprocess.check_call(
                    ["git", "clone", dep["repo"], dep["path"]],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.STDOUT
                )
                print(f"  \033[32m[\u2713]\033[0m Successfully installed {dep['name']}.")
            except subprocess.CalledProcessError:
                print(f"  \033[31m[\u2717]\033[0m Failed to install {dep['name']}. Please install it manually.")
                print(f"  Repo: {dep['repo']}")
        else:
            print(f"\033[36m[Shima]\033[0m Found existing extension: {dep['name']}.")
            
    # 4. Impact Pack Submodule Initialization Handle
    impact_pack_dir = os.path.join(custom_nodes_dir, "ComfyUI-Impact-Pack")
    if os.path.exists(impact_pack_dir):
        # We need to install Impact Pack's internal pip requirements
        req_file = os.path.join(impact_pack_dir, "requirements.txt")
        if os.path.exists(req_file):
            print(f"\033[36m[Shima]\033[0m Installing pip requirements for ComfyUI-Impact-Pack...")
            try:
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", "-r", req_file],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.STDOUT
                )
                print(f"  \033[32m[\u2713]\033[0m Requirements satisfied.")
            except subprocess.CalledProcessError:
                print(f"  \033[31m[\u2717]\033[0m Failed to install requirements for Impact Pack.")
                
        # Impact pack relies on submodules. We should init them just in case.
        try:
             subprocess.check_call(
                ["git", "submodule", "update", "--init", "--recursive"],
                cwd=impact_pack_dir,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.STDOUT
             )
        except Exception:
             pass # Silently fail, typical instances don't need this, but good to try.

    print("--------------------------------------------------")
    print("\033[36m[Shima]\033[0m \033[32mInstallation Complete! Please restart ComfyUI.\033[0m")
    print("--------------------------------------------------")

if __name__ == "__main__":
    install_dependencies()
