/**
 * 意图分类（技术方案 §9.6），供 `ChatService` 选择 `prompt_templates.scenario`。
 * 实现可为规则、LLM 等可插拔实现。
 */
export interface IntentClassifier {
  classify(userInput: string): Promise<string>;
}

/**
 * 与任务 2.5 / §9.6 一致的意图标识（不含 fallback `default`）。
 * `default` 表示未命中下列任一类。
 */
export const KNOWN_INTENTS = [
  'greeting',
  'task_operation',
  'interview',
  'research',
  'route_query',
  'file_upload',
  'workspace_operation',
] as const;

export type KnownIntent = (typeof KNOWN_INTENTS)[number];

export type ResolvedIntent = KnownIntent | 'default';

/**
 * 按数组顺序匹配，**先命中先生效**（故 `file_upload` 排在 `workspace_operation` 前，
 * 避免「上传到工作空间」被误判为工作空间操作）。
 *
 * 说明：设计文档中的示例若在 Map 里为 default 配置「全通配」正则，会始终命中 default；
 * 此处不显式注册 default 规则，由 `classify` 末尾返回 `'default'`。
 */
const RULES: readonly { intent: KnownIntent; pattern: RegExp }[] = [
  {
    intent: 'task_operation',
    pattern:
      /(创建|新建|添加|增加|修改|更新|编辑|删除|移除|完成|勾选|取消)任务|待办|任务列表|我的任务|有哪些任务|当前任务|列出.*任务|task\b|(帮我)?(记一下|记下来|记得|提醒我)|列入.*待办|加进.*任务|还有什么任务|(明天|后天|大后天|下周|本周|这周|周[一二三四五六日天]).{0,50}(电话|致电|打给|拨打|拜访|见面|开会|会议|出差|去一趟)|(上午|下午|晚上|\d{1,2}\s*号).{0,55}(电话|致电|打给|拨打|拜访|见面|约见|开会|会议|出差|去一趟)|(电话|致电|拜访|见面|开会|会议|出差).{0,50}(明天|后天|下周|周[一二三四五六日天])/i,
  },
  {
    intent: 'greeting',
    pattern: /^\s*(你好|您好|hi|hello|嘿|早上好|下午好|晚上好|在吗|在么|哈喽|hey)/i,
  },
  {
    intent: 'interview',
    pattern: /面试|模拟面试|面试官|岗位|jd|简历面|行为面|技术面|mock\s*interview/i,
  },
  {
    intent: 'research',
    pattern: /研究|深度研究|调研|综述|报告|论文|专利检索|学术|scholar|literature/i,
  },
  {
    intent: 'route_query',
    pattern:
      /路线|导航|怎么去|怎么走|如何到|到.+怎么走|从.+到.+|乘.+去|开车去|驾车|步行去|骑行|骑车去|公交|地铁|打的|顺风车|路程|多远|多久到/i,
  },
  {
    intent: 'file_upload',
    pattern: /上传|附件|拖拽|添加附件|发一下文件|传.*文件|提交.*文档/i,
  },
  {
    intent: 'workspace_operation',
    pattern:
      /工作空间|工作区|文件夹|目录|删除.*文件|删掉.*文件|重命名|改名|改.*文件名|语义类型|打标签|标签|标记.*重要|manage_workspace/i,
  },
];

export class RuleBasedIntentClassifier implements IntentClassifier {
  constructor(
    /** 可注入覆盖默认规则（集成测试或 A/B） */
    private readonly rules: readonly { intent: KnownIntent; pattern: RegExp }[] = RULES,
  ) {}

  async classify(userInput: string): Promise<ResolvedIntent> {
    const text = userInput.trim();
    if (!text) return 'default';
    for (const { intent, pattern } of this.rules) {
      if (pattern.test(text)) return intent;
    }
    return 'default';
  }
}

/** 默认规则表（只读），供文档或单测引用 */
export function getDefaultIntentRules(): readonly { intent: KnownIntent; pattern: RegExp }[] {
  return RULES;
}
