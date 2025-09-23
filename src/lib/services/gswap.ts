import { GSwapSDKClient } from '$lib/gswap/gswap-sdk-client';
import { walletStore } from './wallet';
import { get } from 'svelte/store';

// Singleton GSwap client instance
let gswapClient: GSwapSDKClient | null = null;

export function getGSwapClient(): GSwapSDKClient {
  if (!gswapClient) {
    gswapClient = new GSwapSDKClient();
    
    // Subscribe to wallet changes and update the signer
    walletStore.subscribe(async (state) => {
      if (state.connected && state.signer) {
        console.log('[GSwap Service] Wallet connected, setting signer');
        await gswapClient?.setSigner(state.signer);
      } else if (!state.connected && gswapClient) {
        console.log('[GSwap Service] Wallet disconnected, clearing signer');
        await gswapClient.setSigner(null);
      }
    });

    // Auto-connect with env private key if available
    const envPrivateKey = import.meta.env.VITE_WALLET_PRIVATE_KEY;
    if (envPrivateKey && envPrivateKey !== '') {
      console.log('[GSwap Service] Found env private key, auto-connecting');
      gswapClient.connect(envPrivateKey).catch(error => {
        console.error('[GSwap Service] Failed to connect with env private key:', error);
      });
    }
  }
  
  return gswapClient;
}

export async function initializeGSwap(): Promise<void> {
  const client = getGSwapClient();
  const state = get(walletStore);
  
  // If wallet is already connected, set the signer
  if (state.connected && state.signer) {
    await client.setSigner(state.signer);
  }
}