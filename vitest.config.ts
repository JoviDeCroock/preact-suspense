import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import preact from '@preact/preset-vite'

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [preact()],
        test: {
          name: 'browser',
          include: ['test/*.test.ts'],
          browser: {
            provider: playwright(),
            enabled: true,
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      },
      {
        // Server rendering has no DOM, so it runs outside the browser project.
        plugins: [preact()],
        test: {
          name: 'ssr',
          include: ['test/ssr/*.test.tsx'],
          environment: 'node',
        },
      },
    ],
  },
})
