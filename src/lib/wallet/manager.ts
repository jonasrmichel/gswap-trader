import { ethers } from 'ethers';
import type { GSwapSDKClient } from '../gswap/gswap-sdk-client';
import { walletStore, type WalletState, type WalletBalance } from '../services/wallet';

export type WalletType = 'private-key' | 'phantom' | 'metamask' | 'demo';

export interface WalletConfig {
  type: WalletType;
  address?: string;
  privateKey?: string;
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
        const inferredType = (state.connectionType || this.config?.type || 'metamask') as WalletType;
        this.config = {
          type: inferredType,
          address: state.address
        };
        // Handle GSwap client connection based on connection type
        if (state.connectionType === 'private-key' && (state as any).privateKey) {
          // For private key connections, use the connect method which creates PrivateKeySigner
          console.log('[WalletManager] Using private key connection for GSwap');
          await this.client.connect((state as any).privateKey);
        } else if (state.signer) {
          // For MetaMask connections, use setSigner
          console.log('[WalletManager] Using MetaMask signer for GSwap');
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
        // The GSwap client connection will be handled by the wallet store subscription
        // We just need to get the address here
        const { ethers } = await import('ethers');
        const wallet = new ethers.Wallet(config.privateKey);
        const address = wallet.address;
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
          const address = resp?.publicKey?.toString();
          if (!address) {
            throw new Error('Phantom wallet did not provide an address');
          }
          this.config.address = address;
          this.connected = true;
          return address;
        }
        throw new Error('Phantom wallet not found');

      case 'demo':
        const demoAddress = '0xDemo' + Math.random().toString(16).substring(2, 42);
        this.config.address = demoAddress;
        this.connected = true;
        return demoAddress;

      default:
        throw new Error('Unsupported wallet type');
    }
  }

  disconnect() {
    this.config = null;
    this.connected = false;
  }

  isConnected(): boolean {
    // Check both wallet state AND client connection
    // If we have a private key connection through the client, we're connected
    const clientConnected = this.client.isConnected();
    const walletStateConnected = this.walletState?.connected || false;
    
    if (clientConnected || walletStateConnected) {
      console.log('[WalletManager] isConnected check - client:', clientConnected, 'wallet:', walletStateConnected);
      return true;
    }
    return false;
  }

  getAddress(): string | undefined {
    return this.walletState?.address || this.config?.address;
  }

  getType(): WalletType | undefined {
    return this.config?.type;
  }

  private normalizeTokenSymbol(token: string | undefined): string {
    if (!token) {
      return '';
    }

    const cleaned = token.replace(/\s*\(GalaChain\)/gi, '').trim();
    const upper = cleaned.toUpperCase();

    if (upper === 'USDC') return 'GUSDC';
    if (upper === 'USDT') return 'GUSDT';
    if (upper === 'ETH' || upper === 'WETH') return 'GWETH';

    return upper;
  }

  private estimateTokenPrice(symbol: string): number {
    const upper = symbol.toUpperCase();
    const priceMap: Record<string, number> = {
      GALA: 0.02,
      GUSDC: 1,
      GUSDT: 1,
      GWETH: 3500,
      USDC: 1,
      USDT: 1,
      ETH: 3500,
      WETH: 3500,
      BNB: 600,
      MATIC: 0.8,
    };

    return priceMap[upper] ?? priceMap[upper.startsWith('G') ? upper.slice(1) : upper] ?? 0;
  }

  private sanitizeBalanceValue(balance: any): string {
    if (typeof balance === 'string') {
      return balance;
    }
    if (typeof balance === 'number') {
      return balance.toString();
    }
    if (balance && typeof balance === 'object' && typeof balance.toString === 'function') {
      try {
        return balance.toString();
      } catch {
        return '0';
      }
    }
    return '0';
  }

  private async fetchGalaChainBalances(walletAddress: string): Promise<WalletBalance[]> {
    try {
      // Add timestamp to force fresh fetch
      console.log('[WalletManager] Fetching fresh GalaChain balances at', new Date().toISOString());
      
      const assets: any = await this.client.getUserAssets(walletAddress);
      const tokens: any[] = Array.isArray(assets?.tokens)
        ? assets.tokens
        : Array.isArray(assets?.token)
          ? assets.token
          : [];

      const balances = tokens
        .map((token: any) => {
          const symbol = this.normalizeTokenSymbol(token?.symbol || token?.token || token?.id);
          if (!symbol) {
            return null;
          }

          const balance = this.sanitizeBalanceValue(token?.quantity ?? token?.balance ?? '0');
          const numericBalance = parseFloat(balance || '0');
          const value = Number.isFinite(numericBalance)
            ? numericBalance * this.estimateTokenPrice(symbol)
            : 0;

          return {
            token: symbol,
            balance,
            value,
          } as WalletBalance;
        })
        .filter((entry): entry is WalletBalance => Boolean(entry));
      
      console.log('[WalletManager] Fetched balances:', balances.map(b => `${b.token}: ${b.balance}`).join(', '));
      return balances;
    } catch (error: any) {
      // Only log if it's not a 400 error (which is expected for unregistered wallets)
      if (!error?.message?.includes('400') && !error?.message?.includes('Bad Request')) {
        console.warn('[WalletManager] Error fetching balances:', error?.message || 'Unknown error');
      }
      return [];
    }
  }

  async refreshBalances(): Promise<void> {
    // Force refresh wallet service balances first
    const { updateBalances } = await import('../services/wallet');
    await updateBalances();
    
    // Small delay to ensure wallet service has updated
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  async getBalances(): Promise<WalletBalance[]> {
    if (!this.isConnected()) {
      throw new Error('Wallet not connected');
    }

    if (this.config?.type === 'demo') {
      // Return demo balances
      return [
        { token: 'BNB', balance: '1.5', value: 450 },
        { token: 'GALA', balance: '10000', value: 500 },
        { token: 'USDC', balance: '1000', value: 1000 },
      ];
    }

    const walletAddress = this.getAddress();
    if (!walletAddress) {
      console.error('No wallet address available for balance check');
      return [];
    }

    const merged = new Map<string, WalletBalance>();

    const insertBalance = (entry: { token: string; balance: string; value?: number } | null | undefined) => {
      if (!entry) {
        return;
      }

      const token = this.normalizeTokenSymbol(entry.token);
      if (!token) {
        return;
      }

      const balance = this.sanitizeBalanceValue(entry.balance);
      const fallbackValue = parseFloat(balance || '0') * this.estimateTokenPrice(token);
      const normalizedValue = Number.isFinite(entry.value) ? Number(entry.value) : fallbackValue;

      const existing = merged.get(token);
      const existingValue = existing
        ? (Number.isFinite(existing.value)
            ? Number(existing.value)
            : parseFloat(existing.balance || '0') * this.estimateTokenPrice(token))
        : -1;

      if (!existing || normalizedValue > existingValue) {
        const computedValue = Number.isFinite(normalizedValue)
          ? normalizedValue
          : Number.isFinite(fallbackValue)
            ? fallbackValue
            : 0;

        merged.set(token, {
          token,
          balance,
          value: computedValue,
        });
      }
    };

    const galaBalances = await this.fetchGalaChainBalances(walletAddress);
    galaBalances.forEach(insertBalance);

    if (this.walletState?.balances && this.walletState.balances.length > 0) {
      for (const item of this.walletState.balances) {
        const token = this.normalizeTokenSymbol(item.token);
        if (!token) {
          continue;
        }

        const balance = this.sanitizeBalanceValue(item.balance);
        const explicitValue = typeof item.value === 'number' ? item.value : undefined;
        insertBalance({ token, balance, value: explicitValue });
      }
    }

    if (merged.size === 0) {
      return [
        { token: 'GALA', balance: '0', value: 0 },
        { token: 'GWETH', balance: '0', value: 0 },
        { token: 'GUSDC', balance: '0', value: 0 },
        { token: 'GUSDT', balance: '0', value: 0 }
      ];
    }

    return Array.from(merged.values());
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
