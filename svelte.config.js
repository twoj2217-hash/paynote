// Node 서버 산출물 — Windows·CI에서 symlink 없이 빌드됨. Vercel은 공식 가이드대로 adapter-vercel로 바꿀 수 있음.
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
