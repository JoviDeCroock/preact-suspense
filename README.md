# preact-suspense

A lightweight Suspense implementation for [Preact](https://preactjs.com/), inspired by [preact-iso](https://github.com/preactjs/preact-iso).

> [!NOTE]
> Do not use this together with `preact/compat` - use the native
> `Suspense` there.

## Features

- **Fallback rendering** — when a child throws a promise, renders a `fallback` (or nothing if omitted)
- **Hydration-aware** — during hydration (`MODE_HYDRATE` / `__h`), server-rendered HTML is kept alive until the promise resolves, avoiding layout flashes
- **`lazy()`** — code-split components that suspend until their module is loaded, with a `.preload()` method for eager loading

## Install

```bash
npm install preact-suspense
```

## Usage

### Suspense + lazy

```jsx
import { Suspense, lazy } from 'preact-suspense';

const Profile = lazy(() => import('./Profile'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Profile />
    </Suspense>
  );
}
```

### Preloading

```js
import { lazy } from 'preact-suspense';

const Profile = lazy(() => import('./Profile'));

// Start loading before the component is rendered
Profile.preload();
```

### Suspense with no fallback

If no `fallback` is provided, the Suspense boundary renders nothing while suspended:

```jsx
<Suspense>
  <AsyncChild />
</Suspense>
```

### Hydration

When used with Preact's `hydrate()`, the existing server-rendered HTML is preserved until the suspending promise resolves. No fallback is shown during hydration — the SSR markup remains visible.

```jsx
import { hydrate } from 'preact';
import { Suspense, lazy } from 'preact-suspense';

const Page = lazy(() => import('./Page'));

hydrate(
  <Suspense fallback={<div>Loading...</div>}>
    <Page />
  </Suspense>,
  document.getElementById('app')
);
// The server-rendered HTML stays visible until Page resolves
```

### Nested Suspense boundaries

Each `<Suspense>` boundary catches promises from its own subtree. Inner boundaries handle their children independently:

```jsx
<Suspense fallback={<div>Outer loading...</div>}>
  <Header />
  <Suspense fallback={<div>Inner loading...</div>}>
    <LazyContent />
  </Suspense>
</Suspense>
```

## API

### `Suspense`

```ts
import { Suspense } from 'preact-suspense';
```

| Prop | Type | Description |
|------|------|-------------|
| `fallback` | `ComponentChildren` | Content to render while a child is suspended. If omitted, renders nothing. |
| `children` | `ComponentChildren` | The subtree that may throw promises. |

### `lazy(load)`

```ts
import { lazy } from 'preact-suspense';
```

Creates a lazily-loaded component.

| Parameter | Type | Description |
|-----------|------|-------------|
| `load` | `() => Promise<{ default: T } \| T>` | A function returning a promise that resolves to a component (or module with a `default` export). |

**Returns:** The lazy component, with a `.preload()` method to start loading before render.

## How it works

1. Hooks into Preact's `options.__e` (error/catch handler) to intercept thrown promises
2. Walks up the vnode tree to find the nearest `Suspense` boundary
3. In **normal rendering**: switches to the fallback and re-renders children once the promise settles
4. In **hydration mode**: skips the fallback so existing DOM stays alive, then re-renders on resolution

## License

[MIT](./LICENSE)
