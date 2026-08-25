---
"preact-suspense": patch
---

Fix `Suspense` being invisible to `preact-render-to-string`'s streaming renderer.

`render()` returned a single keyless Fragment, which the renderer unwraps — so a
suspending child's promise surfaced in the boundary's own frame, where the
boundary walk could not see it, and streaming failed with
`Use "renderToStringAsync" for suspenseful rendering.` Both branches now return
an array, which keeps the boundary a distinct frame. DOM rendering is unchanged.
