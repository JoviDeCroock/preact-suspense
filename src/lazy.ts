import { createElement, options, type FunctionComponent } from 'preact';
import { useState, useRef } from 'preact/hooks';

const oldDiff = (options as any).__b;
(options as any).__b = (vnode: any) => {
  if (vnode.type && vnode.type._forwarded && vnode.ref) {
    vnode.props.ref = vnode.ref;
    vnode.ref = null;
  }
  if (oldDiff) oldDiff(vnode);
};

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
  let promise: Promise<T> | undefined;
  let component: T | undefined;

  const loadModule = (): Promise<T> =>
    load().then((m: any) => {
      component = (m && m.default) || m;
      return component!;
    });

  const LazyComponent: FunctionComponent<any> = (props) => {
    const [, update] = useState(0);
    const ref = useRef(component);

    if (!promise) promise = loadModule();
    if (component !== undefined) return createElement(component, props);
    if (!ref.current) {
      ref.current = undefined as any;
      promise.then(() => update(1));
    }
    throw promise;
  };

  (LazyComponent as any).preload = () => {
    if (!promise) promise = loadModule();
    return promise;
  };

  (LazyComponent as any)._forwarded = true;
  LazyComponent.displayName = 'Lazy';

  return LazyComponent as any;
}
