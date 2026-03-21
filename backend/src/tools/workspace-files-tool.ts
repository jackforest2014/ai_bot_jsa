import type { FileService } from '../files/file-service';
import type { Tool } from './tool-registry';

/**
 * 技术方案 §9.2 `manage_workspace_files`：内部仅 `FileService.handleToolAction`。
 */
export function createWorkspaceFilesTool(fileService: FileService): Tool {
  return {
    name: 'manage_workspace_files',
    description:
      '列出、删除、重命名工作空间文件，或更新语义类型/标签（如 important）。用于「删掉上次上传的简历」「把学习资料标成重要」等。',
    parametersSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'delete', 'rename', 'set_semantic_type', 'set_tags'],
        },
        file_id: { type: 'string', description: 'delete/rename/set_* 时必填' },
        new_name: { type: 'string', description: 'rename 时必填，写入 original_name' },
        semantic_type: { type: 'string', description: 'set_semantic_type 时必填，可为空字符串清除' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'set_tags 时必填，覆盖式',
        },
        folder_path: { type: 'string', description: 'list 时可选：目录路径前缀过滤' },
        semantic_type_filter: { type: 'string', description: 'list 时按语义类型筛选' },
      },
      required: ['action'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, error: 'invalid_json' }) };
      }
      const result = await fileService.handleToolAction(ctx.userId, args);
      return { output: JSON.stringify(result) };
    },
  };
}
