import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the pure helpers in src/lib only. Nothing here imports
 * react-native, so no Expo/RN transform is needed — keep it that way and these
 * stay fast. Component tests would need a different setup entirely.
 */
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
});
