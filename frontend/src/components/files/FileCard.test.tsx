import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import FileCard from '@/components/files/FileCard'
import type { FileInfo } from '@/types/file'

function makeFile(processed: FileInfo['processed']): FileInfo {
  return {
    id: 'f1',
    original_name: 'doc.txt',
    mime_type: 'text/plain',
    size: 128,
    semantic_type: 'note',
    folder_path: 'work',
    tags: ['a'],
    processed,
    created_at: 1_700_000_000,
  }
}

describe('FileCard', () => {
  const noop = () => {}
  const handlers = {
    onRename: noop,
    onDelete: noop,
    onDownload: noop,
    onEditMeta: noop,
  }

  it('shows 已索引 when processed is 1', () => {
    render(<FileCard file={makeFile(1)} layout="grid" {...handlers} />)
    expect(screen.getByText('已索引')).toBeInTheDocument()
  })

  it('shows 处理中 when processed is 0', () => {
    render(<FileCard file={makeFile(0)} layout="grid" {...handlers} />)
    expect(screen.getByText('处理中')).toBeInTheDocument()
  })

  it('shows 处理失败 and 重新处理 when processed is -1', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <FileCard file={makeFile(-1)} layout="grid" {...handlers} onRetryProcess={onRetry} />,
    )
    expect(screen.getByText('处理失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新处理' }))
    expect(onRetry).toHaveBeenCalledWith('f1')
  })

  it('shows 失败原因 when process_error is set', () => {
    const f = { ...makeFile(-1), process_error: '无法解析或提取正文：PDF 文本提取过少' }
    render(<FileCard file={f} layout="grid" {...handlers} />)
    expect(screen.getByText(/失败原因：/)).toBeInTheDocument()
    expect(screen.getByText(/PDF 文本提取过少/)).toBeInTheDocument()
  })
})
