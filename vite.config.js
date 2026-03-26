import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'jsdom',
		globals: true
	},
	resolve: {
		dedupe: ['svelte']
	},
	optimizeDeps: {
		exclude: ['jgr-ui']
	},
	server: {
		fs: {
			allow: ['..']
		},
		watch: {
			ignored: ['!**/node_modules/jgr-ui/**']
		}
	}
});
