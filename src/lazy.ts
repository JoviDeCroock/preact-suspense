import { createElement, options, type FunctionComponent } from 'preact';
import { useState, useRef } from 'preact/hooks';

let diffHookInstalled = false;
function installDiffHook() {
  if (diffHookInstalled) return;
  diffHookInstalled = true;

  const oldDiff = (options as any).__b;
  (options as any).__b = (vnode: any) => {
    if (vnode.type && vnode.type._forwarded && vnode.ref) {
      vnode.props.ref = vnode.ref;
      vnode.ref = null;
    }
    if (oldDiff) oldDiff(vnode);
  };
}

/**
 * Create a lazily-loaded component. The `load` function should return
 * a promise that resolves to a module with a `default` export (the component).
 *
 * Usage:
 *   const MyComponent = lazy(() => import('./MyComponent'));
 *
 * When rendered inside a <Suspense>, the fallback will be shown until
 * the component module is loaded.
 */
export function lazy<T extends FunctionComponent<any>>(
  load: () => Promise<{ default: T } | T>
): T & { preload: () => Promise<T> } {
  installDiffHook();

  let promise: Promise<T> | undefined;
  let component: T | undefined;
  let error: unknown;
  let failed = false;

  const loadModule = (): Promise<T> => {
    if (!promise) {
      promise = load().then((m: any) => (component = (m && m.default) || m));
      // Record a failed load so it is thrown to the nearest error boundary
      // instead of retrying the same rejected promise from `<Suspense>`.
      promise.then(undefined, (e) => {
        error = e;
        failed = true;
      });
    }
    return promise;
  };

  const LazyComponent: FunctionComponent<any> = (props) => {
    const [, update] = useState(0);
    const ref = useRef(false);

    const promise = loadModule();
    if (failed) throw error;
    if (component !== undefined) return createElement(component, props);
    if (!ref.current) {
      ref.current = true;
      const rerender = () => update(1);
      promise.then(rerender, rerender);
    }
    throw promise;
  };

  (LazyComponent as any).preload = loadModule;

  (LazyComponent as any)._forwarded = true;
  LazyComponent.displayName = 'Lazy';

  return LazyComponent as any;
}
