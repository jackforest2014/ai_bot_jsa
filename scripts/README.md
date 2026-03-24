# 仓库脚本（`scripts/`）

本目录放**与业务代码解耦**的维护脚本（文档校验、一次性迁移等）。

## `check-presentation-toc.mjs`

### 用途

- 扫描 `docs/presentation/*.md` 中 **`## 目录`** 下的链接：`- [章节标题](#锚点)`。
- 用 **[github-slugger](https://github.com/Flet/github-slugger)** 生成 slug，与 **GitHub（及多数兼容 GFM 的预览）** 的标题锚点规则对齐。
- 检查目录里的 **显示文字** 是否与文中某个 **`##` 二级标题**（不含 `## 目录` 本身）完全一致，避免「点了目录却跳不到章节」。

修改章节标题后若忘记同步目录，脚本会报错退出。

### 前置条件

- **Node.js** 18+（推荐 20+，脚本为 ESM）。
- 在**仓库根目录**执行过一次依赖安装（见下）。

### 如何使用

在仓库根目录：

```bash
npm install
npm run check:presentation-toc
```

或直接：

```bash
node scripts/check-presentation-toc.mjs
```

自定义要扫描的目录（相对仓库根的路径或绝对路径均可通过 `--dir` 传入；下面示例为相对根目录）：

```bash
node scripts/check-presentation-toc.mjs --dir docs/presentation
```

查看帮助：

```bash
node scripts/check-presentation-toc.mjs --help
```

### 退出码

| 码 | 含义 |
|----|------|
| 0 | 全部通过 |
| 1 | 发现锚点错误或目录文字与 `##` 标题不一致 |
| 2 | 参数/目录错误，或未找到任何带目录的 `.md` |

### 局限与说明

- **只校验二级标题 `##`**：目录条目应对应文中的 `## 标题`，不校验 `###`。
- **目录区块**：从 `## 目录` 下一行起，连续匹配 `- [text](#hash)`；遇空行可跳过；遇单独一行的 `---` 或下一个 `## ...`（非列表行）即结束解析。
- 若使用 **非 GitHub** 的渲染器（部分站点对中文/标点 slug 规则不同），锚点可能与脚本结论不一致；本仓库文档以 GitHub 预览为准。

### CI 建议（可选）

在 CI 中于 `npm install` 后增加一步：

```bash
npm run check:presentation-toc
```

与 `eslint` / 单测并列即可，失败时阻止合并。
