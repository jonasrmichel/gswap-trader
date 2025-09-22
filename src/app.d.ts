// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}

	// Add Node.js globals for browser compatibility
	var global: typeof globalThis;
	var process: any;
	var Buffer: any;
}

export {};