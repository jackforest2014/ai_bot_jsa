/** 与技术方案 SearchTool `type` 枚举一致 */
export type SerperSearchType =
  | 'organic'
  | 'news'
  | 'images'
  | 'videos'
  | 'places'
  | 'shopping'
  | 'scholar'
  | 'patents';

export const SERPER_SEARCH_TYPES: readonly SerperSearchType[] = [
  'organic',
  'news',
  'images',
  'videos',
  'places',
  'shopping',
  'scholar',
  'patents',
] as const;

export function isSerperSearchType(s: string): s is SerperSearchType {
  return (SERPER_SEARCH_TYPES as readonly string[]).includes(s);
}
