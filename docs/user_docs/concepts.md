# Shima Concepts

This document covers the key ideas behind Shima's design and how its components work together.

---

## Workflows vs. Islands

Understanding this distinction is central to how Shima works.

### Workflows

A **workflow** is a complete, end-to-end generation system. It includes everything needed to go from an empty canvas to a finished output: model loading, prompt encoding, sampling, post-processing, and saving. A workflow is self-contained — you open it, hit Queue, and get results.

Workflows are great for repeatable processes, but they're rigid. Changing one piece often means rewiring large portions of the graph, and sharing workflows with different model preferences or regional settings can be fragile.

### Islands

An **Island** is a small, self-contained workflow fragment designed to do one thing well. Instead of building monolithic workflows, you compose your pipeline from modular Islands that may even auto-connect via the "Use Everywhere" system from Super-Dev Chris Goringe.

Examples of Islands:

- A **Model Loading Island** — loads a checkpoint with specific LoRA stacks and VAE
- A **Prompt Island** — manages positive/negative conditioning with style injection
- A **Post-Processing Island** — applies sharpening, color grading, and saves outputs
- A **ControlNet Island** — preprocesses reference images and injects control signals

Islands can be mixed, matched, swapped, and shared independently. Buy a better post-processing Island from the marketplace? Drop it in and connect it to your existing pipeline.

### How Auto-Connection Works

Islands use the "Use Everywhere" (UE) broadcast system. When a node has `allow_external_linking` enabled (the topbar X icon), its outputs are broadcast to any matching input type across the workflow. Islands are scoped by automatically created and Key ID'd ComfyUI groups — a Model Citizen inside an Island group broadcasts its MODEL, CLIP, and VAE only to nodes that are listening for those types.

Shima's **Passer** nodes play a critical role here. Their optional inputs prevent ComfyUI's auto-wiring from incorrectly connecting mismatched types, while still being valid targets for UE broadcasts. Think of them as stable "airports" at the edge of each Island.

---

## The BNDL System

As workflows grow in complexity, wiring becomes overwhelming. A single sampling pipeline might need 6+ wires (model, clip, vae, positive conditioning, negative conditioning, latent) running between nodes. The **BNDL** (Bundle) system addresses this.

### What is a BNDL?

A BNDL is a dictionary that packages multiple related values into a single wire. Instead of running 6 separate wires from Model Citizen to a sampler, a single `modelcitizen.bndl` wire carries MODEL, CLIP, and VAE together, which is unBNDLed by various supported shima nodes.

### Current BNDL Types

| BNDL Type | Contents | Source Node |
|-----------|----------|-------------|
| `modelcitizen.bndl` | MODEL, CLIP, VAE | Model Citizen |
| `masterprompt.bndl` | Positive + Negative CONDITIONING | Master Prompt |
| `latentmaker.bndl` | LATENT | Latent Maker |
| `shimasampler.bndl` | IMAGE, LATENT (combined output) | Panel Sampler / ReBNDLer |

### Packing and Unpacking

- **DeBNDLer** unpacks a BNDL into individual outputs for use with non-Shima nodes
- **ReBNDLer** packs individual values back into a BNDL for Shima consumption
- Both nodes dynamically show only the inputs/outputs relevant to the selected BNDL type
- Connect the DeBNDLer's `sync` output to the ReBNDLer's `sync` input to auto-match types

---

## The Panel System

Panels are compact, PCB-style versions of Shima's generator and sampler nodes. They trade the standard multi-output layout for a single BNDL wire, resulting in dramatically cleaner wiring. The individual inputs and widgets are accessed via a double-click so that the node remains compact on the canvas.

### Panel Nodes

| Panel | Replaces | Output |
|-------|----------|--------|
| Panel Model Citizen | Model Citizen | `modelcitizen.bndl` |
| Panel Master Prompt | Master Prompt | `masterprompt.bndl` |
| Panel Latent Maker | Latent Maker | `latentmaker.bndl` |
| Panel Sampler | Sampler | IMAGE + LATENT + `shimasampler.bndl` |

### Using Panels

1. Add the three generator panels and a Panel Sampler
2. Wire each generator's BNDL output to the Panel Sampler's matching input
3. Double-click any Panel to open its settings modal
4. Queue — the Panel Sampler internally expands into a full sampling pipeline

Panels are ideal for template workflows and Island construction because they minimize visual clutter while maintaining full configurability behind the double-click modal.

---

## The Highway System

The **Highway** system provides conditional signal routing — the ability to turn parts of your workflow on or off without disconnecting wires.

### Core Components

- **Highway Bypass** — wraps a processing chain. When `active` is true, the signal flows through the chain. When false, it bypasses the entire chain and passes the input straight to the output.
- **Highway Detour** — entrance ramp to a routable segment
- **Highway Merge** — exit ramp that syncs with its paired Detour and merges the selected route back into the main workflow.
- **Highway Bypass Terminator** — prevents bypass logic from leaking past a boundary

### Breakers and Panel Switches

For visual, interactive routing:

- **Breaker** — a physical toggle switch that controls a group of Panel Switches. In "breaker mode" all connected switches mirror the Breaker's state. In "toggle mode" the Breaker inverts connected states.
- **Panel Switch** — placed inline on a wire. When its Breaker is off, the signal is bypassed and downstream nodes are muted.

This system lets you build workflows with toggleable ControlNet paths, optional upscaling chains, or A/B tested prompt variations — all controlled by flipping a single Breaker switch.

---

## Site Integration & the Marketplace

### shima.wf

The [shima.wf](https://shima.wf) website is a companion marketplace where creators sell workflow Islands and digital assets. It is not a cloud generation service — it's a storefront for downloadable content that runs on your own hardware.

### How Buying Works

1. Browse the catalog on shima.wf
2. Purchase using **Noods** (the marketplace currency)
3. Purchased Islands sync to your local ComfyUI via the Setup Hub
4. Islands are stored in your local database and work offline permanently

### For Creators

Creators can upload and sell:

- **Workflow Islands** — modular workflow fragments
- **Digital Assets** — exclusive models, LoRAs, image packs, and training services

Revenue flows directly to creators through the marketplace. The community Discord server serves as the support and collaboration hub for both buyers and sellers.

---

## Discord Community

Shima uses Discord as its primary community platform. The [Discord server](https://discord.gg/vggNspQC3h) serves multiple purposes:

### For Users
- Get help with node setup and workflow construction
- Share workflows and tips with other Shima users
- Report bugs and request features
- Receive notifications about new marketplace listings

### For Creators/Sellers
- Announce new Islands and digital assets
- Provide support for purchased content
- Collaborate with other creators
- Build a following and reputation within the community

### Why Discord?

Discord provides real-time communication, rich media sharing, role-based access, and thread organization — all critical for a creative community. It's a natural fit for sharing workflow screenshots, debugging node setups, and building the kind of collaborative environment that makes open-source tools thrive. The Shima Discord isn't a support ticket system — it's a living community where users and creators help each other.

---

## Settings & Configuration

### Settings Files

| File | Purpose |
|------|---------|
| `config/shima_settings.json` | User preferences (active pack, asset paths, auth) |
| `config/site_default_settings.json` | System defaults (model types, themes, filename templates) |
| `config/auth.json` | Website authentication (local-only, never shared) |

### Key Concepts

- **Asset Packs**: Style thumbnail collections used by the Styler nodes. Multiple packs are available (e.g., "Walking Woman", "Still Life"). Select your active pack in the Setup Hub.
- **Model Types**: Shima recognizes SDXL, SD 1.5, SD3, Flux, AuraFlow, and HunyuanDiT. The model type setting propagates through the Panel system via Common Params.
- **Themes**: Node color palettes for visual organization (loaders, samplers, prompts, etc.)

---

## Further Reading

- **[Getting Started](getting-started.md)** — Installation and first steps
- **[Node Reference](Shima_Node_Reference.md)** — Complete reference for all 97+ Shima nodes
- **[shima.wf](https://shima.wf)** — The marketplace
- **[Discord](https://discord.gg/vggNspQC3h)** — Community support
