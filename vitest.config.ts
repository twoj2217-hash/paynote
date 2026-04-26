// Task 2 최소 품질 게이트: 스모크 테스트만 수집하도록 범위를 제한
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    alias: {
      '$lib': new URL('./src/lib', import.meta.url).pathname
    }
  }
});
