# add_task 重试与 confirm_tool_creation（阶段 1.4）

## 原则

1. **`add_task` 返回 `task.id` 后**：立即调用 **`confirm_tool_creation`**，用 D1 **按 `user_id` + `task_id` 读回**；仅当 `ok: true` 时可向用户声称「任务已创建」。
2. **重试 `add_task` 之前**：**必须先**再跑一次 **`confirm_tool_creation`**（对**上一次**返回的 `task_id`）：
   - 若 **已落库** → **视为成功**，**禁止**再次 `add_task`（避免重复任务）。
   - 若 **未落库**（`not_found`）→ 才允许下一次 `add_task`（至多 3 次，与产品约定一致）。
3. **`add_task` 工具层抛错 / 返回 `ok: false` 且无有效 `task.id`**：无需 confirm 行是否存在；可直接在修复参数后重试（仍建议记录 `correlation_id`）。

## 与表结构

- **不改表**：幂等依赖 **读库确认**；若未来需更强保证，可在 `detail_json` 或新列存 `client_correlation_id`。

## 相关代码

- `backend/src/tools/task-tools.ts` — `confirm_tool_creation` 工具
- `backend/src/db/repositories/task-repository.ts` — `findByIdForUser`
