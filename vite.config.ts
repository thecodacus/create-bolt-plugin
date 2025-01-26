import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'index',
            fileName: 'index',
            formats: ['es']
        },
        rollupOptions: {
            external: [], // List external dependencies if any
            output: {
                format: 'es',
                inlineDynamicImports: true,
                banner: '#!/usr/bin/env node'
            }
        },
        target: 'node18',
        ssr: true,
        minify: true
    }
});
