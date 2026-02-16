import { Component, options, createElement, Fragment, type VNode, type ComponentChildren } from 'preact';

// Preact internal flags
const MODE_HYDRATE = 1 << 5;

// Mangled internal property names used by Preact:
// __e = _catchError (options hook)
// __   = _parent (on vnode)
// __c  = _component (on vnode)
// __e  = _dom (on vnode) — same mangled key, different context
// __k  = _children (on vnode)
// __u  = _flags (on vnode)
// __h  = _hydrating (on vnode, boolean in preact-iso convention)

interface InternalVNode extends VNode {
  __?: InternalVNode;        // _parent
  __c?: InternalComponent;   // _component
  __e?: Element | Text;      // _dom
  __k?: InternalVNode[];     // _children
  __u?: number;              // _flags
  __h?: boolean;             // _hydrating (preact-iso convention)
}

interface InternalComponent extends Component {
  __c?: (error: Promise<any>, suspendingVNode: InternalVNode) => void; // _childDidSuspend
  __v?: InternalVNode;       // _vnode
}

interface SuspenseProps {
  fallback?: ComponentChildren;
  children?: ComponentChildren;
}

interface SuspenseState {
  suspended: boolean;
}

// Hook into Preact's error catching mechanism (options.__e / options._catchError)
const oldCatchError = (options as any).__e;
(options as any).__e = function (
  err: any,
  newVNode: InternalVNode,
  oldVNode: InternalVNode,
  errorInfo?: any
) {
  if (err && err.then) {
    // Walk up the vnode tree to find a Suspense boundary
    let v: InternalVNode | undefined = newVNode;
    while ((v = v!.__)) {
      if (v.__c && (v.__c as any).__c) {
        // Preserve DOM references so we don't lose existing content
        if (newVNode.__e == null) {
          newVNode.__e = oldVNode.__e;
          newVNode.__k = oldVNode.__k;
        }
        // Delegate to the Suspense boundary's _childDidSuspend
        return (v.__c as any).__c(err, newVNode);
      }
    }
  }
  if (oldCatchError) oldCatchError(err, newVNode, oldVNode, errorInfo);
};

/**
 * Suspense component that catches thrown promises from child components.
 *
 * - When a promise is intercepted via options.__e, renders the `fallback` prop (or nothing).
 * - During hydration (MODE_HYDRATE flag or __h truthy on the vnode), the existing
 *   server-rendered HTML is left alive until the promise resolves, then children are rendered.
 */
export class Suspense extends Component<SuspenseProps, SuspenseState> {
  private _pendingCount = 0;

  constructor(props: SuspenseProps) {
    super(props);
    this.state = { suspended: false };
  }

  // This is the _childDidSuspend handler that the options.__e hook looks for.
  // Preact-internal calls it via component.__c
  __c(promise: Promise<any>, suspendingVNode: InternalVNode) {
    const c = this;
    const isHydrating =
      !!(suspendingVNode.__u && (suspendingVNode.__u & MODE_HYDRATE)) ||
      !!suspendingVNode.__h;

    let resolved = false;
    const onResolved = () => {
      if (resolved) return;
      resolved = true;

      c._pendingCount--;
      if (c._pendingCount <= 0) {
        c._pendingCount = 0;
        c.setState({ suspended: false });
      }
    };

    c._pendingCount++;

    // During hydration: do NOT set suspended state. This leaves the existing
    // server-rendered HTML alive until the promise resolves.
    if (!isHydrating) {
      // Detach / park the current children vnode so we can show fallback
      c.setState({ suspended: true });
    }

    promise.then(onResolved, onResolved);
  }

  render() {
    const { children, fallback } = this.props;
    const { suspended } = this.state;

    if (suspended) {
      return fallback != null
        ? createElement(Fragment, null, fallback)
        : null;
    }

    return createElement(Fragment, null, children);
  }
}
