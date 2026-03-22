import type { UserRepository } from '../db';
import type { Tool } from './tool-registry';

/**
 * 对话内更新当前用户资料（与 REST `/api/user` 能力对齐，严禁改他人数据）。
 */
export function createUpdateUserProfileTool(users: UserRepository): Tool {
  return {
    name: 'update_user_profile',
    description:
      '更新当前登录用户的姓名、邮箱、AI 助手昵称或偏好（preferences 对象会写入 preferences_json）。仅影响本人账号。',
    parametersSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        ai_nickname: { type: 'string', description: '助手昵称' },
        preferences: {
          type: 'object',
          description: '与 users.preferences_json 合并前的完整对象（覆盖式写入）',
        },
      },
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, error: 'invalid_json' }) };
      }

      const patch: Parameters<UserRepository['update']>[1] = {};
      if (typeof args.name === 'string' && args.name.trim()) {
        const name = args.name.trim();
        if (await users.isNameTakenByOther(name, ctx.userId)) {
          return {
            output: JSON.stringify({
              ok: false,
              error: 'name_taken',
              message: '该名称已被其他账号使用',
            }),
          };
        }
        patch.name = name;
      }
      if (typeof args.ai_nickname === 'string' && args.ai_nickname.trim()) {
        patch.ai_nickname = args.ai_nickname.trim();
      }
      if (Object.prototype.hasOwnProperty.call(args, 'email')) {
        if (args.email === null || (typeof args.email === 'string' && !args.email.trim())) {
          patch.email = null;
        } else if (typeof args.email === 'string') {
          const email = args.email.trim().toLowerCase();
          const other = await users.findByEmail(email);
          if (other && other.id !== ctx.userId) {
            return {
              output: JSON.stringify({
                ok: false,
                error: 'email_taken',
                message: '该邮箱已被其他账号使用',
              }),
            };
          }
          patch.email = email;
        }
      }
      if (Object.prototype.hasOwnProperty.call(args, 'preferences')) {
        const p = args.preferences;
        if (p !== null && typeof p === 'object') {
          patch.preferences_json = JSON.stringify(p);
        } else if (p === null) {
          patch.preferences_json = null;
        }
      }

      if (Object.keys(patch).length === 0) {
        return { output: JSON.stringify({ ok: false, error: 'no_fields_to_update' }) };
      }

      await users.update(ctx.userId, patch);
      const row = await users.findById(ctx.userId);
      return {
        output: JSON.stringify({
          ok: true,
          user: row
            ? {
                id: row.id,
                name: row.name,
                email: row.email,
                ai_nickname: row.ai_nickname,
                preferences_json: row.preferences_json,
              }
            : null,
        }),
      };
    },
  };
}
