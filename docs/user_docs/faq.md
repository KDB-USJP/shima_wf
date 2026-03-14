# Frequently Asked Questions

## General

**What is Shima?**

Shima is a custom node extension for ComfyUI that provides modular workflow components ("Islands"), a curated art style library, interactive hardware-style controls, and integration with the [shima.wf](https://shima.wf) marketplace.

**Do I need an account to use Shima nodes?**

No. The node extension works fully offline with no account required. The website account is only needed to browse the marketplace and sync purchased Islands.

**Is Shima free?**

The node extension is free and open source. The marketplace on shima.wf uses Noods (a marketplace currency) for purchasing Islands and digital assets from creators.

---

## Installation & Compatibility

**Which ComfyUI version do I need?**

Shima works with any recent version of ComfyUI. If you can run standard custom nodes, Shima should work.

**What Python version is required?**

Python 3.8 or later.

**Does Shima conflict with other custom nodes?**

Shima is designed to coexist with other node packs. The main integration point is "Use Everywhere" — if you use that extension, Shima's Islands will often auto-connect. If you don't, you can wire everything manually.

---

## Islands & Workflows

**What's the difference between a Workflow and an Island?**

A Workflow is a complete end-to-end generation system. An Island is a small, modular fragment that does one thing (e.g., model loading, prompting, post-processing). Islands auto-connect via Use Everywhere when dropped into a workflow. See [Concepts](concepts.md) for a full explanation.

**Do Islands work offline?**

Yes. Once synced from the marketplace, Islands are stored locally and work without an internet connection.

---

## Nodes

**What are "Passers" for?**

Passers provide optional-input pass-throughs that prevent ComfyUI's auto-wiring from incorrectly filling required inputs. They serve as stable landing pads for Use Everywhere broadcasts and as protective plugs on unused inputs. See [Concepts](concepts.md#workflows-vs-islands) for more detail.

**What is a BNDL?**

A Bundle (BNDL) packages multiple related outputs into a single wire. Instead of 6 separate wires for model/clip/vae, a single `modelcitizen.bndl` wire carries them all. See [Concepts](concepts.md#the-bndl-system).

**Where do I put custom assets?**

- Background images: `Shima/assets/customBG/`
- Sticker images: `Shima/sticker_images/PNG/` or `Shima/sticker_images/SVG/`
- Fonts: `Shima/fonts/`

---

## Community

**Where do I get help?**

Join the [Shima Discord](https://discord.gg/vggNspQC3h) for community support, tips, and feature discussions.

**How do I sell my own Islands?**

Create an account on [shima.wf](https://shima.wf), navigate to your library, and use the upload form to list your Island or digital asset for sale.

---

For detailed information on any specific node, see the [Node Reference](Shima_Node_Reference.md).
