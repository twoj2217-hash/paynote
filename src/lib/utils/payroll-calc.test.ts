import { describe, it, expect } from 'vitest';
import {
  calculateWorkDuration,
  calculatePay,
  calculateMonthlyAllowance
} from './payroll-calc';

// Z 형식 통일 — KST = UTC+9
const T09     = '2026-04-01T00:00:00Z'; // KST 09:00
const T17     = '2026-04-01T08:00:00Z'; // KST 17:00
const T22     = '2026-04-01T13:00:00Z'; // KST 22:00
const T06next = '2026-04-01T21:00:00Z'; // KST 다음날 06:00
const end4h   = '2026-04-01T04:00:00Z'; // KST 13:00 (4시간 후)

describe('calculateWorkDuration', () => {
  it('정확히 8시간 근무 → totalMinutes 480', () => {
    const result = calculateWorkDuration(T09, T17);
    expect(result.isInvalid).toBe(false);
    expect(result.totalMinutes).toBe(480);
  });

  it('자정 넘기는 근무 (22:00~06:00) → totalMinutes 480', () => {
    const result = calculateWorkDuration(T22, T06next);
    expect(result.isInvalid).toBe(false);
    expect(result.totalMinutes).toBe(480);
  });

  it('clock_out null → isEstimate true (1시간 전 출근 기준)', () => {
    const recentClockIn = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = calculateWorkDuration(recentClockIn, null);
    expect(result.isEstimate).toBe(true);
    expect(result.isInvalid).toBe(false);
  });

  it('clock_in null → isInvalid true', () => {
    const result = calculateWorkDuration(null, null);
    expect(result.isInvalid).toBe(true);
  });
});

describe('calculatePay', () => {
  it('시급 10320원 × 8시간 → basePay 82560원', () => {
    const result = calculatePay(T09, T17, 10_320);
    expect(result.basePay).toBe(82_560);
  });

  it('시급 12000원 × 4시간 → basePay 48000원', () => {
    const result = calculatePay(T09, end4h, 12_000);
    expect(result.basePay).toBe(48_000);
  });

  it('clock_out null → isEstimate true (1시간 전 출근 기준)', () => {
    const recentClockIn = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = calculatePay(recentClockIn, null, 10_320);
    expect(result.workDuration.isEstimate).toBe(true);
    expect(result.workDuration.isInvalid).toBe(false);
  });
});

describe('calculateMonthlyAllowance', () => {
  it('주 5일 계약, 주 40시간 개근 → totalAllowance > 0', () => {
    // 2026-04-06(월)~04-10(금) 각 8시간
    const timecards = [
      { clock_in: '2026-04-06T00:00:00+09:00', clock_out: '2026-04-06T08:00:00+09:00' },
      { clock_in: '2026-04-07T00:00:00+09:00', clock_out: '2026-04-07T08:00:00+09:00' },
      { clock_in: '2026-04-08T00:00:00+09:00', clock_out: '2026-04-08T08:00:00+09:00' },
      { clock_in: '2026-04-09T00:00:00+09:00', clock_out: '2026-04-09T08:00:00+09:00' },
      { clock_in: '2026-04-10T00:00:00+09:00', clock_out: '2026-04-10T08:00:00+09:00' },
    ];
    const result = calculateMonthlyAllowance(timecards, 10_320, 5, 2026, 4);
    expect(result.totalAllowance).toBeGreaterThan(0);
  });

  it('근무 0일 → totalAllowance 0원', () => {
    const result = calculateMonthlyAllowance([], 10_320, 5, 2026, 4);
    expect(result.totalAllowance).toBe(0);
  });
});
