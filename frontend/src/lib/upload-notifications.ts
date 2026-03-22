/**
 * 上传完成后的系统通知（阶段六 6.1）：仅在用户已授权 Notification 时展示。
 */

function canUseNotification(): boolean {
  return typeof Notification !== 'undefined'
}

/** 在用户与页面交互路径中调用（如首次点选上传），以尽量满足浏览器对 requestPermission 的要求 */
export async function requestUploadNotificationPermission(): Promise<NotificationPermission> {
  if (!canUseNotification()) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function notifyUploadResult(ok: boolean, fileName: string): void {
  if (!canUseNotification() || Notification.permission !== 'granted') return
  const title = ok ? '上传成功' : '上传失败'
  const body = ok ? fileName : `${fileName}（请在工作区查看详情）`
  try {
    new Notification(title, { body, tag: 'file-upload', silent: false })
  } catch {
    /* 部分环境仍可能抛错 */
  }
}
