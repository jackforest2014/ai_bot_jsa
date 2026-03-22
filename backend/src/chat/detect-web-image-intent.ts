/**
 * 用户是否明确要求「从网上找图 / 搜图并展示」（非泛泛提到「图片」二字）。
 */
export function wantsWebImageSearch(userInput: string): boolean {
  const t = userInput.trim();
  if (t.length < 4) return false;

  const explicitImage =
    /图|图片|照片|配图|插图|壁纸|截图|image|photo|picture|pic\b/i.test(t);
  /** 「再找两张」等：无「图」字也常表示继续要图 */
  const findImageByCount = /(再)?找(两|几|一|多)?张/i.test(t);
  const mentionsImage = explicitImage || findImageByCount;
  if (!mentionsImage) return false;

  const asksWebOrSearch =
    /网上|在线|联网|搜索|搜一?搜|检索|google|bing|serper|找一?张|找几张|帮我找|给.*找/i.test(
      t,
    );
  const embedIntent = /嵌入|贴图|直接显示|不要.*链接|不要点链接|inline/i.test(t);

  /** 跟进：换图、再搜、链失效（须本句已能判定与图相关，避免「换一张车票」误触发） */
  const imageFollowUp =
    (explicitImage || findImageByCount) &&
    /换一?张|再找|多找|再来|多搜|重新(搜|检索|找)|没显示|不显示|显示不出|加载不出|无效链接|还是无效|404|真实可用/i.test(
      t,
    );

  return asksWebOrSearch || embedIntent || imageFollowUp;
}
