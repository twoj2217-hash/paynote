// SvelteKit + TypeScript 기본 lint 설정
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default [
  {
    // 현재 저장소의 외부/생성 산출물은 lint 범위에서 제외
    ignores: ['review-ai/**', '.agents/**', '.claude/**', '.cursor/**', 'dist/**', '.svelte-kit/**']
  },
  js.configs.recommended, // JS 기본 규칙
  ...tseslint.configs.recommended, // TS 기본 규칙
  ...svelte.configs['flat/recommended'], // Svelte 권장 규칙
  // Svelte 파일 안의 <script lang="ts">는 TypeScript 파서로 파싱해야 합니다.
  {
    files: ['**/*.svelte'],
    languageOptions: {
      // CSR·SSR 겸용 컴포넌트에서 브라우저/Node API를 쓰므로 둘 다 허용합니다.
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  // 점진적 정리: 당장은 경고로 두고 CI에서는 max-warnings로 통제합니다.
  {
    files: ['**/*.svelte'],
    rules: {
      'svelte/require-each-key': 'warn',
      'svelte/no-navigation-without-resolve': 'warn',
      'svelte/prefer-svelte-reactivity': 'warn',
      'svelte/no-unused-svelte-ignore': 'warn'
    }
  },
  {
    files: ['**/*.{js,ts,svelte}'], // 프로젝트 전역 파일 검사 범위
    rules: {
      'no-console': 'warn', // 운영 전 console 사용을 경고로 관리
      // 의도적 미사용 매개변수·역할 분리용 `_` 접두는 허용합니다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    } // 팀 정책에 맞춘 최소 커스텀 규칙
  }
];
