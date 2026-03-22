import { fireEvent, render, screen } from '@testing-library/react'

import Message from '@/components/chat/Message'
import type { ChatMessage } from '@/types/chat'

const assistantBase: ChatMessage = {
  id: 'm1',
  role: 'assistant',
  content: '',
}

describe('Message', () => {
  it('renders stream failure alert and retry', () => {
    const onRetry = vi.fn()
    render(
      <Message
        message={{
          ...assistantBase,
          streamFailed: true,
          streamErrorMessage: '连接中断',
        }}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('连接中断')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows backend notices from toolResultMetas', () => {
    render(
      <Message
        message={{
          ...assistantBase,
          content: '正文',
          streamMeta: {
            toolCalls: [],
            citations: [],
            toolResultMetas: [{ notice: 'Serper 软限，已降级' }],
          },
        }}
      />,
    )
    expect(screen.getByText('Serper 软限，已降级')).toBeInTheDocument()
  })

  it('renders user markdown body', () => {
    const msg: ChatMessage = { id: 'u1', role: 'user', content: 'Hello **world**' }
    const { container } = render(<Message message={msg} />)
    expect(container.querySelector('.md-user')).toBeTruthy()
  })
})
