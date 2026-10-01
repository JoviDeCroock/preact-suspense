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

describe('known differences from preact/compat Suspense', () => {
  // The subtree is unmounted while the fallback shows, so state below the boundary is
  // reset. preact/compat parks the suspended subtree in a detached DOM node instead.
  it.fails('preserves state of mounted siblings when a child re-suspends', async () => {
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

  // The fallback stays until the original promise settles, even when the child that
  // suspended is gone. preact/compat behaves the same; React renders the new children.
  it.fails('renders new children when the suspended child is replaced', async () => {
    const never = new Promise<void>(() => {});
    const Forever = () => {
      throw never;
    };
    const container = scratch();
    render(h(Suspense, { fallback: 'loading' }, h(Forever, null)), container);
    await flush();
    expect(container.textContent).toBe('loading');

    render(h(Suspense, { fallback: 'loading' }, h('b', null, 'replaced')), container);
    await flush();
    expect(container.textContent).toBe('replaced');
  });
});
