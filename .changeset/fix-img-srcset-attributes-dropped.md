---
"rrweb-snapshot": patch
---

fix: rebuilding an `<img>` with both `srcset` and an inlined `rr_dataURL` was silently dropping every other attribute (`class`, `alt`, `sizes`, `decoding`, `loading`, etc.) instead of only backing up `srcset`, because the guard only checked the node's attributes rather than which attribute was currently being applied
