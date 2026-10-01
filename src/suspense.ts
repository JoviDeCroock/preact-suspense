import { Component, options, createElement, Fragment, type VNode, type ComponentChildren } from 'preact';

const MODE_HYDRATE = 1 << 5;


interface InternalVNode extends VNode {
  __?: InternalVNode;
  __c?: InternalComponent;
  __e?: Element | Text;
  __k?: InternalVNode[];
  __u?: number;
  __h?: boolean;
}

interface InternalComponent extends Component {
  __c?: (error: Promise<any>, suspendingVNode: InternalVNode) => void;
  __v?: InternalVNode;
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
            (newVNode.__c as any).__H = undefined;
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

export class Suspense extends Component<SuspenseProps, SuspenseState> {
  private _pendingCount = 0;
  // Bumped when the boundary stops waiting on the promises it has seen so far.
  private _generation = 0;
  // The children that suspended. Different children are rendered again.
  private _suspendedChildren: ComponentChildren = undefined;
  private _retrying = false;
  private _suspendedWhileRetrying = false;

  constructor(props: SuspenseProps) {
    super(props);
    installCatchErrorHook();
    this.state = { suspended: false };
  }

  __c(promise: Promise<any>, suspendingVNode: InternalVNode) {
    const c = this;
    const isHydrating =
      !!(suspendingVNode.__u && (suspendingVNode.__u & MODE_HYDRATE)) ||
      !!suspendingVNode.__h;
    const generation = c._generation;

    let resolved = false;
    const onResolved = () => {
      if (resolved || generation !== c._generation) return;
      resolved = true;

      c._pendingCount--;
      if (c._pendingCount <= 0) {
        c._pendingCount = 0;
        c.setState({ suspended: false });
      }
    };

    c._pendingCount++;
    if (c._retrying) c._suspendedWhileRetrying = true;

    if (!isHydrating) {
      c._suspendedChildren = c.props.children;
      c.setState({ suspended: true });
    }

    promise.then(onResolved, onResolved);
  }

  componentDidUpdate() {
    if (this._retrying) {
      this._retrying = false;
      if (!this._suspendedWhileRetrying) this.setState({ suspended: false });
    }
  }

  render() {
    const { children, fallback } = this.props;
    const { suspended } = this.state;

    // New children arrived while the fallback is showing, e.g. because the
    // child that suspended was replaced: try to render them instead of waiting
    // on the old promises. The fallback stays until they render or suspend.
    if (suspended && children !== this._suspendedChildren) {
      this._generation++;
      this._pendingCount = 0;
      this._suspendedChildren = children;
      this._retrying = true;
      this._suspendedWhileRetrying = false;
    }

    return [
      createElement(Fragment, null, suspended && !this._retrying ? null : children),
      suspended && fallback != null ? createElement(Fragment, null, fallback) : null,
    ];
  }
}
