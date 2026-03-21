import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import AppRouter from '@/router/index'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <AppRouter />
    </BrowserRouter>
  )
}
