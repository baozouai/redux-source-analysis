import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "redux": "/src/packages/redux/src",
      "react-redux": "/src/packages/react-redux/src",
      "redux-logger": "/src/packages/redux-logger/src/index.js",
      "redux-thunk": "/src/packages/redux-thunk/src",
      "redux-undo": "/src/packages/redux-undo/src",
      "use-sync-external-store": "/src/packages/use-sync-external-store",
      "use-sync-external-store/extra": "/src/packages/use-sync-external-store/extra",
      "@/examples": "/src/examples"
    },
    extensions: [".tsx", '.jsx', '.js', '.ts']
  },
  server: {
    force: true,
    open: true,
  },
})
