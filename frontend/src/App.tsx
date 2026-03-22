import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import AppRouter from '@/router/index'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          className: '!text-sm !shadow-lg !border !border-slate-200',
          style: { background: '#fff', color: '#0f172a' },
          success: { duration: 3500 },
          error: { duration: 5500 },
        }}
      />
      <AppRouter />
    </BrowserRouter>
  )
}
