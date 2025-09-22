// Node.js polyfills for browser environment
// Required for @gala-chain/gswap-sdk to work in the browser

// Polyfill global
if (typeof global === 'undefined') {
  (window as any).global = window;
}

// Polyfill process
if (typeof process === 'undefined') {
  (window as any).process = {
    env: {},
    version: 'v16.0.0',
    versions: { node: '16.0.0' },
    browser: true,
    nextTick: (fn: Function) => setTimeout(fn, 0)
  };
}

// Polyfill Buffer
if (typeof Buffer === 'undefined') {
  (window as any).Buffer = {
    from: (data: any) => data,
    alloc: (size: number) => new Uint8Array(size),
    isBuffer: (obj: any) => false,
    concat: (list: any[]) => list[0]
  };
}

export {};