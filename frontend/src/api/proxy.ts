import { request } from '@/api/client'
import type { FileInfo } from '@/types/file'

export const proxyAPI = {
  uploadPersona: async (file: File): Promise<{ file: FileInfo; proxy_uuid: string }> => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder_path', '人设')

    return request<{ file: FileInfo; proxy_uuid: string }>('api/proxy/upload', {
      method: 'POST',
      body: fd,
    })
  },
  
  getProxyInfo: (uuid: string): Promise<{ proxy_uuid: string; nickname?: string }> => {
    return request<{ proxy_uuid: string; nickname?: string }>(`api/proxy/${uuid}/info`)
  }
}
