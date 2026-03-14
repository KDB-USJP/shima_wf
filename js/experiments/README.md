# Bottom Toggle Icons - Experimental Approach

## Date: 2026-02-05

## Goal
Add clickable emoji toggle icons to the bottom-right of Shima nodes to control `use_commonparams` and `allow_external_linking` parameters, replacing the need for visible toggle widgets.

## Approach Taken
1. **Created `bottom_toggles.js`**: Utility to draw icons at bottom-right of nodes
   - 🔴/🟢 for `use_commonparams` (off/on)
   - ❌/🔗 for `allow_external_linking` (off/on)
   - Icons positioned 18px from right edge to avoid drag-resize interference
   - Click detection and toggle functionality implemented

2. **Widget Hiding**: Attempted to hide the underlying widgets by setting:
   - `widget.type = "hidden"`
   - `widget.computeSize = () => [0, -4]`
   - `widget.hidden = true`
   - `widget.disabled = true`

3. **Node Sizing**: Attempted to ensure icons visible by:
   - Setting minimum heights (300-550px depending on node type)
   - Adding padding for icon space
   - Setting `userResized` flag for size persistence

## What Worked
✅ Icon drawing and positioning
✅ Click detection and value toggling  
✅ Widget hiding on simple nodes (LatentMaker, Sampler worked)
✅ Visual consistency across nodes

## What Didn't Work
❌ **Node height issues**: Bottom icons frequently cut off, especially on nodes with dynamic content
❌ **MasterPrompt breakage**: Forced sizing broke MasterPrompt's dynamic text box hiding based on `model_type`
❌ **Inconsistent widget hiding**: `use_commonparams` hid successfully but `allow_external_linking` remained visible on some nodes
❌ **Size persistence**: Node sizes didn't always persist across ComfyUI refreshes
❌ **Not universal**: Approach worked differently across node types

## Key Files
- `bottom_toggles.js` - Icon drawing and click handling utility
- `*_widgets.js` - Individual node widget files that attempted to use bottom toggles
- `datapreview_test.py` + `datapreview_test_widgets.js` - Test node for experimentation

## Lessons Learned
1. Widget hiding is complex - `type = "hidden"` works but widgets can still render
2. Forcing node sizes breaks dynamic sizing behavior (especially MasterPrompt)
3. Bottom positioning is problematic - icons get cut off or interfere with drag-resize
4. Different node types need different approaches (simple vs text-box nodes)

## Possible Future Directions
1. **Top-centered icons** instead of bottom-right
2. **Don't hide widgets** - just add icons as visual convenience
3. **Per-node customization** - different strategies for different node types
4. **Title bar badges** - small indicators in node title instead

## Files in This Directory
- `bottom_toggles.js` - Main implementation
- `*_widgets.js` - Individual node attempts
- `datapreview_test.py` - Test node Python definition
- `datapreview_test_widgets.js` - Test node widget implementation
- `README.md` - This file
