/**
 * 向量存储抽象。Payload 字段与 tech_design_ai_bot §4.2 对齐：
 * user_id, type, source, timestamp, file_id?, semantic_type?, folder_path?, tags?
 */
export type MemoryVectorPayload = {
  user_id: string;
  type: 'conversation' | 'document';
  source: string;
  timestamp: number;
  file_id?: string;
  semantic_type?: string;
  folder_path?: string;
  tags?: string[];
};

export interface VectorPoint {
  id: string;
  vector: number[];
  /** 与 Qdrant payload 一致的可索引元数据 */
  payload: MemoryVectorPayload | Record<string, unknown>;
}

export interface VectorStore {
  upsert(points: VectorPoint[]): Promise<void>;
  /**
   * @param filter 简易扁平过滤：各键转为 Qdrant `must` + `match`；
   * 若传入对象已含 `must`/`should`/`must_not` 顶层键，则视为原生 Qdrant filter 透传。
   */
  search(vector: number[], filter?: Record<string, unknown>, limit?: number): Promise<VectorPoint[]>;
  delete(ids: string[]): Promise<void>;
}
