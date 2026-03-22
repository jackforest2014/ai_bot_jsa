# 前端对话区：流式输出时的贴底滚动、抖动与用户气泡「沉底」

本文记录在开发 **Chat 消息列表自动贴底** 过程中遇到的现象、误判的根因，以及当前采用的实现策略。实现代码集中在 `frontend/src/hooks/useStickToBottomScroll.ts`，由 `frontend/src/pages/Chat/index.tsx` 挂载滚动容器与 `contentRef`，`frontend/src/components/chat/MessageList.tsx` 含列表底部留白。

---

## 1. 现象（按时间线）

| 现象 | 用户体感 |
|------|----------|
| **剧烈上下抖** | SSE 推 token 时，列表频繁改高度，视口像在「拽着」内容上下晃；含 Markdown 图片、代码高亮时更明显。 |
| **无图也抖** | 在收紧图片场景后，纯文本流式仍持续抖动。 |
| **用户气泡「往下沉」** | 发送后自己的气泡一度不在可视区内，需要手动把滚动条往上拖才能看到。 |
| **与读屏/aria-live 的取舍** | 流式时 `aria-live` 持续播报会加重浏览器工作；已在 `MessageList` 对流式关闭 `aria-live`（见组件注释），与滚动问题并列优化体感。 |

---

## 2. 尝试过但效果不佳或引入回归的做法

| 做法 | 问题 |
|------|------|
| **`ResizeObserver` + 每次高度变化立刻 `scrollTop = scrollHeight`** | 与布局、Markdown 重排容易形成反馈；高频写入 `scrollTop` 放大抖动。 |
| **`setTimeout` 防抖（如 45ms）跟滚** | 发送后同一轮里很快 `streaming === true`，非结构性更新全走防抖，**新用户消息已进 DOM 却不能立刻贴底**，出现「沉底」；防抖步进本身也会像阶梯式跳动。 |
| **「仅结构性变化立即贴底 + 流式仍防抖」** | 结构性判断也依赖与 `streaming` 的时序，仍可能与 `setMessages`/`setStreaming(true)` 同一提交交错，体感和抖动问题未根治。 |
| **在 `send` 之前 `scrollToBottom`（如 `afterUserSentIntent` 里立刻滚）** | 此时新用户消息尚未写入 React state，滚的是**旧内容的底**，对「刚发出的气泡」无帮助，还与后续 layout 抢时机。 |
| **滚动容器上 `overflow-anchor: none`** | 意图是减少浏览器锚点与程序化滚底的「打架」；实际配合频繁改 `scrollTop` 时，**削弱默认 scroll anchoring**，图片加载与块级重排时反而更容易出现整体视口跳动。 |

---

## 3. 根因归纳

1. **流式阶段 `messages` 更新极频**：每条 token 或每次合并渲染都会触发「要不要贴底」的逻辑；若每次都在 `useLayoutEffect` 里**同步**把 `scrollTop` 设到最大值，会与 Markdown / `rehype-highlight` 等造成的**中间布局高度波动**叠加，表现为抖动。  
2. **贴底时机错误**：贴底必须发生在**新消息已提交到 DOM 之后**；依赖 `useLayoutEffect` 观察 **`messages` 结构变化**（条数或末条 `id`）比「发送前强行滚」可靠。  
3. **`streaming === true` 时误用慢路径**：发送当轮会立刻进入流式状态，若「非结构性更新」统一走防抖或慢路径，会把**本应同步的「新行入列」**也拖慢，用户气泡短暂离开视口。  
4. **亚像素与「已在底部」仍写 `scrollTop`**：即使目标已是底部，反复赋值可能带来肉眼可见的微颤；流式跟滚应对「离底距离」做阈值判断。

---

## 4. 当前方案（稳定版）

### 4.1 策略分工

| 场景 | 行为 |
|------|------|
| **列表结构变化**（`messages.length` 或**最后一条**的 `id` 变化） | 在 **`useLayoutEffect` 内同步** `scrollTop = scrollHeight - clientHeight`，保证新用户行 / 新助手占位**立刻贴底**。 |
| **`streaming === false`**（含流式结束） | 同样在 layout 中**同步贴底**，收束最终位置并取消未执行的流式 rAF。 |
| **流式中且仅为同一条助手内容变长**（结构不变） | **不在** layout 里反复滚底；用 **`ResizeObserver` 观察 `contentRef` 包裹层**，在高度变化时 **最多调度一次 `requestAnimationFrame`**，在 rAF 内调用「按需贴底」。 |

### 4.2 辅助细节

- **`nudgeToBottomIfNeeded`**：若 `target - scrollTop <= 2`（像素）则不再写 `scrollTop`，减轻亚像素与小幅重排导致的来回拽动。  
- **程序化滚底时**短暂 `ignoreScrollEventsRef`，避免紧随的 `scroll` 事件把 **`pinned`** 误判成「用户已离开底部」。  
- **`afterUserSentIntent`**：只恢复 **`pinnedRef = true`**，**不**在此处滚到底；真正滚底交给下一次 **结构变化 + layout**。  
- **布局/CSS**：保留 **`scrollbar-gutter: stable`** 减轻滚动条显隐带来的横向跳动；**去掉**滚动容器上的 **`overflow-anchor: none`**，恢复浏览器默认锚定，有利于图片与块级内容加载时的稳定。  
- **列表底部**：`MessageList` 内增加 **`pb-2` + 底部 `h-2` 占位**，避免最后一条气泡紧贴滚动条下沿，贴底时更易读。

### 4.3 相关文件

| 文件 | 作用 |
|------|------|
| `frontend/src/hooks/useStickToBottomScroll.ts` | 贴底、`pinned`、RO + rAF 流式跟滚。 |
| `frontend/src/pages/Chat/index.tsx` | `scrollRef` / `contentRef`、`onScroll`、`afterUserSentIntent` 与发送流程衔接。 |
| `frontend/src/components/chat/MessageList.tsx` | 底部留白；流式时 `aria-live="off"`。 |

---

## 5. 后续若改动的注意点

- **虚拟列表**：若消息区改为虚拟滚动，`scrollHeight` 与「真实文档高度」语义会变，需要重新约定「贴底」与 RO 观察节点。  
- **把输入区放进滚动容器**：贴底目标可能从「消息底」变成「输入框上沿」，需单独产品定义。  
- **再次引入 `overflow-anchor: none`**：需配合测量，确认不会复现「无图也抖」类回归。

---

## 6. 一句话备忘

**新行用 layout 同步贴底；流式长高用 ResizeObserver + 每帧一次 rAF 轻推；少写无意义的 `scrollTop`；不要轻易关掉 `overflow-anchor`。**
