import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'todoWidget',
      filename: 'remoteEntry.js',
      exposes: {
        './Widget': './src/Widget.jsx'
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^19.0.0',
          import: false
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^19.0.0',
          import: false
        }
      }
    })
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  },
  base: '/todo-widget/'
})
