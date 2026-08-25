import { describe, expect, it } from 'vitest';
import { createElement } from 'preact';
import { renderToReadableStream } from 'preact-render-to-string/stream';
import { Suspense } from '../../src/suspense';

/** A component that throws until its promise settles. */
function createSuspender() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  let resolved = false;
  promise.then(() => (resolved = true));

  function Suspender() {
    if (!resolved) throw promise;
    return createElement('p', null, 'it works');
  }

  return { Suspender, resolve };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let html = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  return html;
}

describe('Suspense with the streaming renderer', () => {
  it('renders the fallback, then streams in the resolved subtree', async () => {
    const { Suspender, resolve } = createSuspender();

    const stream = renderToReadableStream(
      createElement(
        'div',
        null,
        createElement(Suspense, { fallback: 'loading...' }, createElement(Suspender, null))
      )
    );

    resolve();
    const html = await readAll(stream);

    expect(html).toContain('loading...');
    expect(html).toContain('<p>it works</p>');
  });
});
