# preact-suspense

## 0.3.0

### Minor Changes

- [#2](https://github.com/JoviDeCroock/preact-suspense/pull/2) [`8fe441e`](https://github.com/JoviDeCroock/preact-suspense/commit/8fe441eebeed14df58ffaba588ce189359adafd9) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Mark the package as side-effect free. The Preact `options` hooks used by `Suspense` and `lazy` are now installed lazily on first use (when a `Suspense` component is constructed or `lazy()` is called) instead of at module evaluation, and `"sideEffects": false` has been added to `package.json` so bundlers can tree-shake unused exports.

## 0.2.0

### Minor Changes

- [`d757778`](https://github.com/JoviDeCroock/preact-suspense/commit/d757778db8f0660986e55ab69eb16eaa30d2f3c4) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Improve bundling a bit
