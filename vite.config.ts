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
        includeAssets: ['favicon.svg', 'favicon.ico', 'logo.png', 'icon-192.png', 'icon-512.png'],
        workbox: {
            // The app bundle passed Workbox's 2 MiB default and failed the
            // build outright. Raising the ceiling keeps the PWA installable
            // offline; splitting the routes so the bundle shrinks again is the
            // real fix and is still outstanding.
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            // The API must never be served from cache: officers would see stale
            // attendance and leave figures, and a cached 401 would look like a
            // broken login.
            navigateFallbackDenylist: [/^\/api\//],
            runtimeCaching: [
                {
                    urlPattern: /^\/api\//,
                    handler: 'NetworkOnly',
                },
            ],
        },
        manifest: {
            id: "/",
            name: "My Niyagama",
            short_name: "Niyagama",
            description: "Divisional Secretariat information system: attendance, leave, resources and community.",
            lang: "en",
            start_url: "/",
            scope: "/",
            display: "standalone",
            orientation: "portrait-primary",
            background_color: "#0f172a",
            theme_color: "#1877F2",
            categories: ["government", "productivity"],
            // These paths are the files that actually exist in public/. The old
            // manifest pointed at /icons/*, a directory that was never created,
            // and the 512 maskable file had a trailing space in its name so it
            // resolved to the SPA's HTML instead of a PNG.
            icons: [
                { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
                { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
                { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
                { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            ],
            screenshots: [
                { src: "/screenshot-mobile.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "Officer portal" },
                { src: "/screenshot-desktop.png", sizes: "1920x1080", type: "image/png", form_factor: "wide", label: "Command dashboard" },
            ],
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
