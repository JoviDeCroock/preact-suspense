import { describe, it, expect, afterEach } from 'vitest';
import { Component, createElement as h, Fragment, hydrate, render } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import { renderToStringAsync } from 'preact-render-to-string';
import { Suspense } from '../src/suspense';
import { lazy } from '../src/lazy';

function deferred<T = void>() {
  let resolve!: (val: T | PromiseLike<T>) => void;
  let reject!: (err: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function flush(ms = 10) {
  await new Promise((r) => setTimeout(r, ms));
}

/** innerHTML without comment nodes such as the `<!--$s-->` hydration markers. */
const markup = (el: Element) => el.innerHTML.replace(/<!--[\s\S]*?-->/g, '');

/** A lazy component that resolves to `Comp` once `resolve()` is called. */
function controlledLazy(Comp: any) {
  const d = deferred<{ default: any }>();
  return { Lazy: lazy(() => d.promise), resolve: () => d.resolve({ default: Comp }) };
}

/** Server-rendered markup for `app`, where `Inner` resolves right away. */
const renderOnServer = (app: (Inner: any) => any, Content: any) =>
  renderToStringAsync(app(lazy(() => Promise.resolve({ default: Content }))));

const containers: Array<HTMLElement> = [];
function scratch(html = '') {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  containers.push(el);
  return el;
}

afterEach(() => {
  for (const el of containers.splice(0)) {
    render(null, el);
    el.remove();
  }
});

const Id = ({ tag = 'i' }: { tag?: string }) => h(tag, { id: useId() });

describe('resumed hydration', () => {
  it('reuses server DOM inside $s markers and matches useId from the server', async () => {
    const Content = () => h(Fragment, null, h('b', null, 'one'), h(Id, { tag: 'em' }));
    const app = (Inner: any) =>
      h('div', null, h(Id, null), h(Suspense, { fallback: h('p', null, 'loading') }, h(Inner, null)), h(Id, null));

    const html = await renderOnServer(app, Content);
    expect(html).toContain('<!--$s-->');

    const container = scratch(html);
    const serverB = container.querySelector('b');
    const serverIds = [...container.querySelectorAll('[id]')].map((el) => el.id);

    const { Lazy, resolve } = controlledLazy(Content);
    hydrate(app(Lazy), container);
    await flush();
    expect(container.querySelector('b')).toBe(serverB);
    expect(container.textContent).not.toContain('loading');

    resolve();
    await flush();
    expect(container.querySelector('b')).toBe(serverB);
    expect(container.querySelectorAll('b')).toHaveLength(1);
    expect([...container.querySelectorAll('[id]')].map((el) => el.id)).toEqual(serverIds);
  });

  it('attaches event listeners in resumed content', async () => {
    let clicks = 0;
    const Content = () => h('button', { onClick: () => clicks++ }, 'press');
    const app = (Inner: any) => h(Suspense, { fallback: 'loading' }, h(Inner, null));

    const container = scratch(await renderOnServer(app, Content));
    const serverButton = container.querySelector('button')!;

    const { Lazy, resolve } = controlledLazy(Content);
    hydrate(app(Lazy), container);
    resolve();
    await flush();

    expect(container.querySelector('button')).toBe(serverButton);
    serverButton.click();
    expect(clicks).toBe(1);
  });

  it('lets siblings update while the boundary is still suspended', async () => {
    let setCount!: (n: number) => void;
    const Counter = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('span', null, `count:${count}`);
    };
    const Content = () => h('b', null, 'lazy');
    const app = (Inner: any) =>
      h('div', null, h(Counter, null), h(Suspense, { fallback: 'loading' }, h(Inner, null)));

    const container = scratch(await renderOnServer(app, Content));
    const { Lazy, resolve } = controlledLazy(Content);
    hydrate(app(Lazy), container);
    await flush();

    setCount(1);
    await flush();
    expect(container.innerHTML).toContain('count:1');
    expect(container.querySelectorAll('b')).toHaveLength(1);

    resolve();
    await flush();
    expect(container.textContent).toBe('count:1lazy');
    expect(container.querySelectorAll('b')).toHaveLength(1);
  });

  const unmountBeforeResume = async (stripMarkers: boolean) => {
    let setShow!: (v: boolean) => void;
    const Content = () => h('b', null, 'lazy');
    const app = (Inner: any) => {
      const App = () => {
        const [show, set] = useState(true);
        setShow = set;
        return h('div', null, show ? h(Suspense, { fallback: 'loading' }, h(Inner, null)) : h('p', null, 'gone'));
      };
      return h(App, null);
    };

    const html = await renderOnServer(app, Content);
    const container = scratch(stripMarkers ? html.replace(/<!--[\s\S]*?-->/g, '') : html);
    const { Lazy, resolve } = controlledLazy(Content);
    hydrate(app(Lazy), container);
    await flush();

    setShow(false);
    await flush();
    expect(markup(container)).toBe('<div><p>gone</p></div>');

    resolve();
    await flush();
    expect(markup(container)).toBe('<div><p>gone</p></div>');
  };

  it('removes server DOM when the boundary unmounts before hydration resumes', () => unmountBeforeResume(true));

  // Preact 11 core regression (passes on Preact 10, and with preact/compat's Suspense it
  // fails the same way): for `$s`-delimited markup, `unmount` only removes `vnode._dom`
  // (the closing marker) and leaves the opening marker and server DOM behind.
  it.fails('removes $s-delimited server DOM when the boundary unmounts before hydration resumes', () =>
    unmountBeforeResume(false),
  );

  it('re-renders parents with shouldComponentUpdate=false around suspended hydration', async () => {
    class Static extends Component<{ children?: any }> {
      override shouldComponentUpdate() {
        return false;
      }
      override render() {
        return h('section', null, this.props.children);
      }
    }
    let setCount!: (n: number) => void;
    const Content = () => h('b', null, 'lazy');
    const app = (Inner: any) => {
      const App = () => {
        const [count, set] = useState(0);
        setCount = set;
        return h('div', null, h('span', null, count), h(Suspense, { fallback: 'loading' }, h(Static, null, h(Inner, null))));
      };
      return h(App, null);
    };

    const container = scratch(await renderOnServer(app, Content));
    const { Lazy, resolve } = controlledLazy(Content);
    hydrate(app(Lazy), container);
    await flush();
    setCount(1);
    await flush();
    resolve();
    await flush();
    expect(markup(container)).toBe('<div><span>1</span><section><b>lazy</b></section></div>');
  });

  it('suspends normally after hydration resumed', async () => {
    let suspendAgain: Promise<void> | null = null;
    const Content = () => {
      if (suspendAgain) throw suspendAgain;
      return h('b', null, 'lazy');
    };
    let setTick!: (n: number) => void;
    const app = (Inner: any) => {
      const App = () => {
        const [tick, set] = useState(0);
        setTick = set;
        return h(Suspense, { fallback: h('p', null, 'loading') }, h(Inner, { tick }));
      };
      return h(App, null);
    };

    const container = scratch(await renderOnServer(app, Content));
    const { Lazy, resolve } = controlledLazy(Content);
    hydrate(app(Lazy), container);
    resolve();
    await flush();
    expect(markup(container)).toBe('<b>lazy</b>');

    const again = deferred();
    suspendAgain = again.promise;
    setTick(1);
    await flush();
    expect(markup(container)).toBe('<p>loading</p>');

    suspendAgain = null;
    again.resolve();
    await flush();
    expect(markup(container)).toBe('<b>lazy</b>');
  });
});

describe('effects of components that suspend', () => {
  it('does not run effects of a render that suspended during hydration', async () => {
    const log: Array<string> = [];
    const d = deferred();
    let ready = false;
    d.promise.then(() => {
      ready = true;
    });
    const Data = () => {
      useEffect(() => {
        log.push(`effect (dom: ${document.querySelector('[data-hydrated]') ? 'hydrated' : 'pending'})`);
        return () => log.push('cleanup');
      }, []);
      if (!ready) throw d.promise;
      return h('b', { 'data-hydrated': true }, 'data');
    };
    const app = h('div', null, h(Suspense, { fallback: 'loading' }, h(Data, null)));

    ready = true;
    const html = await renderToStringAsync(app);
    ready = false;

    const container = scratch(html.replace(' data-hydrated', ''));
    hydrate(app, container);
    await flush(50);
    expect(log).toEqual([]);

    d.resolve();
    await flush(50);
    expect(log).toEqual(['effect (dom: hydrated)']);
  });

  it('runs effects once after a client-side suspension on mount', async () => {
    const log: Array<string> = [];
    const d = deferred();
    let ready = false;
    d.promise.then(() => {
      ready = true;
    });
    const Data = () => {
      useEffect(() => {
        log.push('effect');
        return () => log.push('cleanup');
      }, []);
      if (!ready) throw d.promise;
      return h('b', null, 'data');
    };
    const container = scratch();
    render(h(Suspense, { fallback: 'loading' }, h(Data, null)), container);
    await flush(50);
    d.resolve();
    await flush(50);
    expect(container.textContent).toBe('data');
    expect(log).toEqual(['effect']);
  });
});

describe('lazy', () => {
  it('throws a failed load to the nearest error boundary', async () => {
    class Boundary extends Component<{ children?: any }, { error?: Error }> {
      state: { error?: Error } = {};
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      render() {
        return this.state.error ? h('p', null, `error:${this.state.error.message}`) : this.props.children;
      }
    }
    const d = deferred<{ default: any }>();
    let loads = 0;
    const Lazy = lazy(() => {
      loads++;
      return d.promise;
    });
    const unhandled: Array<unknown> = [];
    const onUnhandled = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      unhandled.push(event.reason);
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    try {
      const container = scratch();
      render(h(Boundary, null, h(Suspense, { fallback: 'loading' }, h(Lazy, null))), container);
      await flush();
      expect(container.textContent).toBe('loading');

      d.reject(new Error('chunk failed'));
      await flush(50);
      expect(container.innerHTML).toBe('<p>error:chunk failed</p>');
      expect(loads).toBe(1);
      expect(unhandled).toEqual([]);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });

  it('throws a failed load when rendered after the failure', async () => {
    class Boundary extends Component<{ children?: any }, { error?: Error }> {
      state: { error?: Error } = {};
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      render() {
        return this.state.error ? 'error' : this.props.children;
      }
    }
    const Lazy = lazy(() => Promise.reject(new Error('chunk failed')));
    await Lazy.preload().catch(() => {});

    const container = scratch();
    render(h(Boundary, null, h(Suspense, { fallback: 'loading' }, h(Lazy, null))), container);
    await flush();
    expect(container.textContent).toBe('error');
  });

  it('passes a ref prop through to a lazily loaded function component', async () => {
    const Input = ({ ref }: { ref?: any }) => h('input', { ref });
    const { Lazy, resolve } = controlledLazy(Input);
    const ref = { current: null as HTMLInputElement | null };
    const container = scratch();
    render(h(Suspense, { fallback: 'loading' }, h(Lazy, { ref })), container);
    resolve();
    await flush();
    expect(ref.current).toBe(container.querySelector('input'));
  });
});

describe('re-suspending', () => {
  it('preserves state of mounted siblings when a child re-suspends', async () => {
    let setCount!: (n: number) => void;
    const Counter = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('span', null, `count:${count}`);
    };
    let pending: Promise<void> | null = null;
    const MaybeSuspend = () => {
      if (pending) throw pending;
      return h('b', null, 'ready');
    };
    let setTick!: (n: number) => void;
    const App = () => {
      const [tick, set] = useState(0);
      setTick = set;
      return h(Suspense, { fallback: 'loading' }, h(Counter, null), h(MaybeSuspend, { tick }));
    };

    const container = scratch();
    render(h(App, null), container);
    setCount(5);
    await flush();
    expect(container.textContent).toBe('count:5ready');

    const d = deferred();
    pending = d.promise;
    setTick(1);
    await flush();
    expect(container.textContent).toBe('loading');

    pending = null;
    d.resolve();
    await flush();
    expect(container.textContent).toBe('count:5ready');
  });

  /** Renders `children` plus a `<Suspend>` that throws while `suspend()` is pending. */
  function setup(children: (Suspend: any) => any) {
    let pending: Promise<void> | null = null;
    const Suspend = () => {
      if (pending) throw pending;
      return h('b', null, 'ready');
    };
    let setTick!: (n: number) => void;
    const App = () => {
      const [tick, set] = useState(0);
      setTick = set;
      return h(Suspense, { fallback: h('p', null, 'loading') }, children(h(Suspend, { tick })));
    };
    const container = scratch();
    render(h(App, null), container);
    return {
      container,
      async suspend() {
        const d = deferred();
        pending = d.promise;
        setTick(Math.random());
        await flush();
        return async () => {
          pending = null;
          d.resolve();
          await flush();
        };
      },
    };
  }

  it('restores DOM nodes in order, including text and input values', async () => {
    const { container, suspend } = setup((suspender) => [
      'text',
      h('input', null),
      h(Fragment, null, h('i', null, 'a'), h('i', null, 'b')),
      suspender,
      h('u', null, 'last'),
    ]);
    const input = container.querySelector('input')!;
    input.value = 'typed';
    const before = container.innerHTML;

    const resolve = await suspend();
    expect(container.innerHTML).toBe('<p>loading</p>');
    await resolve();

    expect(container.innerHTML).toBe(before);
    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('typed');
  });

  it('detaches refs while parked and attaches them again on reveal', async () => {
    const ref = { current: null as HTMLElement | null };
    const { container, suspend } = setup((suspender) => [h('span', { ref }), suspender]);
    const span = container.querySelector('span');
    expect(ref.current).toBe(span);

    const resolve = await suspend();
    expect(ref.current).toBe(null);
    await resolve();
    expect(ref.current).toBe(span);
  });

  it('cleans up effects while parked and runs them again on reveal', async () => {
    const log: Array<string> = [];
    const Effects = () => {
      useEffect(() => {
        log.push('effect');
        return () => log.push('cleanup');
      }, []);
      return null;
    };
    const { suspend } = setup((suspender) => [h(Effects, null), suspender]);
    // Preact 11 runs passive effects after paint.
    await flush(50);
    expect(log).toEqual(['effect']);

    const resolve = await suspend();
    expect(log).toEqual(['effect', 'cleanup']);
    await resolve();
    await flush(50);
    expect(log).toEqual(['effect', 'cleanup', 'effect']);
  });

  it('keeps updates made to parked components', async () => {
    let setCount!: (n: number) => void;
    const Counter = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('span', null, `count:${count}`);
    };
    const { container, suspend } = setup((suspender) => [h(Counter, null), suspender]);

    const resolve = await suspend();
    setCount(3);
    await flush();
    expect(container.textContent).toBe('loading');
    await resolve();
    expect(container.textContent).toBe('count:3ready');
  });

  it('can suspend again after revealing parked children', async () => {
    let setCount!: (n: number) => void;
    const Counter = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('span', null, `count:${count}`);
    };
    const { container, suspend } = setup((suspender) => [h(Counter, null), suspender]);
    setCount(1);

    await (await suspend())();
    setCount(2);
    await (await suspend())();
    expect(container.textContent).toBe('count:2ready');
  });

  it('keeps state when the suspending child re-renders itself', async () => {
    let setCount!: (n: number) => void;
    const Counter = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('span', null, `count:${count}`);
    };
    let load!: (p: Promise<void> | null) => void;
    const List = () => {
      const [pending, set] = useState<Promise<void> | null>(null);
      load = set;
      if (pending) throw pending;
      return h('b', null, 'list');
    };
    const container = scratch();
    render(h(Suspense, { fallback: 'loading' }, h(Counter, null), h(List, null)), container);
    setCount(7);
    await flush();

    const d = deferred();
    load(d.promise);
    await flush();
    expect(container.textContent).toBe('loading');

    d.resolve();
    // The component still throws its settled promise until it re-renders.
    load(null);
    await flush();
    expect(container.textContent).toBe('count:7list');
  });

  it('keeps parked state when new children arrive and suspend again', async () => {
    let setCount!: (n: number) => void;
    const Counter = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('span', null, `count:${count}`);
    };
    const { container, suspend } = setup((suspender) => [h(Counter, null), suspender]);
    setCount(4);
    await flush();

    const resolve = await suspend();
    // Re-render the boundary with new children while it is suspended.
    const again = await suspend();
    expect(container.textContent).toBe('loading');
    await resolve();
    await again();
    expect(container.textContent).toBe('count:4ready');
  });

  it('unmounts cleanly while parked', async () => {
    const log: Array<string> = [];
    const Effects = () => {
      useEffect(() => () => log.push('cleanup'), []);
      return h('span', null, 'effects');
    };
    const { container, suspend } = setup((suspender) => [h(Effects, null), suspender]);
    await flush(50);
    const resolve = await suspend();
    expect(log).toEqual(['cleanup']);

    render(null, container);
    await resolve();
    expect(container.innerHTML).toBe('');
    expect(log).toEqual(['cleanup']);
  });
});

describe('new children while suspended', () => {
  const Forever = () => {
    throw new Promise<void>(() => {});
  };

  it('renders new children when the suspended child is replaced', async () => {
    const container = scratch();
    render(h(Suspense, { fallback: 'loading' }, h(Forever, null)), container);
    await flush();
    expect(container.textContent).toBe('loading');

    render(h(Suspense, { fallback: 'loading' }, h('b', null, 'replaced')), container);
    await flush();
    expect(container.innerHTML).toBe('<b>replaced</b>');
  });

  it('keeps the fallback mounted while new children suspend too', async () => {
    const container = scratch();
    const fallback = h('p', null, 'loading');
    render(h(Suspense, { fallback }, h(Forever, null)), container);
    await flush();
    const fallbackNode = container.querySelector('p');
    expect(fallbackNode).not.toBeNull();

    const d = deferred();
    let ready = false;
    d.promise.then(() => {
      ready = true;
    });
    const Next = () => {
      if (!ready) throw d.promise;
      return h('b', null, 'next');
    };
    render(h(Suspense, { fallback }, h(Next, null)), container);
    await flush();
    expect(container.innerHTML).toBe('<p>loading</p>');
    expect(container.querySelector('p')).toBe(fallbackNode);

    d.resolve();
    await flush();
    expect(container.innerHTML).toBe('<b>next</b>');
  });

  it('ignores the promise of a replaced child', async () => {
    const first = deferred();
    const Pending = () => {
      throw first.promise;
    };
    const second = deferred();
    let secondReady = false;
    second.promise.then(() => {
      secondReady = true;
    });
    const Next = () => {
      if (!secondReady) throw second.promise;
      return h('b', null, 'next');
    };

    const container = scratch();
    render(h(Suspense, { fallback: 'loading' }, h(Pending, null)), container);
    await flush();
    render(h(Suspense, { fallback: 'loading' }, h(Next, null)), container);
    await flush();

    // The replaced child's promise settling must not end the new suspension.
    first.resolve();
    await flush();
    expect(container.textContent).toBe('loading');

    second.resolve();
    await flush();
    expect(container.innerHTML).toBe('<b>next</b>');
  });

  it('keeps showing the fallback when re-rendered with the same children', async () => {
    const container = scratch();
    const children = h(Forever, null);
    render(h(Suspense, { fallback: 'loading' }, children), container);
    await flush();
    render(h(Suspense, { fallback: 'loading' }, children), container);
    await flush();
    expect(container.innerHTML).toBe('loading');
  });
});
