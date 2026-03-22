import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('exposes 已索引 in accessible name when processed is 1', () => {
    render(<FileCard file={makeFile(1)} layout="grid" {...handlers} />)
    expect(screen.getByRole('article', { name: /doc\.txt.*已索引/ })).toBeInTheDocument()
  })

  it('exposes 处理中 in accessible name when processed is 0', () => {
    render(<FileCard file={makeFile(0)} layout="grid" {...handlers} />)
    expect(screen.getByRole('article', { name: /doc\.txt.*处理中/ })).toBeInTheDocument()
  })

  it('opens context menu and runs 重新处理 when processed is -1', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <FileCard file={makeFile(-1)} layout="grid" {...handlers} onRetryProcess={onRetry} />,
    )
    expect(screen.getByRole('article', { name: /处理失败/ })).toBeInTheDocument()
    const row = screen.getByTitle(/悬浮查看详情/)
    fireEvent.contextMenu(row)
    await user.click(await screen.findByRole('menuitem', { name: '重新处理' }))
    expect(onRetry).toHaveBeenCalledWith('f1')
  })

  it('shows 失败原因 in hover panel when process_error is set', async () => {
    const f = { ...makeFile(-1), process_error: '无法解析或提取正文：PDF 文本提取过少' }
    render(<FileCard file={f} layout="grid" {...handlers} />)
    const row = screen.getByTitle(/悬浮查看详情/)
    fireEvent.mouseEnter(row)
    await waitFor(() => {
      expect(screen.getByText(/失败原因：/)).toBeInTheDocument()
      expect(screen.getByText(/PDF 文本提取过少/)).toBeInTheDocument()
    })
  })
})
