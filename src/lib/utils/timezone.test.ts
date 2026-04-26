import { describe, it, expect } from 'vitest';
import { toKST, parseUtc } from './timezone';

describe('parseUtc', () => {
  it('Z 접미사 UTC 문자열을 올바르게 파싱', () => {
    const d = parseUtc('2026-04-01T00:00:00.000Z');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(3); // 0-indexed
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(0);
  });

  it('KST 자정(+09:00)은 UTC 전날 15:00로 파싱', () => {
    const d = parseUtc('2026-04-01T00:00:00+09:00');
    expect(d.getUTCDate()).toBe(31); // 3월 31일
    expect(d.getUTCHours()).toBe(15);
  });
});

describe('toKST', () => {
  it('UTC 00:00 → KST "오전 9:00" 형태 문자열 반환', () => {
    // toKST는 DB/ISO 문자열 입력을 기대하므로 Date는 toISOString()으로 넘깁니다.
    const utc = new Date('2026-04-01T00:00:00Z').toISOString();
    const result = toKST(utc, 'time');
    expect(typeof result).toBe('string');
    expect(result).toContain('9:00');
  });

  it('UTC 15:00 → KST 자정 "오전 12:00" 반환', () => {
    const utc = new Date('2026-04-01T15:00:00Z').toISOString();
    const result = toKST(utc, 'time');
    expect(typeof result).toBe('string');
    expect(result).toContain('12:00');
  });
});
