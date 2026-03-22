/**
 * 东八区「当日」起算 +delta 个**日历日**的 UTC 时间戳（取正午锚定，避免边界误差；中国无夏令时）。
 */
export function shanghaiCalendarUtcNoon(fromMs: number, deltaDays: number): number {
  const cur = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fromMs);
  const [yy, mm, dd] = cur.split('-').map(Number);
  return Date.UTC(yy, mm - 1, dd + deltaDays, 12, 0, 0);
}

/** 如 `2026年3月24日周二`（东八区；避免部分环境 `format` 成 `2026/3/24`） */
export function formatShanghaiDateWeekdayShort(ms: number): string {
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(ms);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = v('year');
  const m = v('month').replace(/^0+/, '') || v('month');
  const d = v('day').replace(/^0+/, '') || v('day');
  return `${y}年${m}月${d}日${v('weekday')}`;
}

/** 供 system 注入：从「明天」起连续多天的公历+星期，防止模型心算错「周二/周五」等 */
export function buildShanghaiRelativeDayTable(nowMs: number, numDays: number = 14): string {
  const lines: string[] = [];
  for (let i = 1; i <= numDays; i++) {
    const t = shanghaiCalendarUtcNoon(nowMs, i);
    const line = formatShanghaiDateWeekdayShort(t);
    let label: string;
    if (i === 1) label = '明天';
    else if (i === 2) label = '后天';
    else if (i === 3) label = '大后天';
    else label = `自今日起第${i}天`;
    lines.push(`${label}：${line}`);
  }
  return (
    '【东八区 · 相对日速查】\n' +
    '自**今日（东八区）**起的连续公历日与星期；向用户说「明天、后天、下周五」等时**必须与此表一致**，禁止心算错星期（如周二误说周一、周五误说周四）。\n' +
    lines.join('\n')
  );
}

/**
 * 每条对话请求在 system **最前**注入，减轻长模板淹没优先级；
 * 明确禁止「用训练截止日当今天」「反驳与系统一致的日期」「无工具时编造图片 URL」等失效模式。
 */
export function formatSystemClockBlock(nowMs: number = Date.now()): string {
  const unixSec = Math.floor(nowMs / 1000);
  const utcIso = new Date(nowMs).toISOString();
  const shanghai = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(nowMs);

  return (
    '【最高优先级 · 系统时钟与工具纪律】\n' +
    '以下时间由服务器在**本次请求**生成，代表**现实世界当前时刻**；其公历年份、日期优先于模型内部训练数据截止日期，也优先于你对「今年是哪一年」的直觉。\n' +
    `- Unix 时间戳（秒）：${unixSec}\n` +
    `- UTC（ISO 8601）：${utcIso}\n` +
    `- 东八区（Asia/Shanghai）：${shanghai}\n` +
    '\n' +
    '你必须遵守：\n' +
    '1. 判断「今天」「当前年份」「某节日是否已过」**只以上述时间为准**；**禁止**声称「真实世界仍是 2024 年」「系统运行在 2024」等与本节日期矛盾的表述。\n' +
    '2. 若用户陈述的日期与上述时间一致或更晚（例如用户说「今天已是 2026 年 x 月」且与东八区日期不冲突），**必须采信**，**禁止**以「知识截止」为由反驳用户日期。\n' +
    '3. **仅当**下方「可用工具列表」JSON 中出现 **name 为 \"search\"** 的工具时：用户明确要求**上网找图**，才须调用 **search** 且 **type 必须为 \"images\"**；**禁止**以「未来事件尚未发生」等理由拒调。**若工具列表中根本没有 search**，说明未配置联网搜索，不得假装已搜索（见后文【系统能力】若有）。\n' +
    '4. 使用 `![说明](URL)` 时：若已调用 search(images)，嵌入用的 URL **须**取自返回 JSON 的 **items[].image_url**（Serper 提供的图片直链）。若所有条目均无 `image_url`，应如实说明当前结果无私有可嵌入直链，可列出 `link` 供用户打开来源页，**禁止**自编任何图片 URL（如 xinhuanet.com 等）。**若无 search 工具**，不得输出伪装成检索结果的图片链。\n' +
    '5. **search(images) 结果不得做「主观鉴定」**：工具返回的 JSON 是「本次检索到的公开条目」的**唯一依据**。**禁止**用你对年份、节日是否已过、是否「全球尚无任何实拍」等**内在判断**来否定整批结果或写长篇「均非真实/均为 AI/均为预告」类结论（JSON 不会提供此类鉴定字段）。若无法嵌入，只陈述**与 JSON 直接相关**的原因，例如：无 `image_url`、仅有 `link`、或 `result_count` 为 0；措辞保持中立，例如「本次检索未返回可内嵌的图片直链」。\n' +
    '6. **用户查询中的公历年份、节日名与上方系统日期不冲突时，视为真实、正当的检索主题**；**禁止**暗示用户生活在「虚构时间线」或「错误假设今年是某年」。\n' +
    '7. **禁止**声称已对某 URL 做「浏览器打开」「HTTP 200/404 实测」等，除非本系统工具或日志明确提供该结果（模型无法代用户真实请求外网）。**禁止**用 `data:image/...` 内联图冒充「检索得到的图片直链」。**禁止**劝用户「不必再试」「不要再试了」等否定其继续提问权利的表述。\n' +
    '8. **日历与任务时间**：向用户说明或将写入任务的「明天、后天、下周一、下周五」等，**须先调用 `resolve_shanghai_calendar`**，以**本次请求**系统时间、东八区为准，采用工具返回的公历与星期（可与下方「东八区相对日速查」核对，**禁止心算星期**）。写入 `add_task` 时用工具给出的 `starts_at_unix`/`ends_at_unix` 或用户明确时刻换算后的 Unix 秒。**禁止**在向用户展示的正文中出现「速查表第几行」「复制第N行」等内部说法。\n' +
    '9. **任务日程与空档**：任务表含 `starts_at`/`ends_at` 时优先据此汇报；二者皆空时再参考描述文本。未绑定具体时间的待办，哪一天做仍**未知**。**禁止**写「某日无任务」类断言，除非**每一条**待办都已从时刻字段或描述中明确落到具体日期且你已逐条核对；不得因部分任务有日期、部分无，就推断某日空档。\n' +
    '10. **用户可见措辞**：除用户主动询问实现细节外，**不要**在正文里写工具名、JSON 字段名、数据库列名或系统注入话术；用自然语言向用户说明时间与安排即可。\n' +
    '\n' +
    buildShanghaiRelativeDayTable(nowMs, 14) +
    '\n'
  );
}
