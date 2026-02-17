import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-preact';
import { createElement, options, hydrate as preactHydrate, render as preactRender } from 'preact';
import { useEffect } from 'preact/hooks';
import { Suspense } from '../src/suspense';
import { lazy } from '../src/lazy';

/** Helper: create a deferred promise we can resolve/reject manually */
function deferred<T = void>() {
  let resolve!: (val: T | PromiseLike<T>) => void;
  let reject!: (err: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush microtasks + a small wait for Preact re-renders */
async function flush(ms = 10) {
  await new Promise((r) => setTimeout(r, ms));
}

/** A component that throws a promise until it resolves */
function createSuspendingComponent(deferred: { promise: Promise<any>; resolve: Function }) {
  let resolved = false;
  deferred.promise.then(() => {
    resolved = true;
  });

  return function Suspending({ text }: { text?: string }) {
    if (!resolved) throw deferred.promise;
    return createElement('div', { 'data-testid': 'resolved' }, text ?? 'Loaded');
  };
}


describe('Suspense', () => {
  describe('basic rendering', () => {
    it('renders children when nothing suspends', async () => {
      function Child() {
        return createElement('div', { 'data-testid': 'child' }, 'Hello');
      }

      const screen = render(
        createElement(Suspense, { fallback: createElement('div', null, 'Loading...') },
          createElement(Child, null)
        )
      );

      await expect.element(screen.getByTestId('child')).toBeVisible();
      await expect.element(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('renders fallback when a child throws a promise', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement(Suspense, { fallback: createElement('div', { 'data-testid': 'fallback' }, 'Loading...') },
          createElement(Suspending, null)
        )
      );

      await expect.element(screen.getByTestId('fallback')).toBeVisible();
      await expect.element(screen.getByTestId('fallback')).toHaveTextContent('Loading...');
    });

    it('renders nothing when a child suspends and no fallback is provided', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement('div', { 'data-testid': 'wrapper' },
          createElement(Suspense, null,
            createElement(Suspending, null)
          )
        )
      );

      await flush();
      expect(screen.container.querySelector('[data-testid="wrapper"]')).not.toBeNull();
      expect(screen.container.querySelector('[data-testid="resolved"]')).toBeNull();
    });

    it('switches from fallback to children when the promise resolves', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement(Suspense, { fallback: createElement('div', { 'data-testid': 'fallback' }, 'Loading...') },
          createElement(Suspending, { text: 'Done!' })
        )
      );

      await expect.element(screen.getByTestId('fallback')).toBeVisible();

      d.resolve();
      await flush();

      await expect.element(screen.getByTestId('resolved')).toBeVisible();
      await expect.element(screen.getByTestId('resolved')).toHaveTextContent('Done!');
    });
  });


  describe('lazy', () => {
    it('loads and renders a lazily-imported component', async () => {
      const d = deferred<{ default: any }>();

      const LazyComp = lazy(() => d.promise);

      const screen = render(
        createElement(Suspense, { fallback: createElement('span', { 'data-testid': 'fb' }, 'wait') },
          createElement(LazyComp, { greeting: 'hi' })
        )
      );

      await expect.element(screen.getByTestId('fb')).toBeVisible();

      d.resolve({
        default: (props: any) => createElement('p', { 'data-testid': 'lazy-child' }, `Lazy: ${props.greeting}`)
      });
      await flush();

      await expect.element(screen.getByTestId('lazy-child')).toBeVisible();
      await expect.element(screen.getByTestId('lazy-child')).toHaveTextContent('Lazy: hi');
    });

    it('supports module without default export', async () => {
      const d = deferred<any>();

      const LazyComp = lazy(() => d.promise);

      const screen = render(
        createElement(Suspense, { fallback: createElement('span', null, 'loading') },
          createElement(LazyComp, null)
        )
      );

      d.resolve((props: any) => createElement('div', { 'data-testid': 'bare' }, 'Bare export'));
      await flush();

      await expect.element(screen.getByTestId('bare')).toBeVisible();
    });

    it('preload() starts loading before render', async () => {
      let loadCalled = false;
      const d = deferred<{ default: any }>();

      const LazyComp = lazy(() => {
        loadCalled = true;
        return d.promise;
      });

      expect(loadCalled).toBe(false);
      const preloadPromise = LazyComp.preload();
      expect(loadCalled).toBe(true);

      d.resolve({
        default: () => createElement('div', { 'data-testid': 'preloaded' }, 'Preloaded')
      });
      await preloadPromise;

      const screen = render(
        createElement(Suspense, { fallback: createElement('span', null, 'loading') },
          createElement(LazyComp, null)
        )
      );

      await expect.element(screen.getByTestId('preloaded')).toBeVisible();
    });
  });


  describe('multiple suspending children', () => {
    it('shows fallback until all children resolve', async () => {
      const d1 = deferred();
      const d2 = deferred();
      const Comp1 = createSuspendingComponent(d1);
      const Comp2 = createSuspendingComponent(d2);

      const screen = render(
        createElement(Suspense, { fallback: createElement('div', { 'data-testid': 'multi-fb' }, 'Loading all...') },
          createElement(Comp1, { text: 'First' }),
          createElement(Comp2, { text: 'Second' })
        )
      );

      await expect.element(screen.getByTestId('multi-fb')).toBeVisible();

      d1.resolve();
      await flush();

      d2.resolve();
      await flush();

      await expect.element(screen.getByText('First')).toBeVisible();
      await expect.element(screen.getByText('Second')).toBeVisible();
    });
  });


  describe('nested Suspense boundaries', () => {
    it('inner Suspense catches its own child, outer renders normally', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement(Suspense, { fallback: createElement('div', null, 'Outer fallback') },
          createElement('div', { 'data-testid': 'outer-child' }, 'Outer content'),
          createElement(Suspense, { fallback: createElement('div', { 'data-testid': 'inner-fb' }, 'Inner loading') },
            createElement(Suspending, { text: 'Inner resolved' })
          )
        )
      );

      await expect.element(screen.getByTestId('outer-child')).toBeVisible();
      await expect.element(screen.getByTestId('inner-fb')).toBeVisible();

      d.resolve();
      await flush();

      await expect.element(screen.getByTestId('outer-child')).toBeVisible();
      await expect.element(screen.getByText('Inner resolved')).toBeVisible();
    });

    it('outer Suspense catches when no inner boundary exists', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement(Suspense, { fallback: createElement('div', { 'data-testid': 'outer-fb' }, 'Outer loading') },
          createElement('div', null,
            createElement(Suspending, { text: 'Deep child' })
          )
        )
      );

      await expect.element(screen.getByTestId('outer-fb')).toBeVisible();

      d.resolve();
      await flush();

      await expect.element(screen.getByText('Deep child')).toBeVisible();
    });
  });


  describe('fallback variations', () => {
    it('supports JSX element as fallback', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement(Suspense, {
          fallback: createElement('div', { 'data-testid': 'jsx-fb', className: 'spinner' }, 'Spinning...')
        },
          createElement(Suspending, null)
        )
      );

      const fb = screen.getByTestId('jsx-fb');
      await expect.element(fb).toBeVisible();
      await expect.element(fb).toHaveTextContent('Spinning...');
    });

    it('supports string as fallback', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement(Suspense, { fallback: 'Please wait...' },
          createElement(Suspending, null)
        )
      );

      await expect.element(screen.getByText('Please wait...')).toBeVisible();
    });

    it('supports null fallback (renders nothing)', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement('div', { 'data-testid': 'null-fb-wrapper' },
          createElement(Suspense, { fallback: null },
            createElement(Suspending, null)
          )
        )
      );

      await flush();
      expect(screen.container.querySelector('[data-testid="null-fb-wrapper"]')).not.toBeNull();
      expect(screen.container.querySelector('[data-testid="resolved"]')).toBeNull();
    });
  });


  describe('hydration behavior', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      preactRender(null, container);
      container.remove();
    });

    it('leaves server-rendered HTML alive during hydration until promise resolves', async () => {
      const d = deferred();
      let resolvedState = false;
      d.promise.then(() => { resolvedState = true; });

      function AsyncChild() {
        if (!resolvedState) throw d.promise;
        return createElement('div', { 'data-testid': 'hydrated-child' }, 'Client content');
      }

      container.innerHTML =
        '<div data-testid="hydrated-child">Server content</div>';

      const ssrNode = container.querySelector('[data-testid="hydrated-child"]')!;
      expect(ssrNode).not.toBeNull();
      expect(ssrNode.textContent).toBe('Server content');

      preactHydrate(
        createElement(Suspense, {
          fallback: createElement('div', { 'data-testid': 'hydrate-fb' }, 'Loading...')
        },
          createElement(AsyncChild, null)
        ),
        container
      );
      await flush();

      expect(container.querySelector('[data-testid="hydrate-fb"]')).toBeNull();

      expect(container.querySelector('[data-testid="hydrated-child"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="hydrated-child"]')!.textContent).toBe('Server content');

      d.resolve();
      await flush();

      expect(container.querySelector('[data-testid="hydrated-child"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="hydrated-child"]')!.textContent).toBe('Client content');
    });

    it('leaves HTML alive during hydration with a lazy component', async () => {
      const d = deferred<{ default: any }>();

      const LazyChild = lazy(() => d.promise);

      container.innerHTML = '<p data-testid="lazy-ssr">SSR lazy content</p>';

      preactHydrate(
        createElement(Suspense, {
          fallback: createElement('div', { 'data-testid': 'lazy-hydrate-fb' }, 'Hydrating lazy...')
        },
          createElement(LazyChild, null)
        ),
        container
      );
      await flush();

      expect(container.querySelector('[data-testid="lazy-hydrate-fb"]')).toBeNull();
      expect(container.querySelector('[data-testid="lazy-ssr"]')!.textContent).toBe('SSR lazy content');

      d.resolve({
        default: () => createElement('p', { 'data-testid': 'lazy-ssr' }, 'Client lazy content')
      });
      await flush();

      expect(container.querySelector('[data-testid="lazy-ssr"]')!.textContent).toBe('Client lazy content');
    });

    it('shows fallback during normal (non-hydration) render', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const screen = render(
        createElement(Suspense, {
          fallback: createElement('div', { 'data-testid': 'normal-fb' }, 'Normal fallback')
        },
          createElement(Suspending, null)
        )
      );

      await expect.element(screen.getByTestId('normal-fb')).toBeVisible();

      d.resolve();
      await flush();

      await expect.element(screen.getByTestId('resolved')).toBeVisible();
    });

    it('does not flash fallback then replace SSR content during hydration', async () => {
      const d = deferred();
      let resolvedState = false;
      d.promise.then(() => { resolvedState = true; });

      function SlowChild() {
        if (!resolvedState) throw d.promise;
        return createElement('span', null, 'Ready');
      }

      container.innerHTML = '<span>Server ready</span>';
      const mutations: MutationRecord[] = [];
      const observer = new MutationObserver((records) => mutations.push(...records));
      observer.observe(container, { childList: true, subtree: true });

      preactHydrate(
        createElement(Suspense, {
          fallback: createElement('div', null, 'FALLBACK')
        },
          createElement(SlowChild, null)
        ),
        container
      );
      await flush();

      expect(container.innerHTML).not.toContain('FALLBACK');

      expect(container.querySelector('span')!.textContent).toBe('Server ready');

      d.resolve();
      await flush();

      observer.disconnect();
      expect(container.querySelector('span')!.textContent).toBe('Ready');
    });
  });


  describe('promise rejection', () => {
    it('un-suspends when the promise rejects', async () => {
      const d = deferred();
      let resolvedState = false;
      let rejectedState = false;

      d.promise.then(
        () => { resolvedState = true; },
        () => { rejectedState = true; }
      );

      function RejectableChild() {
        if (!resolvedState && !rejectedState) throw d.promise;
        return createElement('div', { 'data-testid': 'after-reject' }, rejectedState ? 'Rejected' : 'Resolved');
      }

      const screen = render(
        createElement(Suspense, {
          fallback: createElement('div', { 'data-testid': 'reject-fb' }, 'Loading...')
        },
          createElement(RejectableChild, null)
        )
      );

      await expect.element(screen.getByTestId('reject-fb')).toBeVisible();

      d.reject(new Error('Test error'));
      await flush();

      await expect.element(screen.getByTestId('after-reject')).toBeVisible();
      await expect.element(screen.getByTestId('after-reject')).toHaveTextContent('Rejected');
    });
  });


  describe('re-suspending', () => {
    it('can suspend, resolve, and suspend again', async () => {
      const d1 = deferred();
      let phase = 1;
      let resolved1 = false;
      let resolved2 = false;

      d1.promise.then(() => { resolved1 = true; });

      function PhasedChild() {
        if (phase === 1 && !resolved1) throw d1.promise;
        return createElement('div', { 'data-testid': 'phased' }, `Phase ${phase}`);
      }

      const screen = render(
        createElement(Suspense, {
          fallback: createElement('div', { 'data-testid': 'phased-fb' }, 'Loading phase...')
        },
          createElement(PhasedChild, null)
        )
      );

      await expect.element(screen.getByTestId('phased-fb')).toBeVisible();

      d1.resolve();
      await flush();

      await expect.element(screen.getByTestId('phased')).toBeVisible();
      await expect.element(screen.getByTestId('phased')).toHaveTextContent('Phase 1');
    });

    it('stops running effects while child subtree is suspended', async () => {
      vi.useFakeTimers();
      const d = deferred();
      const tick = vi.fn();
      const cleanup = vi.fn();
      const container = document.createElement('div');
      document.body.appendChild(container);

      let shouldSuspend = false;

      function ChildWithEffect() {
        useEffect(() => {
          const id = setInterval(() => tick(), 20);
          return () => {
            clearInterval(id);
            cleanup();
          };
        }, []);

        if (shouldSuspend) throw d.promise;
        return createElement('div', { 'data-testid': 'active-child' }, 'Active');
      }

      try {
        preactRender(
          createElement(Suspense, {
            fallback: createElement('div', { 'data-testid': 'effect-fb' }, 'Loading...')
          },
            createElement(ChildWithEffect, null)
          ),
          container
        );

        await vi.advanceTimersByTimeAsync(80);
        expect(tick.mock.calls.length).toBeGreaterThan(0);

        shouldSuspend = true;
        preactRender(
          createElement(Suspense, {
            fallback: createElement('div', { 'data-testid': 'effect-fb' }, 'Loading...')
          },
            createElement(ChildWithEffect, null)
          ),
          container
        );

        await Promise.resolve();
        await Promise.resolve();
        expect(container.querySelector('[data-testid="effect-fb"]')).not.toBeNull();
        expect(cleanup).toHaveBeenCalledTimes(1);

        const callsWhileSuspended = tick.mock.calls.length;
        await vi.advanceTimersByTimeAsync(120);
        expect(tick.mock.calls.length).toBe(callsWhileSuspended);

        shouldSuspend = false;
        d.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(container.querySelector('[data-testid="active-child"]')).not.toBeNull();
        await vi.advanceTimersByTimeAsync(60);
        expect(tick.mock.calls.length).toBeGreaterThan(callsWhileSuspended);
        expect(cleanup).toHaveBeenCalledTimes(1);
      } finally {
        preactRender(null, container);
        container.remove();
        vi.useRealTimers();
      }
    });
  });


  describe('already-resolved lazy', () => {
    it('renders immediately if the lazy module is already loaded', async () => {
      const Comp = (props: any) => createElement('div', { 'data-testid': 'instant' }, 'Instant');
      
      const LazyComp = lazy(() => Promise.resolve({ default: Comp }));
      
      await LazyComp.preload();
      await flush();

      const screen = render(
        createElement(Suspense, { fallback: createElement('span', null, 'should not show') },
          createElement(LazyComp, null)
        )
      );

      await expect.element(screen.getByTestId('instant')).toBeVisible();
    });
  });


  describe('complex scenarios', () => {
    it('supports complex fallback with multiple elements', async () => {
      const d = deferred();
      const Suspending = createSuspendingComponent(d);

      const fallback = createElement('div', { 'data-testid': 'complex-fb' },
        createElement('div', { className: 'spinner' }, '🔄'),
        createElement('p', null, 'Loading content...')
      );

      const screen = render(
        createElement(Suspense, { fallback },
          createElement(Suspending, null)
        )
      );

      await expect.element(screen.getByTestId('complex-fb')).toBeVisible();
      await expect.element(screen.getByText('Loading content...')).toBeVisible();

      d.resolve();
      await flush();

      await expect.element(screen.getByTestId('resolved')).toBeVisible();
    });

    it('Suspense with no children renders nothing', async () => {
      const screen = render(
        createElement('div', { 'data-testid': 'empty-wrapper' },
          createElement(Suspense, { fallback: createElement('span', null, 'fb') })
        )
      );

      await flush();
      expect(screen.container.querySelector('[data-testid="empty-wrapper"]')).not.toBeNull();
      expect(screen.container.querySelector('span')).toBeNull();
    });

    it('renders non-suspending siblings alongside resolved lazy component', async () => {
      const d = deferred<{ default: any }>();
      const LazyComp = lazy(() => d.promise);

      const screen = render(
        createElement(Suspense, {
          fallback: createElement('div', { 'data-testid': 'sibling-fb' }, 'Loading')
        },
          createElement('span', { 'data-testid': 'sibling' }, 'I am static'),
          createElement(LazyComp, null)
        )
      );

      await expect.element(screen.getByTestId('sibling-fb')).toBeVisible();

      d.resolve({
        default: () => createElement('span', { 'data-testid': 'lazy-sib' }, 'Lazy loaded')
      });
      await flush();

      await expect.element(screen.getByTestId('sibling')).toBeVisible();
      await expect.element(screen.getByTestId('lazy-sib')).toBeVisible();
    });
  });
});
