/**
 * 识别「值得先走 Web 检索」的事实类问法，用于首轮收窄为 `search` + tool_choice required。
 * 天气/环境见 `wantsWeatherOrRealtimeWebSearch`；其余为保守扩展，避免闲聊误触发。
 */

export function wantsWeatherOrRealtimeWebSearch(userInput: string): boolean {
  const t = userInput.trim();
  if (t.length < 4) return false;

  const weatherTopic =
    /天气|气温|温度|降雨|下雨|下雪|刮风|风力|风速|雾霾|空气质量|\bAQI\b|紫外线|forecast|weather/i.test(
      t,
    );
  if (!weatherTopic) return false;

  const asksLookup =
    /看看|查查|查一下|查询|怎么样|什么情况|如何|是什么|告诉我|想了解|想知|播报|预报|实况|多少度|下不下|有没有雨|冷不冷|热不热|穿什么|带伞/i.test(
      t,
    );
  const interrogative = /[？?]|吗|么样|会不会|要不要|多少|咋样|怎样/.test(t);
  const timeRef =
    /现在|当前|今天|今晚|明天|后天|实时|近来|这几天|这会|眼下|外面/.test(t);

  if (!timeRef) return false;
  return asksLookup || interrogative;
}

/** 非天气类、但明显依赖外网摘要的事实询问 */
export function wantsGeneralFactualWebLookup(userInput: string): boolean {
  const t = userInput.trim();
  if (t.length < 8) return false;

  if (/^(你好|嗨|哈喽|谢谢|辛苦了|再见|哈哈|嗯嗯|好的|OK|ok|早安|晚安)[\s!！。…]*$/i.test(t)) {
    return false;
  }
  if (
    /假如|假设|如果你是|请扮演|写一首|编个故事|续写|小说|剧本对白|放松一下$|^放松一下$/i.test(t)
  ) {
    return false;
  }

  const explicitWeb =
    /查一下|查查|查询|搜索|搜一下|网上查|上网查|上网看看|百度一下|谷歌一下|帮我搜|去.*官网/i.test(t);

  const newsOrData =
    /最新|新闻|报道|公告|官方消息|数据|统计|人口|\bGDP\b|失业率|指数|比分|赛程|选举|发布|宣布|政策|条文|修订|生效|立案|判决/i.test(
      t,
    );
  const priceOrMarket = /股价|汇率|多少钱|价位|市值|行情|涨跌|收盘/i.test(t);
  const geoOrEntity =
    /位于哪|哪个国家|哪国|哪座城市|首都|领土|成立于|创立于|哪一年创立|历届|现任|前任|谁担任|谁当选/i.test(
      t,
    );
  const travelOrEvent = /攻略|景点|门票|开园|闭馆|展会|活动时间|赛程表|开幕式/i.test(t);

  const factualTopic = explicitWeb || newsOrData || priceOrMarket || geoOrEntity || travelOrEvent;

  const asks =
    /[？?]|吗\b|么样|什么样|什么|哪些|哪位|谁\b|多少|几个|是否|有没有|为啥|为什么|怎么.+了|指什么|是什么意思|是啥|近况|哪个|哪年|如何|怎样|说说|介绍|梳理/i.test(
      t,
    );

  if (explicitWeb) return true;
  if (factualTopic && asks) return true;
  if (newsOrData && /什么|怎样|如何|说说|介绍|梳理|有哪些/.test(t)) return true;

  return false;
}

/** 天气实况或广义事实询问：命中且已注册 Serper 时，首轮强制 `search(organic)` */
export function wantsFactualWebLookup(userInput: string): boolean {
  return (
    wantsWeatherOrRealtimeWebSearch(userInput) || wantsGeneralFactualWebLookup(userInput)
  );
}
