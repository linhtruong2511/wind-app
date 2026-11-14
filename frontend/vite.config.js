import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === 'serve' ? '/' : '/static/wind_management/dist/',
    build: {
        outDir: path.resolve(__dirname, '../src/geonode_project/static/wind_management/dist'),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: 'wind_app.js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                        return 'wind_app.css';
                    }
                    return 'assets/[name]-[hash][extname]';
                }
            }
        }
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        cors: true,
        origin: 'http://localhost:5173',
        hmr: {
            host: 'localhost',
        },
        proxy: {
            '/wind/api': 'http://localhost',
            '/geoserver': 'http://localhost'
        }
    }
}));
