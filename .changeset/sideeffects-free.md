---
"preact-suspense": minor
---

Mark the package as side-effect free. The Preact `options` hooks used by `Suspense` and `lazy` are now installed lazily on first use (when a `Suspense` component is constructed or `lazy()` is called) instead of at module evaluation, and `"sideEffects": false` has been added to `package.json` so bundlers can tree-shake unused exports.
