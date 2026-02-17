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

export class Suspense extends Component<SuspenseProps, SuspenseState> {
  private _pendingCount = 0;

  constructor(props: SuspenseProps) {
    super(props);
    this.state = { suspended: false };
  }

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

    if (!isHydrating) {
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
