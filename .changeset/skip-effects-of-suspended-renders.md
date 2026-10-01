---
"preact-suspense": patch
---

Don't run effects queued by a render that suspended before the component ever committed. During hydration such a component stays mounted while it waits, and those effects used to run before its data was ready.
