# preact-suspense

## 0.3.3

### Patch Changes

- [#8](https://github.com/JoviDeCroock/preact-suspense/pull/8) [`e7452c8`](https://github.com/JoviDeCroock/preact-suspense/commit/e7452c85798b9ff5dadc4d5531ea2e6309694bd3) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Resume a component that suspended during hydration when another component wraps it. It used to keep the server markup without ever getting its event listeners.

- [#9](https://github.com/JoviDeCroock/preact-suspense/pull/9) [`1f3552c`](https://github.com/JoviDeCroock/preact-suspense/commit/1f3552cc086c937f00d15e18b99ff12945cc4a9c) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Give each `Suspense` boundary its own `useId` counter. Ids inside a boundary used to depend on when it resolved, so a boundary the server rendered last could hand its ids to siblings that came after it, and a client that didn't suspend while hydrating got different ids than the server. Ids inside a boundary now look like `PP0-1-0`.

## 0.3.2

### Patch Changes

- [`c8afbf5`](https://github.com/JoviDeCroock/preact-suspense/commit/c8afbf555c8190b0df5d4b8a33ae663c7d848a6e) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Keep the state of mounted children when they suspend again. On Preact 11, the boundary parks the mounted subtree while the fallback shows, instead of unmounting it, and reveals it once the promises settle. Effects of parked components are cleaned up and run again when they are revealed.

- [`c8afbf5`](https://github.com/JoviDeCroock/preact-suspense/commit/c8afbf555c8190b0df5d4b8a33ae663c7d848a6e) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Throw failed `lazy()` loads to the nearest error boundary. A rejected loader used to keep the fallback visible, retry the rejected promise and cause unhandled rejections.

## 0.3.1

### Patch Changes

- [`871d9ef`](https://github.com/JoviDeCroock/preact-suspense/commit/871d9efd20bec0b02bbab72b37e5fe4d5c42e14e) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Render new children passed to a `Suspense` boundary while it shows its fallback, instead of waiting for the promise of a child that is no longer rendered. The fallback stays mounted until the new children render or suspend themselves.

- [`8adca7f`](https://github.com/JoviDeCroock/preact-suspense/commit/8adca7ff39d6b529fae7c40cc1efba5e297b6913) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Don't run effects queued by a render that suspended before the component ever committed. During hydration such a component stays mounted while it waits, and those effects used to run before its data was ready.

- [#4](https://github.com/JoviDeCroock/preact-suspense/pull/4) [`dab0d8c`](https://github.com/JoviDeCroock/preact-suspense/commit/dab0d8cf828e5cd109b85aefecf6e647ba4789f6) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Allow installing preact-suspense with Preact 11, including prerelease versions.

## 0.3.0

### Minor Changes

- [#2](https://github.com/JoviDeCroock/preact-suspense/pull/2) [`8fe441e`](https://github.com/JoviDeCroock/preact-suspense/commit/8fe441eebeed14df58ffaba588ce189359adafd9) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Mark the package as side-effect free. The Preact `options` hooks used by `Suspense` and `lazy` are now installed lazily on first use (when a `Suspense` component is constructed or `lazy()` is called) instead of at module evaluation, and `"sideEffects": false` has been added to `package.json` so bundlers can tree-shake unused exports.

## 0.2.0

### Minor Changes

- [`d757778`](https://github.com/JoviDeCroock/preact-suspense/commit/d757778db8f0660986e55ab69eb16eaa30d2f3c4) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Improve bundling a bit
