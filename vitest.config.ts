import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The markup builder needs no DOM, but the client half is nothing but DOM,
    // and one environment for both keeps the suite a single run.
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
