import { describe, it, expect } from 'vitest';
import {
  wantsWeatherOrRealtimeWebSearch,
  wantsGeneralFactualWebLookup,
  wantsFactualWebLookup,
} from '../src/chat/detect-factual-web-search-intent';

describe('wantsWeatherOrRealtimeWebSearch', () => {
  it('matches Shanghai weather + 现在 + 看看/什么情况 (log phrase)', () => {
    expect(
      wantsWeatherOrRealtimeWebSearch('放松一下。看看现在上海的天气是什么情况。'),
    ).toBe(true);
  });

  it('requires time ref + lookup or interrogative', () => {
    expect(wantsWeatherOrRealtimeWebSearch('上海天气')).toBe(false);
    expect(wantsWeatherOrRealtimeWebSearch('今天上海天气怎么样')).toBe(true);
    expect(wantsWeatherOrRealtimeWebSearch('明天会下雨吗')).toBe(true);
  });

  it('does not match non-weather topics', () => {
    expect(wantsWeatherOrRealtimeWebSearch('现在几点了')).toBe(false);
  });
});

describe('wantsGeneralFactualWebLookup', () => {
  it('matches explicit 查/搜', () => {
    expect(wantsGeneralFactualWebLookup('帮我查一下英伟达最新财报数据')).toBe(true);
  });

  it('matches price + question', () => {
    expect(wantsGeneralFactualWebLookup('苹果股价现在多少')).toBe(true);
  });

  it('matches geo factual question', () => {
    expect(wantsGeneralFactualWebLookup('世界上人口最多的国家是哪个')).toBe(true);
  });

  it('does not match pure greeting', () => {
    expect(wantsGeneralFactualWebLookup('你好')).toBe(false);
  });
});

describe('wantsFactualWebLookup', () => {
  it('is true if either weather or general matches', () => {
    expect(wantsFactualWebLookup('今天上海天气怎么样')).toBe(true);
    expect(wantsFactualWebLookup('搜一下上海博物馆闭馆时间')).toBe(true);
  });
});
