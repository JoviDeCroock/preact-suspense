---
"preact-suspense": patch
---

Resume a component that suspended during hydration when another component wraps it. It used to keep the server markup without ever getting its event listeners.
