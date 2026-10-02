---
"preact-suspense": patch
---

Keep the state of mounted children when they suspend again. On Preact 11, the boundary parks the mounted subtree while the fallback shows, instead of unmounting it, and reveals it once the promises settle. Effects of parked components are cleaned up and run again when they are revealed.
