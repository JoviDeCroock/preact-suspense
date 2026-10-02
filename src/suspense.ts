import { Component, options, createElement, Fragment, type VNode, type ComponentChildren } from 'preact';

// vnode.__u
const FORCE_PROPS_REVALIDATE = 1 << 0;
const REF_DETACHED = 1 << 3;
const MODE_HYDRATE = 1 << 5;
// component.__g (Preact 11)
const COMPONENT_FORCE = 1 << 2;

interface InternalVNode extends VNode {
  __?: InternalVNode;
  __c?: InternalComponent | null;
  __e?: Element | Text;
  __k?: InternalVNode[] | null;
  __u?: number;
  __v?: InternalVNode | null;
  __h?: boolean;
}

interface InternalComponent extends Component {
  __c?: (error: Promise<any>, suspendingVNode: InternalVNode) => void;
  __v?: InternalVNode;
  __P?: Element | null;
  __g?: number;
  __h?: Array<() => void>;
  __H?: { __: Array<any>; __h: Array<any> };
  // The parent DOM the parked subtree was rendered into.
  __O?: Element | null;
}

interface SuspenseProps {
  fallback?: ComponentChildren;
  children?: ComponentChildren;
}

interface SuspenseState {
  suspended: boolean;
}

let catchErrorInstalled = false;
function installCatchErrorHook() {
  if (catchErrorInstalled) return;
  catchErrorInstalled = true;

  const oldCatchError = (options as any).__e;
  (options as any).__e = function (
    err: any,
    newVNode: InternalVNode,
    oldVNode: InternalVNode,
    errorInfo?: any
  ) {
    if (err && err.then) {
      let v: InternalVNode | undefined = newVNode;
      while ((v = v!.__)) {
        if (v.__c && (v.__c as any).__c) {
          // A component that suspends before it ever committed has no state
          // worth keeping. Dropping its hooks (`__H`) also drops the effects
          // its aborted render queued, which would otherwise run while it is
          // still suspended during hydration.
          if (oldVNode && !oldVNode.__c && newVNode.__c) {
            newVNode.__c.__H = undefined;
          }
          if (newVNode.__e == null) {
            newVNode.__e = oldVNode.__e;
            newVNode.__k = oldVNode.__k;
          }
          return (v.__c as any).__c(err, newVNode);
        }
      }
    }
    if (oldCatchError) oldCatchError(err, newVNode, oldVNode, errorInfo);
  };
}

/**
 * Returns a copy of the mounted `vnode` tree without its components, so that
 * unmounting the copy removes the DOM but keeps the components (and their
 * state) of the original tree alive. Components that rendered into
 * `parentDom` render into `detachedParent` while parked.
 */
function detachedClone(
  vnode: InternalVNode | null | undefined,
  detachedParent: Element,
  parentDom: Element | null | undefined
): InternalVNode | null | undefined {
  if (vnode) {
    const c = vnode.__c;
    const hooks = c && c.__H;
    if (hooks) {
      for (const effect of hooks.__) {
        // Only effects have `__P` (`_passive`). Clearing their arguments
        // makes them run again when the tree is revealed.
        if (effect.__P != null) {
          if (typeof effect.__c == 'function') effect.__c();
          effect.__c = effect.__H = undefined;
        }
      }
      // Drop the effects queued by the render that suspended.
      hooks.__h = c!.__h = [];
    }

    // Unmounting the copy detaches DOM refs. Flag the original so that the
    // reveal attaches them again.
    if (typeof vnode.type == 'string') vnode.__u! |= REF_DETACHED;

    vnode = Object.assign({ constructor: undefined }, vnode);
    if (vnode.__c != null) {
      if (vnode.__c.__P == parentDom) vnode.__c.__P = detachedParent;
      vnode.__c.__g! |= COMPONENT_FORCE;
      vnode.__c = null;
    }

    vnode.__k =
      vnode.__k &&
      vnode.__k.map(
        (child) => detachedClone(child, detachedParent, parentDom) as InternalVNode
      );
  }

  return vnode;
}

/** Moves a parked tree back into `originalParent`, forcing it to re-render. */
function removeOriginal(
  vnode: InternalVNode | null | undefined,
  detachedParent: Element | null | undefined,
  originalParent: Element | null | undefined
): InternalVNode | null | undefined {
  if (vnode && originalParent) {
    if (typeof vnode.type == 'string') vnode.__u! |= FORCE_PROPS_REVALIDATE;

    vnode.__v = null;
    vnode.__k =
      vnode.__k &&
      vnode.__k.map(
        (child) => removeOriginal(child, detachedParent, originalParent) as InternalVNode
      );

    if (vnode.__c && vnode.__c.__P == detachedParent) {
      if (vnode.__e) originalParent.appendChild(vnode.__e);
      vnode.__c.__g! |= COMPONENT_FORCE;
      vnode.__c.__P = originalParent;
    }
  }

  return vnode;
}

export class Suspense extends Component<SuspenseProps, SuspenseState> {
  private _pendingCount = 0;
  // Bumped when the boundary stops waiting on the promises it has seen so far.
  private _generation = 0;
  // The children that suspended. Different children are rendered again.
  private _suspendedChildren: ComponentChildren = undefined;
  private _retrying = false;
  // Preact 11 lets a suspended subtree be parked and keep its state.
  private _canPark: boolean;
  // The mounted children to park on the next render.
  private _detachOnNextRender: InternalVNode | null = null;
  // The parked children, put back when the boundary resumes.
  private _parked: InternalVNode | null = null;

  constructor(props: SuspenseProps) {
    super(props);
    installCatchErrorHook();
    this._canPark = '__g' in this;
    this.state = { suspended: false };
  }

  __c(promise: Promise<any>, suspendingVNode: InternalVNode) {
    const c = this as unknown as InternalComponent & Suspense;
    const isHydrating =
      !!(suspendingVNode.__u && (suspendingVNode.__u & MODE_HYDRATE)) ||
      !!suspendingVNode.__h;
    const generation = c._generation;

    let resolved = false;
    const onResolved = () => {
      // Core clears `__P` when the boundary unmounts.
      if (resolved || generation !== c._generation || !c.__P) return;
      resolved = true;

      if (--c._pendingCount <= 0) {
        c._pendingCount = 0;
        c._unpark();
        c.setState({ suspended: false });
      }
    };

    if (!c._pendingCount++ && !isHydrating) {
      c._suspendedChildren = c.props.children;
      if (c._canPark && c.__v && c.__v.__k && !c._parked) {
        c._detachOnNextRender = c.__v.__k[0];
      }
      c.setState({ suspended: true });
    }

    promise.then(onResolved, onResolved);
  }

  /** Puts the parked children back, so that the next render diffs against them. */
  private _unpark() {
    const c = this as unknown as InternalComponent & Suspense;
    const parked = c._parked;
    c._parked = c._detachOnNextRender = null;
    if (parked && parked.__c && c.__v && c.__v.__k) {
      c.__v.__k[0] = removeOriginal(parked, parked.__c.__P, parked.__c.__O) as InternalVNode;
    }
  }

  componentDidUpdate() {
    if (this._retrying) {
      this._retrying = false;
      // The new children rendered without suspending.
      if (!this._pendingCount) this.setState({ suspended: false });
    } else if (this.state.suspended && this.props.children !== this._suspendedChildren) {
      // New children arrived while the fallback is showing, e.g. because the
      // child that suspended was replaced: render them instead of waiting on
      // the old promises. They are diffed against the parked children to keep
      // their state, and the fallback stays until they render or suspend.
      this._generation++;
      this._pendingCount = 0;
      this._suspendedChildren = this.props.children;
      this._unpark();
      this._retrying = true;
      this.forceUpdate();
    }
  }

  render() {
    const c = this as unknown as InternalComponent & Suspense;
    const { children, fallback } = c.props;
    const { suspended } = c.state;

    if (c._detachOnNextRender) {
      // `__k` is not set yet when a parent re-renders the boundary. The
      // suspended children are then unmounted instead of parked.
      const children = c.__v && c.__v.__k;
      if (children && children[0] === c._detachOnNextRender) {
        const parked = c._detachOnNextRender;
        const fragment = parked.__c!;
        children[0] = detachedClone(
          parked,
          document.createElement('div'),
          (fragment.__O = fragment.__P)
        ) as InternalVNode;
        c._parked = parked;
      }
      c._detachOnNextRender = null;
    }

    return [
      createElement(Fragment, null, suspended && !c._retrying ? null : children),
      suspended && fallback != null ? createElement(Fragment, null, fallback) : null,
    ];
  }
}
