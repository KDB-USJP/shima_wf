"""
Shima DepthAnythingV2 - Self-contained depth estimation

Architecture adapted from:
- DINOv2 (Meta Platforms, Inc.) - Apache License 2.0
- DPT Head (Nikosis) - MIT License

Original repositories:
- https://github.com/facebookresearch/dinov2
- https://github.com/Nikosis/ComfyUI-Nikosis-Preprocessors

MIT License (Nikosis portions)
==============================
Copyright (c) 2025 Nikosis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

Apache License 2.0 (Meta DINOv2 portions)
=========================================
See: https://www.apache.org/licenses/LICENSE-2.0
"""

from .dpt import DepthAnythingV2
from .dinov2 import DINOv2

__all__ = ["DepthAnythingV2", "DINOv2"]
