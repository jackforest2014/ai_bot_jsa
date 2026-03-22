import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import ThemeSync from '@/components/ThemeSync'
import AppRouter from '@/router/index'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeSync />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          className:
            '!text-sm !shadow-lg !border !border-slate-200 dark:!border-slate-600 dark:!bg-slate-900 dark:!text-slate-100',
          style: { background: '#fff', color: '#0f172a' },
          success: { duration: 3500 },
          error: { duration: 5500 },
        }}
      />
      <AppRouter />
    </BrowserRouter>
  )
}
