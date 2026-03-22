import { render, screen } from '@testing-library/react'

import ToolCallMark from '@/components/chat/ToolCallMark'

describe('ToolCallMark', () => {
  it('labels search tool as 搜索 and shows query in popover', async () => {
    render(
      <ToolCallMark
        toolMeta={{
          tool: 'search',
          query: 'weather today',
          items: [{ title: 'Result A', url: 'https://a.example' }],
        }}
      />,
    )
    expect(screen.getByRole('button', { name: /工具：搜索/ })).toBeInTheDocument()
  })

  it('parses fallback JSON inner when no meta', () => {
    const inner = JSON.stringify({
      query: 'q',
      items: [{ title: 'T', url: 'https://u' }],
    })
    render(<ToolCallMark fallbackInner={inner} />)
    expect(screen.getByRole('button', { name: /工具/ })).toBeInTheDocument()
  })
})
