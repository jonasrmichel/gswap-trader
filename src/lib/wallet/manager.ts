import { ethers } from 'ethers';
import type { GSwapClient } from '../gswap/client';

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
  private connected = false;

  constructor(client: GSwapClient) {
    this.client = client;
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
    return this.connected;
  }

  getAddress(): string | undefined {
    return this.config?.address;
  }

  getType(): WalletType | undefined {
    return this.config?.type;
  }

  async getBalances(): Promise<WalletBalance[]> {
    if (!this.connected || !this.config?.address) {
      throw new Error('Wallet not connected');
    }

    if (this.config.type === 'demo') {
      // Return demo balances
      return [
        { token: 'BNB', balance: '1.5', value: 450 },
        { token: 'GALA', balance: '10000', value: 500 },
        { token: 'USDC', balance: '1000', value: 1000 },
      ];
    }

    // Get real balances from blockchain
    const tokens = [
      { symbol: 'BNB', address: ethers.ZeroAddress },
      { symbol: 'GALA', address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae' },
      { symbol: 'USDC', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
    ];

    const balances: WalletBalance[] = [];

    for (const token of tokens) {
      try {
        const balance = await this.client.getBalance(token.address, this.config.address);
        balances.push({
          token: token.symbol,
          balance,
          value: parseFloat(balance) * (token.symbol === 'BNB' ? 300 :
                                         token.symbol === 'GALA' ? 0.05 : 1),
        });
      } catch (error) {
        console.error(`Error getting ${token.symbol} balance:`, error);
        balances.push({ token: token.symbol, balance: '0', value: 0 });
      }
    }

    return balances;
  }

  async signTransaction(tx: any): Promise<string> {
    if (!this.connected) {
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