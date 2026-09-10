import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';

// Automatically load .env.test for all test executions
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@/shared': path.resolve(__dirname, 'src/shared'),
      '@/core': path.resolve(__dirname, 'src/core'),
      '@/api': path.resolve(__dirname, 'src/api'),
      '@/cli': path.resolve(__dirname, 'src/cli'),
      '@taro/shared': path.resolve(__dirname, 'src/shared'),
      '@taro/core': path.resolve(__dirname, 'src/core'),
    },
  },
});
