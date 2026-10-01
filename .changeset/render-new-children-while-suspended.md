---
"preact-suspense": patch
---

Render new children passed to a `Suspense` boundary while it shows its fallback, instead of waiting for the promise of a child that is no longer rendered. The fallback stays mounted until the new children render or suspend themselves.
