import { ethers } from 'ethers';
import type { GSwapClient } from '../gswap/client';
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
  private client: GSwapClient;
  private config: WalletConfig | null = null;
  private walletState: WalletState | null = null;

  constructor(client: GSwapClient) {
    this.client = client;
    // Subscribe to wallet store changes
    walletStore.subscribe(state => {
      this.walletState = state;
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

    // Use balances from wallet store if available and not demo
    if (this.walletState?.balances && this.walletState.balances.length > 0 && this.config?.type !== 'demo') {
      // Convert wallet store balances to our format
      return this.walletState.balances.map(b => ({
        token: b.symbol,
        balance: b.balance,
        value: b.usdValue || 0
      }));
    }

    if (this.config?.type === 'demo') {
      // Return demo balances
      return [
        { token: 'BNB', balance: '1.5', value: 450 },
        { token: 'GALA', balance: '10000', value: 500 },
        { token: 'USDC', balance: '1000', value: 1000 },
      ];
    }

    // Get real balances from blockchain
    const tokens = [
      { symbol: 'BNB', address: ethers.ZeroAddress, price: 600 },
      { symbol: 'GALA', address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae', price: 0.01751 },
      { symbol: 'USDC', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', price: 1 },
      { symbol: 'USDT', address: '0x55d398326f99059ff775485246999027b3197955', price: 1 },
      { symbol: 'ETH', address: '0x2170ed0880ac9a755fd29b2688956bd959f933f8', price: 3500 },
    ];

    const balances: WalletBalance[] = [];

    for (const token of tokens) {
      try {
        const balance = await this.client.getBalance(token.address, this.getAddress()!);
        const value = parseFloat(balance) * token.price;
        balances.push({
          token: token.symbol,
          balance,
          value
        });
      } catch (error) {
        console.error(`Error getting ${token.symbol} balance:`, error);
        balances.push({ token: token.symbol, balance: '0', value: 0 });
      }
    }

    return balances;
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