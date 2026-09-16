import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
    tailwindcss(),
    react(),
    VitePWA({
        registerType: 'autoUpdate',

        manifest: {
            id: "/",
            name: "My Niyagama",
            short_name: "Niyagama",

            start_url: "/",

            scope: "/",

            display: "standalone",

            background_color: "#0f172a",

            theme_color: "#3b82f6",

            icons: [
                {
                    src: "/icons/icon-192.png",
                    sizes: "192x192",
                    type: "image/png"
                },
                {
                    src: "/icons/icon-512.png",
                    sizes: "512x512",
                    type: "image/png"
                }
            ]
        }
    }),
],
      resolve: {
        alias: {
          '@': path.resolve(process.cwd(), '.'),
        }
      }
    };
});
