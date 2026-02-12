import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode || 'test', process.cwd(), '');
    return {
        plugins: [react()],
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./tests/setup.ts'],
            include: ['tests/**/*.test.{ts,tsx}'],
            testTimeout: 30000,
            hookTimeout: 30000,
            env,
            coverage: {
                provider: 'v8',
                reporter: ['text', 'json', 'html'],
                include: ['lib/**/*.ts', 'app/api/**/*.ts'],
                exclude: ['node_modules', '.next', 'tests'],
            },
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
    };
});
