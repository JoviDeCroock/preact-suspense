---
'preact-suspense': patch
---

Give each `Suspense` boundary its own `useId` counter. Ids inside a boundary used to depend on when it resolved, so a boundary the server rendered last could hand its ids to siblings that came after it, and a client that didn't suspend while hydrating got different ids than the server. Ids inside a boundary now look like `PP0-1-0`.
