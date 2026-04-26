import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				primary: {
					50: '#eef2ff',
					100: '#dbe4ff',
					500: '#335fd1',
					600: '#1e40af',
					700: '#1b3a9f'
				},
				accent: {
					50: '#ecfdf5',
					100: '#d1fae5',
					500: '#14b8a6',
					600: '#0f766e',
					700: '#0f5f59'
				},
				ink: {
					900: '#0f172a'
				},
				surface: {
					DEFAULT: '#f8fafc',
					card: '#ffffff',
					border: '#e2e8f0'
				},
				status: {
					success: '#16a34a',
					warning: '#d97706',
					danger: '#dc2626'
				}
			}
		}
	},
	plugins: []
} satisfies Config;
