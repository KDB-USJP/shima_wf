# Getting Started with Shima

Welcome to Shima — a custom node extension and marketplace for ComfyUI that brings composable "workflow islands" and a curated art style library to your image generation workflow.

---

## Installation

### Prerequisites

- A working [ComfyUI](https://github.com/comfyanonymous/ComfyUI) installation
- Python 3.8 or later
- Git

### Install via Git Clone

1. Open a terminal and navigate to your ComfyUI custom nodes directory:

   ```bash
   cd ComfyUI/custom_nodes/
   ```

2. Clone the Shima repository:

   ```bash
   git clone https://github.com/KDB-USJP/Shima.wf.git Shima
   ```

3. Install Python dependencies:

   ```bash
   cd Shima
   pip install -r requirements.txt
   ```

4. Restart ComfyUI. You should see `[Shima] Registered XX custom nodes` in the console output.

### Install via ComfyUI Manager

If you use [ComfyUI Manager](https://github.com/ltdrdata/ComfyUI-Manager), search for **Shima** in the custom node browser and install directly.

### Verifying Installation

After restarting ComfyUI, right-click on the canvas and look for the **Shima/** submenu. You should see categories like Shima/Loaders, Shima/Sampling, Shima/Utilities, etc. If the menu appears, Shima is installed correctly.

---

## First Steps

### 1. Place the Setup Hub

Add a **Shima Setup Hub** node (Shima/Panels → Setup Hub). This node manages style thumbnail packs and asset dependencies. Select your preferred thumbnail pack from the dropdown, and Shima will download the required images on first run.

### 2. Build a Basic Generation Pipeline

The simplest Shima pipeline uses four nodes:

1. **Model Citizen** (Shima/Loaders) — Load your checkpoint, CLIP, and VAE
2. **Master Prompt** (Shima/Conditioning) — Write your positive and negative prompts
3. **Latent Maker** (Shima/Latent) — Set image dimensions
4. **Sampler** (Shima/Sampling) — Generate your image

Wire them together: Model Citizen outputs → Master Prompt (CLIP) + Sampler (MODEL, VAE) → Latent Maker → Sampler (latent_image) → Preview.

### 3. Try the Panel System

For a cleaner setup, use the **Panel** variants instead:

1. **Panel Model Citizen** — Single BNDL output
2. **Panel Master Prompt** — Single BNDL output
3. **Panel Latent Maker** — Single BNDL output
4. **Panel Sampler** — Accepts all three BNDLs, outputs your image

Each Panel node has just one output wire instead of many. Double-click any Panel to open its settings modal.

---

## Website Integration

Shima includes optional integration with [shima.wf](https://shima.wf), the companion marketplace website.

### What the Website Does

- **Browse and purchase workflow Islands** — atomic workflow components you can mix and match
- **Browse and purchase digital assets** — exclusive models, image packs, and more
- **Sell your own creations** — list Islands or digital assets for sale using the Noods currency system

### How It Connects

When you log in on the website and sync your account, Shima stores a local authentication key in `config/auth.json`. This key allows your ComfyUI instance to:

- **Sync purchased Islands** to your local database for offline use
- **Download style thumbnail packs** from the marketplace
- **Access your library** of purchased content

All synced data is stored locally in `data/islands.db`. Once synced, your Islands work completely offline — no internet connection required for generation.

### Offline-First Philosophy

Shima is built around one core principle: **your machine, your rules**. 

- All image generation happens locally on your hardware — nothing is sent to a server
- Purchased Islands are synced to your local database and work offline forever
- The node extension works perfectly without any website account
- There is no subscription or recurring fee required to use the nodes
- Settings, workflows, and generated images never leave your computer

The website and marketplace are optional services that enhance the experience, not gatekeep it.

---

## Settings

Shima settings are stored in `config/shima_settings.json` and can be configured through the Shima settings panel in ComfyUI's interface.

Key settings include:

| Setting | Description |
|---------|-------------|
| `active_thumbnail_pack` | Which style preview images to display |
| `asset_directory` | Custom path for style assets (defaults to built-in) |
| `auto_update` | Automatically check for pack updates |

Additional settings are available in `config/site_default_settings.json`, which defines system-wide defaults like supported model types, aspect ratio presets, filename ordering templates, and color themes.

---

## Next Steps

- Read **[Concepts](concepts.md)** to understand Islands, BNDLs, and the Panel system
- Browse the **[Node Reference](Shima_Node_Reference.md)** for details on every node
- Visit **[shima.wf](https://shima.wf)** to explore the marketplace
- Join the **[Discord community](https://discord.gg/vggNspQC3h)** for support, tips, and collaboration
