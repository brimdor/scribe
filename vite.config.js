import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'server/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'tests/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    exclude: ['tests/e2e/**', 'playwright.config.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'dist/**',
        'node_modules/**',
        'tests/**',
        '**/*.config.js',
        '**/*.config.cjs',
        'vite.config.js',
        'server/src/app.js',
        // React components and contexts - require component-level testing (E2E only for now)
        'src/components/**',
        'src/context/**',
        'src/App.jsx',
        'src/main.jsx',
        // Backend routes - require dedicated route integration tests
        'server/src/routes/**',
        // Auth services - require E2E auth flow tests
        'src/services/auth.js',
        'server/src/services/event-log.js',
        'server/src/services/github-auth.js',
        'server/src/services/user-store.js',
        'server/src/utils/**',
        // Schemas - static data, minimal logic
        'src/schemas/**',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 60,
        statements: 75,
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
