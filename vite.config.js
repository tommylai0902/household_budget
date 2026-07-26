import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// `vite dev` doesn't serve /api/* — that's Vercel's runtime. Mount the same
// handler locally so scanning works without `vercel dev`, with a minimal
// res.status().json() shim (Vercel adds those; plain Node http does not).
const apiDevServer = (env) => ({
  name: 'api-dev-server',
  configureServer(server) {
    Object.assign(process.env, env)
    server.middlewares.use('/api/scan-receipt', async (req, res) => {
      res.status = (code) => { res.statusCode = code; return res }
      res.json = (body) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
      }
      const { default: handler } = await server.ssrLoadModule('/api/scan-receipt.js')
      await handler(req, res)
    })
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
        registerType: 'autoUpdate',
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
