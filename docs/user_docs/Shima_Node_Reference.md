# Shima Node Reference

A comprehensive reference for all Shima custom nodes for ComfyUI. Nodes are organized by category as they appear in the ComfyUI right-click menu.

---

## Common Features

Many Shima nodes share the following features. They're described once here to avoid repetition.

### Topbar (allow_external_linking)

Most Shima nodes include a **topbar** strip across the top of the node. Its first icon, a Green or Red circle. This icon toggles the "use_commonparams" switch internally. Shima has a "Commons" node that supplies many common values. Turning this switch to Green means that, if the shima.commonparams wire is attached, the node will use the values from the Commons node and bypass the node's settings that the node would otherwise use. 

The topbar also displays a small **X icon** that toggles the `allow_external_linking` behavior. When enabled (X is cleared), the node's inputs are exposed to "Use Everywhere" broadcastable matching from outside the group that the node is in. When disabled (X is shown), the node's inputs are locked to manual wiring only. The `allow_external_linking` widget itself is hidden from the node body — the X icon is the sole control.

### Passed Values Display (show_used_values)

Nodes that process or route data often include a **show_used_values** toggle. When enabled, a text area appears at the bottom of the node showing which values were passed through during the last execution, including their types, names, and truncated previews. This is invaluable for debugging complex workflows.

### BNDL (Bundle) System

Shima uses a "bundle" (BNDL) system to package multiple related outputs (model, clip, vae, conditioning, etc.) into a single wire. This dramatically reduces wiring complexity. BNDLs are created by generator nodes (Model Citizen, Master Prompt, Latent Maker) and consumed by the Panel ecosystem and the DeBNDLer/ReBNDLer routing nodes.

### Panel System

"Panel" variants of generator nodes (Panel Model Citizen, Panel Master Prompt, Panel Latent Maker, Panel Sampler) present a compact PCB-style chassis with a double-click settings modal. They output a single BNDL wire instead of multiple individual ports, enabling clean, minimal wiring. The Panel Sampler internally expands into a full sampling pipeline via a macro expander.

---

## Shima/Conditioning

### Master Prompt

Multi-model-aware dual-prompt management node for positive and negative conditioning. The `model_type` dropdown (SDXL, SD 1.5, SD3, Flux, AuraFlow, HunyuanDiT) determines which text encoder inputs are active:

- **SD 1.5**: Uses only the main positive/negative text boxes with a single CLIP encoder.
- **SDXL**: Adds CLIP-L (style/detail) and CLIP-G (subject) text fields with independent weight sliders, encoding both into a dual-encoder conditioning.
- **SD3 / Flux / AuraFlow / HunyuanDiT**: Adds a T5 text field for complex natural-language prompts alongside the CLIP-L and CLIP-G fields.

The main positive/negative text boxes are always present and serve as the primary prompt. The L/G/T5 fields are supplementary — leave them empty to use only the main prompt for that encoder. Each encoder has an independent `weight` slider (0.0–10.0) to balance the contribution of each text encoder.

**Understanding the text encoders:**

- **CLIP-L** (CLIP ViT-L) is trained on short, keyword-style descriptions. It's best at capturing **style, aesthetics, and fine detail** — think art style, lighting, texture. Prompts like "oil painting, dramatic lighting, volumetric fog" work well here.
- **CLIP-G** (CLIP ViT-bigG) is trained on longer, more descriptive captions. It excels at understanding **subject matter, composition, and spatial relationships** — the "what" and "where" of your image. Prompts like "a woman sitting at a café table, looking out the window" work well here.
- **T5** (T5-XXL) is a large language model encoder that understands **natural language at a deeper level**. It handles complex, paragraph-length descriptions, abstract concepts, and nuanced instructions that CLIP encoders miss. Used by SD3, Flux, and other modern architectures.

For SDXL, using both CLIP-L and CLIP-G together produces richer results than using only the main prompt. For SD3/Flux, all three encoders work in concert — you can write a detailed scene in the main box and fine-tune style in CLIP-L or subject detail in CLIP-G.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Input | `clip` | CLIP | CLIP model for text encoding |
| Input | `modelcitizen` | BNDL | Model Citizen bundle (auto-extracts CLIP) |
| Input | `positive` | STRING | Main positive prompt (multiline) |
| Input | `negative` | STRING | Main negative prompt (multiline) |
| Widget | `model_type` | COMBO | sdxl, sd1.5, sd3, flux, auraflow, hunyuan |
| Widget | `clip_l_weight` | FLOAT | CLIP-L encoder weight (0.0–10.0) |
| Input | `positive_l`, `negative_l` | STRING | CLIP-L positive/negative (SDXL/SD3 style/detail) |
| Widget | `clip_g_weight` | FLOAT | CLIP-G encoder weight (0.0–10.0) |
| Input | `positive_g`, `negative_g` | STRING | CLIP-G positive/negative (SDXL/SD3 subject) |
| Widget | `t5_weight` | FLOAT | T5 encoder weight (0.0–10.0) |
| Input | `positive_t5`, `negative_t5` | STRING | T5 positive/negative (SD3/Flux complex text) |
| Widget | `show_used_values` | BOOLEAN | Display passed values |
| Widget | `allow_external_linking` | BOOLEAN | Topbar toggle |
| Output | `positive` | CONDITIONING | Encoded positive conditioning |
| Output | `negative` | CONDITIONING | Encoded negative conditioning |
| Output | `masterprompt.bndl` | BNDL | Bundle containing both conditionings |

---

## Shima/Design

### Backdrop

A decorative background node that draws gradient or image backgrounds behind groups of nodes.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Widget | `bg_type` | COMBO | "gradient" or "image" |
| Widget | `color1`, `color2` | STRING | Gradient colors (hex) |
| Widget | `image` | COMBO | Image from `assets/customBG/` |
| Widget | `opacity` | FLOAT | Alpha transparency (0.0–1.0) |
| Widget | `scale_mode` | COMBO | "cover" or "fit" |
| Widget | `offset_x`, `offset_y` | INT | Pixel offset for fine positioning |

No inputs or outputs — this is a purely visual design node. Renders "Always at Back" (Z-order behind all other nodes). Double-click to open configuration modal.

**Image location:** Place custom background images (PNG, JPG, SVG, WebP) in `Shima/assets/customBG/`. They will appear in the dropdown automatically.

### Headline

A transparent label node for organizing workflow sections. Draws embossed text with no background, rendering cleanly over Backdrop nodes.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `text` | STRING | Display text |
| Widget | `font_size` | INT | Font size in pixels |

No inputs or outputs. Can be toggled globally via Custodian.

### Sticker

Displays a decorative image from the sticker library (PNG/SVG). Transparent background.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Widget | `image` | COMBO | Sticker image selection |
| Widget | `scale` | FLOAT | Scale factor |

No inputs or outputs.

**Image location:** Place sticker images in `Shima/sticker_images/PNG/` or `Shima/sticker_images/SVG/`.

### Noodman Sticker

Displays the Shima mascot (Noodman) as a decorative node element.

### Workflow Image Creator

Generates a workflow cover image with text overlay and logo compositing. Supports configurable main and subtitle text with custom fonts, logo placement with drop shadows, and auto-save to disk.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Input | `base_image` | IMAGE | Optional background image (defaults to black 1024×1024) |
| Widget | `text_main` | STRING | Primary text line (e.g. "SDXL") |
| Widget | `text_sub` | STRING | Subtitle text (e.g. "workflow") |
| Widget | `font_name` | COMBO | Font selection from `Shima/fonts/` |
| Widget | `main_font_size` | INT | Main text size (10–500) |
| Widget | `sub_font_size` | INT | Subtitle size (10–500) |
| Widget | `subtext_position` | COMBO | "Above" or "Below" main text |
| Widget | `logo_file` | COMBO | Logo image from ComfyUI input directory |
| Widget | `logo_position` | COMBO | Placement: corners, center, or center-large |
| Widget | `save_mode` | BOOLEAN | Auto-save to output directory |
| Output | `IMAGE` | IMAGE | Composited cover image |

**Font location:** Place `.ttf` or `.otf` font files in `Shima/fonts/`. They will appear in the dropdown automatically.

---

## Shima/Image

### Preview

Enhanced image preview with save-to-disk and open-in-editor integration.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `images` | IMAGE | Images to preview |
| Widget | `default_folder` | STRING | Save destination path |

### Carousel Preview

Displays multiple images in a scrollable carousel preview.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `images` | IMAGE | Images to display |

### Batch Image Processor

Applies transformations to a batch of images sequentially.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `images` | IMAGE | Batch of images |
| Widget | `operation` | COMBO | Processing operation |
| Output | `IMAGE` | IMAGE | Processed batch |

### Photo Remix

Creative image remixing with style transfer capabilities. Accepts model and conditioning via individual inputs or via `modelcitizen.bndl` and `masterprompt.bndl` bundles (BNDL inputs override individual wires).

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Input | `image` | IMAGE | Source image |
| Input | `positive` | CONDITIONING | Positive conditioning (optional if using masterprompt.bndl) |
| Input | `negative` | CONDITIONING | Negative conditioning (optional if using masterprompt.bndl) |
| Input | `model` | MODEL | Diffusion model (optional if using modelcitizen.bndl) |
| Input | `vae` | VAE | VAE decoder (optional if using modelcitizen.bndl) |
| Input | `modelcitizen.bndl` | BNDL | Model Citizen bundle (auto-extracts model + vae) |
| Input | `masterprompt.bndl` | BNDL | Master Prompt bundle (auto-extracts pos + neg conditioning) |
| Widget | `resolution_mode` | COMBO | Source, SDXL Buckets, SD1.5 Buckets, or Custom |
| Widget | `denoise` | FLOAT | Denoising strength (default 0.60) |
| Output | `IMAGE` | IMAGE | Remixed image |
| Output | `LATENT` | LATENT | Sampled latent |

### Brightness/Contrast

Simple brightness and contrast adjustment.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Input image |
| Widget | `brightness` | FLOAT | Brightness adjustment (-1.0 to 1.0) |
| Widget | `contrast` | FLOAT | Contrast adjustment (-1.0 to 1.0) |
| Output | `IMAGE` | IMAGE | Adjusted image |

### Image Flip

Flips images horizontally or vertically.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Input image |
| Widget | `flip_mode` | COMBO | "horizontal", "vertical", or "both" |
| Output | `IMAGE` | IMAGE | Flipped image |

### Gaussian Blur

Applies Gaussian blur with configurable radius.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Input image |
| Widget | `radius` | INT | Blur radius |
| Output | `IMAGE` | IMAGE | Blurred image |

### Flatten Colors

Reduces number of distinct colors in the image (posterization).

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Input image |
| Widget | `levels` | INT | Number of color levels |
| Output | `IMAGE` | IMAGE | Flattened image |

### Hue Rotation

Rotates the hue channel of the image by a specified degree.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Input image |
| Widget | `degrees` | FLOAT | Hue rotation in degrees |
| Output | `IMAGE` | IMAGE | Hue-shifted image |

### Swap Color Mode

Converts between color modes (RGB ↔ BGR, etc.).

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Input image |
| Widget | `mode` | COMBO | Target color mode |
| Output | `IMAGE` | IMAGE | Converted image |

### Instagram Filters

Applies stylized image filters mimicking popular social media looks.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Input image |
| Widget | `filter_name` | COMBO | Filter selection |
| Output | `IMAGE` | IMAGE | Filtered image |

### Glitch Effect

Applies digital glitch artifacts to the image.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Input image |
| Widget | `intensity` | FLOAT | Glitch intensity |
| Output | `IMAGE` | IMAGE | Glitched image |

---

## Shima/Latent

### Latent Maker

Creates empty latent tensors at specified dimensions, with aspect ratio presets.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `width` | INT | Width in pixels |
| Widget | `height` | INT | Height in pixels |
| Widget | `batch_size` | INT | Number of latents |
| Widget | `show_used_values` | BOOLEAN | Display passed values |
| Widget | `allow_external_linking` | BOOLEAN | Topbar toggle |
| Output | `LATENT` | LATENT | Empty latent tensor |
| Output | `latentmaker.bndl` | BNDL | Bundle containing the latent |

---

## Shima/Loaders

### Model Citizen

Unified model loader for checkpoint, CLIP, and VAE. Supports LoRA stacking.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `ckpt_name` | COMBO | Checkpoint selection |
| Widget | `vae_name` | COMBO | VAE selection ("baked" = use checkpoint's built-in) |
| Widget | `show_used_values` | BOOLEAN | Display passed values |
| Widget | `allow_external_linking` | BOOLEAN | Topbar toggle |
| Input | `lora_stack` | LORA_STACK | Optional LoRA stack input |
| Output | `MODEL` | MODEL | Loaded model |
| Output | `CLIP` | CLIP | CLIP text encoder |
| Output | `VAE` | VAE | VAE decoder |
| Output | `modelcitizen.bndl` | BNDL | Bundle containing all three |

### Lora Stack

Stacks multiple LoRA models for application by Model Citizen.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `lora_1`, `lora_2`, `lora_3` | COMBO | LoRA model selections |
| Widget | `weight_1`, `weight_2`, `weight_3` | FLOAT | LoRA strengths |
| Input | `lora_stack` | LORA_STACK | Optional upstream stack |
| Output | `LORA_STACK` | LORA_STACK | Combined LoRA stack |

---

## Shima/Output

### File Saver

Saves images to disk with configurable naming patterns.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `images` | IMAGE | Images to save |
| Input | `filename_prefix` | STRING | Filename pattern |
| Widget | `format` | COMBO | "png", "jpg", "webp" |
| Widget | `quality` | INT | JPEG/WebP quality (1–100) |

### MultiSaver

Multi-format image saver with integrated processing pipelines. Each output type can be independently enabled and has its own sub-settings accessible via icon toggles.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Input | `images` | IMAGE | Images to save |
| Widget | `save_original` | BOOLEAN | Save the original image |
| Widget | `save_lineart` | BOOLEAN | Extract and save lineart (Nikosis-style sketch) |
| Widget | `save_canny` | BOOLEAN | Extract and save Canny edge detection |
| Widget | `save_depth` | BOOLEAN | Generate and save depth map |
| Widget | `save_normal` | BOOLEAN | Generate and save normal map |
| Widget | `save_highlight` | BOOLEAN | Generate and save highlight/shadow mask |
| Widget | `save_palette` | BOOLEAN | Extract and save color palette grid with hex codes |
| Widget | `format` | COMBO | Output format |
| Widget | `user_notes` | STRING | Metadata notes to embed |

---

## Shima/Panels

Panel nodes present a compact PCB-style chassis designed for minimal wiring. All panels share a double-click-to-configure modal and output BNDL wires.

### Panel Model Citizen

Panelized version of Model Citizen. Single BNDL output containing MODEL, CLIP, and VAE.

### Panel Master Prompt

Panelized version of Master Prompt. Single BNDL output containing positive and negative CONDITIONING.

### Panel Latent Maker

Panelized version of Latent Maker. Single BNDL output containing a LATENT tensor.

### Panel Sampler

Virtual sampler that expands at execution time into a full DeBNDLer → Shima.Sampler → ReBNDLer pipeline via the macro expander. Outputs IMAGE, LATENT, and the combined shimasampler.bndl.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `modelcitizen.bndl` | BNDL | Model Citizen bundle |
| Input | `masterprompt.bndl` | BNDL | Master Prompt bundle |
| Input | `latentmaker.bndl` | BNDL | Latent Maker bundle |
| Input | `shima.commonparams` | SHIMA_COMMON | Common parameters |
| Output | `IMAGE` | IMAGE | Generated image |
| Output | `LATENT` | LATENT | Final latent |
| Output | `shimasampler.bndl` | BNDL | Combined output bundle |

### Setup Hub

Central configuration and dependency management node. Checks for required assets, allows selection of style thumbnail packs, and provides a custom download URL field for pack updates. This node doesn't process any data in the workflow — it's a UI anchor for the Shima Bootstrap system.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Widget | `active_pack` | COMBO | Style thumbnail pack to use |
| Widget | `auto_update` | BOOLEAN | Enable automatic pack updates |
| Input | `custom_download_url` | STRING | Override URL for pack downloads |
| Output | `STATUS` | STRING | Current pack and update status |

### Common Params Passer

Unpacker node for Shima Common Params bundles. Takes a `shima.commonparams` dictionary and breaks it into individual typed outputs (seed, width, height, project name, save path, collision ID, timestamp) for use with non-Shima nodes that need these values individually.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Input | `shima_commonparams` | DICT | Shima.Commons bundle |
| Output | `shima.commonparams` | DICT | Pass-through of the full bundle |
| Output | `SEED` | INT | Seed value |
| Output | `WIDTH` | INT | Target width |
| Output | `HEIGHT` | INT | Target height |
| Output | `PROJECT_NAME` | STRING | Project name |
| Output | `SAVE_PATH` | STRING | Save directory path |
| Output | `COLLISION_ID` | STRING | Unique run ID |
| Output | `TIMESTAMP` | STRING | Execution timestamp |

---

## Shima/Routing

### Breaker

A switch-style reroute node that can enable/disable signal flow for a collection of Panel Switches. Renders as a physical toggle switch with configurable appearance. This node is the master control for the panel system. It can be configured in either "breaker mode, in which all connected panel switches will take on the Breaker's state, or toggle mode where it will invert the current state of connected nodes.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `*` | * | Any signal type |
| Widget | `state` | COMBO | "on", "off", or "bypass" |
| Widget | `scale` | FLOAT | Visual scale factor |
| Output | `*` | * | Pass-through or bypass |

### Panel Switch

Companion to Breaker — receives the Breaker's state and applies bypass logic to downstream nodes. Renders as a compact toggle without a title bar.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `*` | * | Any signal type |
| Output | `*` | * | Pass-through signal |
| Output | `BOOLEAN` | BOOLEAN | Current switch state |

### Bundle Extractors (DeBNDLers) & Packers (ReBNDLers)

Many Shima nodes output "BNDL" wires to significantly reduce canvas clutter. To unpack these bundles for use with standard ComfyUI nodes, or to pack standard wires into a BNDL, use the discrete DeBNDLer and ReBNDLer nodes.

*Design Note: Previously, Shima utilized a single dynamic "DeBNDLer" and "ReBNDLer" with a dropdown menu to change types. We valiantly attempted to make this more elegant dynamic solution work, but due to internal ComfyUI serialization quirks, dynamic ports would often drop connections upon workflow reload. We pivoted to explicit, discrete nodes to guarantee rock-solid workflow stability and serialization.*

**DeBNDLer / ReBNDLer (Model Citizen)**  
Unpacks or packs the Model Citizen bundle.
- **Inputs/Outputs:** `Model` (MODEL), `Clip` (CLIP), `VAE` (VAE), and `name_string` (STRING)

**DeBNDLer / ReBNDLer (Master Prompt)**  
Unpacks or packs the Master Prompt conditioning bundle.
- **Inputs/Outputs:** `positive` (CONDITIONING), `negative` (CONDITIONING), `CLIP_L_ONLY` (CONDITIONING), `CLIP_G_ONLY` (CONDITIONING), `T5_ONLY` (CONDITIONING), `pos_string` (STRING), `neg_string` (STRING)

**DeBNDLer / ReBNDLer (Latent Maker)**  
Unpacks or packs the Latent Maker bundle.
- **Inputs/Outputs:** `latent` (LATENT), `s33d` (INT), `width` (INT), `height` (INT)

**DeBNDLer / ReBNDLer (Shima Sampler)**  
Unpacks or packs the Shima Sampler final output bundle.
- **Inputs/Outputs:** `Image` (IMAGE), `Latent` (LATENT), `Seed Used` (INT)

### Smart Routes (Route1–Route5)

Named pass-through reroute nodes with color-coded labels. 5 variants (Route1 through Route5) for organizing wire runs without functionality changes. The directionality of the wiring can be changed to allow for precision layouts with easy-to-follow wiring.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `*` | * | Any type |
| Output | `*` | * | Same type pass-through |

### Multi-Pipe In/Out (15-input / XL variants)

Legacy multi-input/output pipe nodes for bundling up to 15 signals. Route up to 15 typed connections through a single path.

### Packers (ModelCitizen / LatentMaker / MasterPrompt)

Internal nodes that construct BNDL dictionaries from individual typed inputs. Used internally by generator nodes to create their `.bndl` outputs.

---

## Shima/Sampling

### Sampler

Core KSampler wrapper with integrated seed management, scheduler selection, and HiRes Fix support.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `model` | MODEL | Diffusion model |
| Input | `positive` | CONDITIONING | Positive conditioning |
| Input | `negative` | CONDITIONING | Negative conditioning |
| Input | `latent_image` | LATENT | Starting latent |
| Input | `vae` | VAE | VAE for image decode |
| Widget | `steps` | INT | Sampling steps |
| Widget | `cfg` | FLOAT | CFG scale |
| Widget | `sampler_name` | COMBO | Sampler algorithm |
| Widget | `scheduler` | COMBO | Noise scheduler |
| Widget | `seed` | INT | Random seed |
| Widget | `denoise` | FLOAT | Denoising strength |
| Output | `LATENT` | LATENT | Sampled latent |
| Output | `IMAGE` | IMAGE | Decoded image |
| Output | `INT` | INT | Seed used |

### Seed Controller

Provides deterministic seed management with increment/decrement/randomize modes.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `seed` | INT | Base seed value |
| Widget | `mode` | COMBO | "fixed", "increment", "decrement", "randomize" |
| Output | `INT` | INT | Seed value |

---

## Shima/Styler

### Styler (Selector)

Browse and select art styles from the Shima style library. Injects positive/negative prompt modifiers.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `positive` | CONDITIONING | Base positive conditioning |
| Input | `negative` | CONDITIONING | Base negative conditioning |
| Input | `clip` | CLIP | CLIP model |
| Widget | `style` | COMBO | Style selection |
| Output | `positive` | CONDITIONING | Styled positive conditioning |
| Output | `negative` | CONDITIONING | Styled negative conditioning |
| Output | `style_mode` | STRING | Applied style name |

### Styler (Iterator)

Batch-iterates through multiple styles, generating one output per style.

### Styler (Gallery)

Visual gallery browser for the style library with thumbnail previews.

### Styler (Favorites)

Manages a favorites list of frequently-used styles for quick access.

---

## Shima/System

### Control Panel

A floating panel that can wirelessly mirror widgets from any other node. Right-click a widget on any node and choose "Pin to Shima Control Panel" to add it. Dragging pinned sliders/inputs automatically syncs the value to the original node.

### Canary

Ghost process detector — scans for stale ComfyUI processes consuming VRAM and alerts the user.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Output | `STRING` | STRING | Detection report |

### Custodian

System management node with global toggles for Dymo Labels, Headlines, and pycache cleanup.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `show_dymos` | BOOLEAN | Global Dymo Label visibility |
| Widget | `show_headlines` | BOOLEAN | Global Headline visibility |
| Widget | `clean_pycache` | BOOLEAN | Trigger pycache cleanup |

### System Buffer

Manages ComfyUI system memory allocation and buffer settings.

### Seed Logger

Logs all seeds used during execution for reproducibility tracking. Clicking a seed copies it to the clipboard for easy re-use.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `seed` | INT | Seed to log |
| Output | `INT` | INT | Same seed (pass-through) |

### NSFW Content Checker

Scans generated images for NSFW content. and ca output black-bar, mosaic, and blurred output with G - NC-17 ratings displayed on thumbnails.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `image` | IMAGE | Image to check |
| Output | `IMAGE` | IMAGE | Pass-through image |
| Output | `FLOAT` | FLOAT | NSFW confidence score |

### Hardware Indicators

Interactive, visually-rich control room elements:

**Pilot Light** — Single LED indicator that reacts to input signals (Boolean, String, Math, or Tensor triggers). Scales proportionally and supports neutral-colored link ports.

**Multi-State Indicator** — Three-state control room indicator rendered as a rounded-corner square (distinct from the circular Pilot Light). Supports 6 trigger modes configured via double-click modal:

- **Hardware Sync** — reads switch/bypass state from connected node in real-time
- **Number Match** — exact numeric equality (`input == State 1 Value` → green, `input == State 2 Value` → red)
- **Math** — comparison expressions using `>`, `<`, `>=`, `<=`, `==`, `!=` (e.g., `>1.0` → State 1, `>2.0` → State 2)
- **String** — exact string match
- **Regex** — regex pattern match (`re.search`)
- **Boolean** — truthy input → State 1 (green), falsy → State 2 (red)

Passes the input value through to a `value` output for downstream use. Colors for each state are configurable in the modal.

**RGB Logic Array** — Three-channel (R, G, B) logic evaluator with additive color blending on a rendered lens. Supports Boolean, Number, Hardware Sync, and String Eval modes. Draws mode designators (TF, >0, HS, SE) on the lens.

**Dymo Label** — Embossed text label with colored tape. Renders "Always on Top" with custom font support and optional "jitter" for the angle of the tape.

### Interactive Hardware Controls

Physical-style hardware controls for interactive parameter adjustment. Controlled via a right click menu on the node:

**Fader** — Vertical drag-to-set fader with gradient cap, dual LED bars, and digital readout.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `value` | FLOAT | Current fader value |
| Widget | `min_val`, `max_val` | FLOAT | Value range |
| Output | `FLOAT` | FLOAT | Output value |

**Rotary Encoder (Knob)** — Endless encoder with metallic cap and radial LED arc.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `value` | FLOAT | Current knob value |
| Widget | `min_val`, `max_val` | FLOAT | Value range |
| Output | `FLOAT` | FLOAT | Output value |

**Omnijog** — A multi-channel parameter controller styled as a spring-loaded shuttle wheel. Supports up to 20 independently-labeled channels, each with its own value, step size, and LED color. The Omnijog renders as a single compact node — the shuttle wheel scrolls through channels, and +/- stepper buttons adjust the active channel's value with self-accelerating hold loops.

The digital readout displays the active channel's current value. When the active channel is wired through a DemuxList node, the readout switches from the numeric value to the corresponding string label from the DemuxList's options array.

All channel values and the active channel selection are persisted in the workflow. The Omnijog outputs a single multiplexed (MUX) signal that carries all channel values with their labels, which Demux nodes downstream can filter by channel name.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Widget | `active_channel` | STRING | Currently selected channel |
| Widget | `val_0`–`val_19` | FLOAT | Channel values (hidden, JS-managed) |
| Widget | `label_0`–`label_19` | STRING | Channel labels (default: CFG, SEED, LORA1–LORA18) |
| Widget | `step_0`–`step_19` | FLOAT | Per-channel step size |
| Widget | `colors` | STRING | Comma-separated hex colors for channel LEDs |
| Widget | `rows` | INT | Number of LED bar rows (2–20) |
| Widget | `scale` | FLOAT | Visual scale factor |
| Output | `MUX` | MUX_SIGNAL | Multiplexed output carrying all channel values |

**Demux** — Filters a MUX signal by channel. Configurable label visibility.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `mux` | MUX_SIGNAL | Multiplexed input |
| Widget | `target_channel` | COMBO | Channel to extract |
| Output | `FLOAT` | FLOAT | Extracted value |

**Demux List** — Converts an active MUX integer channel to a STRING output via an options array. Traces downstream connections to auto-populate dropdown options.

---

## Shima/Utilities

### Passers

Utility nodes that provide optional-input pass-throughs. Their inputs are optional, preventing ComfyUI's auto-wiring from incorrectly filling required inputs with mismatched types. Use these as stable targets for "Use Everywhere" broadcasting and as protective plugs on unused inputs.

| Node | Pass-Through Type | Description |
|------|-------------------|-------------|
| **Image Pass** | IMAGE | Most commonly used passer |
| **Latent Pass** | LATENT | Latent tensor pass-through |
| **Model Pass** | MODEL | Model pass-through |
| **CLIP Pass** | CLIP | CLIP pass-through |
| **VAE Pass** | VAE | VAE pass-through |
| **Mask Pass** | MASK | Mask pass-through |
| **Conditioning Pass** | CONDITIONING | Single conditioning pass-through |
| **Pos/Neg Pass** | CONDITIONING × 2 | Dual positive + negative pass-through |
| **SDXL Tuple Pass** | Tuple | SDXL-specific tuple pass-through |
| **MultiPass** | Multiple | Multi-type pass-through (SD 1.5) |
| **MultiPassXL** | Multiple | Multi-type pass-through (SDXL) |
| **Placeholder Tuple** | Tuple | Fills empty tuple inputs to prevent workflow breakage |
| **Controlnet Preproc Bus** | Multiple | Controlnet preprocessor routing bus |
| **Common Params** | SHIMA_COMMON | Shared parameter block (used by Panel system) |
| **Params Placeholder** | SHIMA_COMMON | Placeholder for common params when not needed |

### String Operations

**String Concat** — Concatenates two or more strings with a configurable separator.

**String Splitter** — Splits a string by delimiter and outputs individual segments.

**String Switch** — Selects between two string inputs based on a boolean condition.

### Choice Switch

Multi-option selector switch with configurable option count.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Widget | `choice` | COMBO | Active selection |
| Input | `option_1`–`option_n` | * | Switchable inputs |
| Output | `*` | * | Selected option |

### The Nothing

A universal pass-through node that accepts any input type and outputs it unchanged. Useful for routing organization when you need a type-agnostic relay point — it accepts IMAGE, LATENT, MODEL, CONDITIONING, or any other type and passes it straight through.

| Direction | Name | Type | Description |
|-----------|------|------|--------------|
| Input | `any_input` | * | Any type |
| Output | `any_output` | * | Same value, same type |

### Highway System

A set of nodes for conditional routing with synchronization:

**Highway Bypass** — Routes a signal through or around a processing chain based on a boolean switch. All inputs are optional.

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `*` | * | Any signal |
| Widget | `active` | BOOLEAN | Enable/bypass the highway |
| Output | `*` | * | Routed signal |

**Highway Detour** — Entrance ramp to a highway segment. Receives a `route_automate` signal from Choice Switch nodes for programmatic routing.

**Highway Merge** — Exit ramp from a highway segment. Syncs visually with its paired Detour node.

**Highway Bypass Terminator** — Stop node that prevents bypass traversal from leaking beyond a defined boundary.

### Transformer

Conditional string routing with pattern matching. Supports an "Atomic Switch" syntax using `|||` delimiters for multi-branch conditional routing, along with unconditional catch-all mode. Includes variable injection (`!!!`, `@@@`, `###`, `$$$`) and type inference (auto-casts strings to INT, FLOAT, or BOOLEAN where possible).

| Direction | Name | Type | Description |
|-----------|------|------|-------------|
| Input | `input` | STRING | String to evaluate |
| Input | `stream` | STRING | Mapping rules (multiline) |
| Input | `var_!!!`, `var_@@@`, etc. | * | Variable injection inputs |
| Widget | `output_all_as_strings` | BOOLEAN | Force string output |
| Output | `result` | * | Matched result |
| Output | `type` | STRING | Inferred output type name |

### Primitives

**Int** — Simple integer value source.

**Float** — Simple float value source.

**String** — Simple string value source (with multiline support).

### Rich Content / Rich Display

**Content** — Markdown/HTML content display node. Can display markdown, URLs, iframe websites (the site must allow iFrame display) and youtube videos.

**Rich Display** — Enhanced text display with formatting.

### Binary Int Switch

Outputs 0 or 1 based on a boolean toggle.

### Add Font Text

Renders text onto an image using a specified TrueType font. Supports positioning, rotation, color (RGBA), and anchor point.

**Font location:** The `font_ttf` input accepts the full path to a `.ttf` file. For convenience, place fonts in `Shima/fonts/` and reference them by path.

---

## Shima/Hidden

These nodes do not appear in the right-click menu. They are used internally by other Shima systems.

### Inspector

Development debugging tool — displays detailed node and connection metadata.

### Data Preview Test

Internal test node for previewing data structures.
