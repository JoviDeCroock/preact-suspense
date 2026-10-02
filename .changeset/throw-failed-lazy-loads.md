---
"preact-suspense": patch
---

Throw failed `lazy()` loads to the nearest error boundary. A rejected loader used to keep the fallback visible, retry the rejected promise and cause unhandled rejections.
