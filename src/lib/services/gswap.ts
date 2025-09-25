import { GSwapSDKClient } from '$lib/gswap/gswap-sdk-client';
import { walletStore } from './wallet';
import { get } from 'svelte/store';

// Singleton GSwap client instance
let gswapClient: GSwapSDKClient | null = null;

let connectionPromise: Promise<void> | null = null;

export function getGSwapClient(): GSwapSDKClient {
  if (!gswapClient) {
    gswapClient = new GSwapSDKClient();
    
    // Auto-connect with env private key if available
    const envPrivateKey = import.meta.env.VITE_WALLET_PRIVATE_KEY;
    
    // Subscribe to wallet changes and update the signer
    // BUT: Don't override if we're using a private key connection
    walletStore.subscribe(async (state) => {
      // Check if we already have a private key connection
      const hasPrivateKeyConnection = envPrivateKey && envPrivateKey !== '' && gswapClient?.isConnected();
      
      if (hasPrivateKeyConnection) {
        console.log('[GSwap Service] Using private key connection, ignoring wallet changes');
        return; // Don't override private key connection
      }
      
      if (state.connected && state.signer) {
        console.log('[GSwap Service] Wallet connected, setting signer');
        await gswapClient?.setSigner(state.signer);
      } else if (!state.connected && gswapClient) {
        console.log('[GSwap Service] Wallet disconnected, clearing signer');
        await gswapClient.setSigner(null);
      }
    });
    if (envPrivateKey && envPrivateKey !== '') {
      console.log('[GSwap Service] Found env private key, auto-connecting');
      // Store the connection promise so we can await it
      connectionPromise = gswapClient.connect(envPrivateKey)
        .then(address => {
          console.log('[GSwap Service] ✅ Connected with private key! Address:', address);
        })
        .catch(error => {
          console.error('[GSwap Service] Failed to connect with env private key:', error);
          throw error;
        });
    }
  }
  
  return gswapClient;
}

export async function waitForConnection(): Promise<void> {
  if (connectionPromise) {
    await connectionPromise;
  }
}

export async function initializeGSwap(): Promise<void> {
  const client = getGSwapClient();
  const state = get(walletStore);
  
  // If wallet is already connected, set the signer
  if (state.connected && state.signer) {
    await client.setSigner(state.signer);
  }
}