import { sveltekit } from '@sveltejs/kit/vite';
// Vitest 설정을 타입 안전하게 병합하려면 vitest/config의 defineConfig 사용
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts']
	},
	build: {
		rollupOptions: {
			output: {
				// 초기 렌더와 분리할 수 있는 무거운 라이브러리를 별도 청크로 분리합니다.
				manualChunks(id) {
					if (id.includes('chart.js')) return 'vendor-chart';
					if (id.includes('qrcode')) return 'vendor-qrcode';
					if (id.includes('html2canvas')) return 'vendor-html2canvas';
					if (id.includes('jspdf')) return 'vendor-jspdf';
					return undefined;
				}
			}
		}
	}
});
