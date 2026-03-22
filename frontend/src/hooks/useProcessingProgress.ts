import { useEffect, useState } from 'react'

import type { FileProcessed } from '@/types/file'

/**
 * `processed === 0` 时后端无细粒度进度：用渐近曲线模拟 0→~92%，列表轮询到 `1` 后由父组件隐藏。
 */
export function useProcessingProgress(fileId: string, processed: FileProcessed): number {
  const [simulated, setSimulated] = useState(0)

  useEffect(() => {
    if (processed !== 0) {
      setSimulated(processed === 1 ? 100 : 0)
      return
    }

    setSimulated(0)
    const t0 = Date.now()
    const id = window.setInterval(() => {
      const sec = (Date.now() - t0) / 1000
      setSimulated(Math.min(92, 100 * (1 - Math.exp(-sec / 14))))
    }, 320)
    return () => window.clearInterval(id)
  }, [fileId, processed])

  if (processed === 1) return 100
  if (processed === -1) return 0
  return simulated
}
