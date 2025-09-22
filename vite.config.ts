import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		nodePolyfills({
			globals: {
				global: true,
				process: true,
				Buffer: true
			}
		}),
		sveltekit()
	],
	server: {
		port: 3000
	},
	optimizeDeps: {
		include: ['@gala-chain/gswap-sdk']
	}
});