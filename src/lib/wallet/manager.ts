import { ethers } from 'ethers';
import type { GSwapSDKClient } from '../gswap/gswap-sdk-client';
import { walletStore, type WalletState } from '../services/wallet';
import { get } from 'svelte/store';

export type WalletType = 'private-key' | 'phantom' | 'metamask' | 'demo';

export interface WalletConfig {
  type: WalletType;
  address?: string;
  privateKey?: string;
}

export interface WalletBalance {
  token: string;
  balance: string;
  value?: number;
}

export class WalletManager {
  private client: GSwapSDKClient;
  private config: WalletConfig | null = null;
  private walletState: WalletState | null = null;
  private connected: boolean = false;

  constructor(client: GSwapSDKClient) {
    this.client = client;
    // Subscribe to wallet store changes
    walletStore.subscribe(async state => {
      this.walletState = state;
      // Sync connected state and pass signer to GSwap client
      if (state.connected && state.address) {
        this.connected = true;
        this.config = {
          type: 'metamask',
          address: state.address
        };
        // Pass signer to GSwap client when wallet connects
        if (state.signer) {
          await this.client.setSigner(state.signer);
        }
      } else {
        this.connected = false;
        this.config = null;
        // Clear signer when wallet disconnects
        await this.client.setSigner(null);
      }
    });
  }

  async connect(config: WalletConfig): Promise<string> {
    this.config = config;

    switch (config.type) {
      case 'private-key':
        if (!config.privateKey) {
          throw new Error('Private key required');
        }
        const address = await this.client.connect(config.privateKey);
        this.config.address = address;
        this.connected = true;
        return address;

      case 'metamask':
        if (typeof window !== 'undefined' && (window as any).ethereum) {
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          const accounts = await provider.send('eth_requestAccounts', []);
          this.config.address = accounts[0];
          this.connected = true;
          return accounts[0];
        }
        throw new Error('MetaMask not found');

      case 'phantom':
        if (typeof window !== 'undefined' && (window as any).solana) {
          const resp = await (window as any).solana.connect();
          this.config.address = resp.publicKey.toString();
          this.connected = true;
          return this.config.address;
        }
        throw new Error('Phantom wallet not found');

      case 'demo':
        this.config.address = '0xDemo' + Math.random().toString(16).substring(2, 42);
        this.connected = true;
        return this.config.address;

      default:
        throw new Error('Unsupported wallet type');
    }
  }

  disconnect() {
    this.config = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.walletState?.connected || false;
  }

  getAddress(): string | undefined {
    return this.walletState?.address || this.config?.address;
  }

  getType(): WalletType | undefined {
    return this.config?.type;
  }

  async getBalances(): Promise<WalletBalance[]> {
    if (!this.isConnected()) {
      throw new Error('Wallet not connected');
    }

    // For private key connection, always fetch fresh balances from GalaChain
    if (this.config?.type === 'private-key') {
      console.log('[WalletManager] Private key mode - fetching fresh GalaChain balances');
      const walletAddress = this.getAddress();
      if (!walletAddress) {
        console.error('No wallet address available for balance check');
        return [];
      }

      try {
        // Use GSwap SDK's getUserAssets to fetch all balances at once
        const assets = await this.client.getUserAssets(walletAddress);
        console.log('[WalletManager] GalaChain assets fetched:', assets);

        // Map the assets to our wallet balance format
        const balances: WalletBalance[] = assets.tokens.map((token: any) => {
          // Get approximate USD values (in production, use real price API)
          const prices: Record<string, number> = {
            'GALA': 0.02,
            'GWETH': 3500,
            'GUSDC': 1,
            'GUSDT': 1
          };

          const price = prices[token.symbol] || 0;
          const quantity = parseFloat(token.quantity || '0');

          return {
            token: token.symbol,
            balance: token.quantity,
            value: quantity * price
          };
        });

        console.log('[WalletManager] Returning GalaChain balances:', balances);
        return balances;
      } catch (error) {
        console.error('Failed to fetch GalaChain balances:', error);
        // Return empty balances for common tokens if API fails
        return [
          { token: 'GALA', balance: '0', value: 0 },
          { token: 'GWETH', balance: '0', value: 0 },
          { token: 'GUSDC', balance: '0', value: 0 },
          { token: 'GUSDT', balance: '0', value: 0 }
        ];
      }
    }

    // Use balances from wallet store if available and not demo
    if (this.walletState?.balances && this.walletState.balances.length > 0 && this.config?.type !== 'demo') {
      console.log('[WalletManager] Using balances from wallet store:', this.walletState.balances);
      // Convert wallet store balances to our format
      // Handle both formats: "GUSDC (GalaChain)" and "GUSDC"
      const processedBalances = this.walletState.balances.map(b => {
        // Extract the base token name - remove any (GalaChain) suffix
        let tokenName = b.token.replace(' (GalaChain)', '').replace('(GalaChain)', '');
        
        // GalaChain tokens already have the G prefix, so don't add it again
        // Only convert standard tokens to GalaChain format if needed
        if (tokenName === 'USDC') {
          tokenName = 'GUSDC';
        } else if (tokenName === 'ETH' || tokenName === 'WETH') {
          tokenName = 'GWETH';
        } else if (tokenName === 'USDT') {
          tokenName = 'GUSDT';
        }
        // If it already starts with G (like GUSDC, GWETH), keep it as is
        
        console.log(`[WalletManager] Processed balance: ${b.token} -> ${tokenName}: ${b.balance}`);
        
        return {
          token: tokenName,
          balance: b.balance,
          value: b.value || 0
        };
      });
      
      return processedBalances;
    }

    if (this.config?.type === 'demo') {
      // Return demo balances
      return [
        { token: 'BNB', balance: '1.5', value: 450 },
        { token: 'GALA', balance: '10000', value: 500 },
        { token: 'USDC', balance: '1000', value: 1000 },
      ];
    }

    // Get real balances from GalaChain
    const walletAddress = this.getAddress();
    if (!walletAddress) {
      console.error('No wallet address available for balance check');
      return [];
    }

    try {
      // Use GSwap SDK's getUserAssets to fetch all balances at once
      const assets = await this.client.getUserAssets(walletAddress);

      // Map the assets to our wallet balance format
      const balances: WalletBalance[] = assets.tokens.map((token: any) => {
        // Get approximate USD values (in production, use real price API)
        const prices: Record<string, number> = {
          'GALA': 0.02,
          'GWETH': 3500,
          'GUSDC': 1,
          'GUSDT': 1
        };

        const price = prices[token.symbol] || 0;
        const quantity = parseFloat(token.quantity || '0');

        return {
          token: token.symbol,
          balance: token.quantity,
          value: quantity * price
        };
      });

      return balances;
    } catch (error) {
      console.error('Failed to fetch GalaChain balances:', error);

      // Return empty balances for common tokens if API fails
      return [
        { token: 'GALA', balance: '0', value: 0 },
        { token: 'GWETH', balance: '0', value: 0 },
        { token: 'GUSDC', balance: '0', value: 0 },
        { token: 'GUSDT', balance: '0', value: 0 }
      ];
    }
  }

  async signTransaction(tx: any): Promise<string> {
    if (!this.isConnected()) {
      throw new Error('Wallet not connected');
    }

    switch (this.config?.type) {
      case 'private-key':
        // Transaction signing handled by GSwapClient
        return 'signed';

      case 'metamask':
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const signedTx = await signer.signTransaction(tx);
        return signedTx;

      case 'demo':
        return '0xdemo_signed_' + Math.random().toString(16).substring(2);

      default:
        throw new Error('Wallet type does not support transaction signing');
    }
  }

  exportPrivateKey(): string | undefined {
    if (this.config?.type === 'private-key') {
      return this.config.privateKey;
    }
    return undefined;
  }
}