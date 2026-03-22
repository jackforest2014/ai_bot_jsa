import type { FileStorageEnv } from './storage';
import type { QdrantEnv } from './vector';
import type { GeminiEnv } from './llm';
import type { QwenDashScopeEnv } from './llm/qwen-provider';

export type SerperEnv = {
  SERPER_API_KEY?: string;
  /** 单日 Serper 成功调用软上限（字符串数字，见 wrangler [vars]） */
  SERPER_DAILY_SOFT_LIMIT?: string;
};

export type Env = FileStorageEnv &
  QdrantEnv &
  GeminiEnv &
  QwenDashScopeEnv &
  SerperEnv & {
    /** 高德地图 Web 服务 Key（地理编码、路径规划、静态图）；勿提交到仓库 */
    AMAP_WEB_KEY?: string;
    task_assistant_db: D1Database;
    LLM_PROVIDER: string;
    LLM_MODEL: string;
    /** HS256 签发登录 JWT；生产务必用 wrangler secret / 强随机串 */
    JWT_SECRET?: string;
    /** 管理员：`/api/prompts` 使用 `Authorization: Bearer <secret>` 或 `X-Admin-Token` */
    ADMIN_API_SECRET?: string;
    /** `true` 时注册 `tree_of_thoughts` / `graph_of_thoughts`（PRD 外，多轮 LLM，默认关闭） */
    ENABLE_TOT_GOT_TOOLS?: string;
    /** Excel 类提取字符上限的粗略刻度（行数×系数），见 `file-text-extract` */
    FILE_EXCEL_MAX_ROWS?: string;
  };
