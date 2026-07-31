import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// `vite dev` doesn't serve /api/* — that's Vercel's runtime. Mount the same
// handler locally so scanning works without `vercel dev`, with a minimal
// res.status().json() shim (Vercel adds those; plain Node http does not).
const mountApi = (server, route, file) => {
  server.middlewares.use(route, async (req, res) => {
    res.status = (code) => { res.statusCode = code; return res }
    res.json = (body) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }
    const { default: handler } = await server.ssrLoadModule(file)
    await handler(req, res)
  })
}
const apiDevServer = (env) => ({
  name: 'api-dev-server',
  configureServer(server) {
    Object.assign(process.env, env)
    mountApi(server, '/api/scan-receipt', '/api/scan-receipt.js')
    mountApi(server, '/api/scan-product', '/api/scan-product.js')
    mountApi(server, '/api/scan-deals', '/api/scan-deals.js')
    // Vercel runs this one on a Thursday cron; mounted here so you can trigger
    // a refresh by hand (?force=1 skips the "already ran this week" guard).
    mountApi(server, '/api/refresh-flyers', '/api/refresh-flyers.js')
    // Also cron-scheduled on Vercel (daily); mounted here so a run can be
    // triggered by hand while developing.
    mountApi(server, '/api/send-reminders', '/api/send-reminders.js')
  },
})

export default defineConfig(({ mode }) => {
  // load ALL vars (not just VITE_) so the dev API route sees ANTHROPIC_API_KEY
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      apiDevServer(env),
      VitePWA({
        // injectManifest, not generateSW: the service worker has to handle
        // `push` events (src/sw.js), which a generated one can't be taught.
        // skipWaiting/clientsClaim moved into that file — the `workbox` option
        // is ignored in this mode.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        // Without this no service worker is registered by `vite dev`, so
        // navigator.serviceWorker.ready never resolves and the push toggle
        // hangs — in dev only, which is exactly where it gets tested.
        devOptions: { enabled: true, type: 'module' },
        includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Monira',
          short_name: 'Monira',
          display: 'standalone',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
      }),
    ],
  }
})
