// 테스트 러너가 정상 작동하는지 빠르게 확인하는 스모크 테스트
import { describe, expect, it } from 'vitest';

describe('smoke test', () => {
  it('기본 산술이 정상 동작한다', () => {
    expect(1 + 1).toBe(2); // 가장 단순한 PASS 기준
  });
});
