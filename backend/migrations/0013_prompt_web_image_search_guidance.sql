-- 提示词：仅当用户明确要求「上网找现成图」时使用 search + type=images；非泛指「凡提图片就检索」

UPDATE prompt_templates
SET template_text = replace(
  template_text,
  '3. 当用户询问实时信息或需要外部知识时，调用 search 工具获取结果。',
  '3. 当用户询问实时信息或需要外部知识时，调用 search 工具获取结果。若用户明确要求从互联网查找或给出现成图片（如「帮我在网上找一张…图」「搜几张…的照片」），须将 search 的 type 设为 "images"，query 用中/英文关键词，从返回中选合规、可访问的图片，用 Markdown 图片语法 ![说明](图片URL) 嵌入回复。**不要**仅因对话里出现「图片」「配图」等字眼、或用户只需文字描述/概念解释/讨论本地与已有素材且未表达「上网找图」时，就调用 images 检索。'
)
WHERE id = 'default_prompt';

UPDATE prompt_templates
SET template_text = replace(
  template_text,
  '4. 如需最新行业信息，可调用 search 工具；用户资料在工作空间时可用 manage_workspace_files 查看元数据（勿臆造文件内容）。',
  '4. 如需最新行业信息，可调用 search 工具；用户资料在工作空间时可用 manage_workspace_files 查看元数据（勿臆造文件内容）。若用户明确要求从网上找现成图片，search 的 type 用 "images" 并以 Markdown ![说明](URL) 展示；无此明确诉求时不要仅因提到「图」就启用 images。'
)
WHERE id = 'interview_prompt';

UPDATE prompt_templates
SET template_text = replace(
  template_text,
  '1. 优先使用 search 工具检索公开来源，可按需切换 type（如 news、scholar、patents）。',
  '1. 优先使用 search 工具检索公开来源，可按需切换 type（如 news、scholar、patents、images）。**仅当用户明确要求从网上获取现成图片时**将 type 设为 "images"，query 用中/英文关键词，从返回中选合规、可访问的图，用 Markdown ![说明](图片URL) 嵌入；用户若只需文字调研、图表描述或未表达「找图」意图，不要仅因出现「图片」就调用 images。'
)
WHERE id = 'research_prompt';
