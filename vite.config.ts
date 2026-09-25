import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/military-chess-online/' : '/',
  plugins: [react()],
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
}));
