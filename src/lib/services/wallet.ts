import { ethers } from 'ethers';
import { writable, derived } from 'svelte/store';

export interface WalletBalance {
  token: string;
  balance: string;
  value: number;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  network: string | null;
  chainId: number | null;
  balances: WalletBalance[];
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
}

// Store for wallet state
function createWalletStore() {
  const { subscribe, set, update } = writable<WalletState>({
    connected: false,
    address: null,
    network: null,
    chainId: null,
    balances: [],
    provider: null,
    signer: null,
  });

  return {
    subscribe,
    set,
    update,
    reset: () => set({
      connected: false,
      address: null,
      network: null,
      chainId: null,
      balances: [],
      provider: null,
      signer: null,
    })
  };
}

export const walletStore = createWalletStore();

// Derived store for wallet display data
export const walletDisplay = derived(walletStore, $wallet => ({
  shortAddress: $wallet.address ?
    `${$wallet.address.slice(0, 6)}...${$wallet.address.slice(-4)}` : '',
  totalBalance: $wallet.balances.reduce((sum, b) => sum + b.value, 0),
  isConnected: $wallet.connected
}));

class WalletService {
  private ethereum: any;
  private readonly STORAGE_KEY = 'gswap-trader-wallet';

  constructor() {
    if (typeof window !== 'undefined') {
      this.ethereum = (window as any).ethereum;
      // Auto-reconnect on page load
      this.autoReconnect();
    }
  }

  // Check if MetaMask is installed
  isMetaMaskInstalled(): boolean {
    return Boolean(this.ethereum && this.ethereum.isMetaMask);
  }

  // Auto-reconnect wallet on page load
  private async autoReconnect(): Promise<void> {
    try {
      const savedState = localStorage.getItem(this.STORAGE_KEY);
      if (savedState) {
        const { connected, address } = JSON.parse(savedState);
        if (connected && address && this.ethereum) {
          // Check if MetaMask is still connected to this address
          const accounts = await this.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0 && accounts[0].toLowerCase() === address.toLowerCase()) {
            // Reconnect silently
            await this.connectMetaMask(true);
          } else {
            // Clear invalid saved state
            localStorage.removeItem(this.STORAGE_KEY);
          }
        }
      }
    } catch (error) {
      console.error('Auto-reconnect failed:', error);
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  // Connect to MetaMask
  async connectMetaMask(silent: boolean = false): Promise<void> {
    if (!this.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed. Please install MetaMask browser extension.');
    }

    try {
      // Always request fresh accounts when not silent to ensure we get the current account
      const accounts = silent
        ? await this.ethereum.request({ method: 'eth_accounts' })
        : await this.ethereum.request({ method: 'eth_requestAccounts' });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Create provider and signer with the current account
      const provider = new ethers.BrowserProvider(this.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      // Check if this is actually a different account than what we have
      const currentState = await new Promise<WalletState>(resolve => {
        walletStore.subscribe(value => resolve(value))();
      });

      // If it's the same account and we're already connected, don't update unless forced
      if (currentState.connected &&
          currentState.address?.toLowerCase() === address.toLowerCase() &&
          silent) {
        return;
      }

      // Update wallet store
      walletStore.update(state => ({
        ...state,
        connected: true,
        address,
        network: network.name,
        chainId: Number(network.chainId),
        provider,
        signer
      }));

      // Save connection state to localStorage
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        connected: true,
        address,
        network: network.name,
        chainId: Number(network.chainId),
        timestamp: Date.now()
      }));

      // Fetch balances
      await this.updateBalances();

      // Setup event listeners
      this.setupEventListeners();

    } catch (error) {
      if (!silent) {
        console.error('Failed to connect MetaMask:', error);
      }
      throw error;
    }
  }

  // Connect with private key (for demo/testing)
  async connectWithPrivateKey(privateKey: string): Promise<void> {
    try {
      // Create a provider (using default RPC)
      const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

      // Create wallet from private key
      const wallet = new ethers.Wallet(privateKey, provider);

      // Get network info
      const network = await provider.getNetwork();
      const address = await wallet.getAddress();

      // Update wallet store
      walletStore.update(state => ({
        ...state,
        connected: true,
        address: address,
        network: network.name || 'BSC',
        chainId: Number(network.chainId),
        provider: provider as any,
        signer: wallet as any
      }));

      // Save connection state
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        connected: true,
        address,
        network: network.name || 'BSC',
        chainId: Number(network.chainId),
        privateKeyMode: true,
        timestamp: Date.now()
      }));

      // Fetch balances
      await this.updateBalances();

    } catch (error) {
      console.error('Failed to connect with private key:', error);
      throw error;
    }
  }


  // Disconnect wallet
  async disconnect(): Promise<void> {
    walletStore.reset();

    // Clear saved state from localStorage
    localStorage.removeItem(this.STORAGE_KEY);
  }

  // Update wallet balances
  async updateBalances(): Promise<void> {
    const state = await new Promise<WalletState>(resolve => {
      walletStore.subscribe(value => resolve(value))();
    });

    if (!state.connected || !state.provider || !state.address) {
      return;
    }

    try {
      // Get native token balance
      const balance = await state.provider.getBalance(state.address);
      const balanceInEther = ethers.formatEther(balance);

      // Determine native token based on chain
      const nativeToken = state.chainId === 56 ? 'BNB' : state.chainId === 137 ? 'MATIC' : 'ETH';

      // Fetch real price from API or use default
      // TODO: Integrate with price API
      const nativePrice = await this.fetchTokenPrice(nativeToken);

      const balances: WalletBalance[] = [
        {
          token: nativeToken,
          balance: parseFloat(balanceInEther).toFixed(6),
          value: parseFloat(balanceInEther) * nativePrice
        }
      ];

      // TODO: Fetch real ERC20/BEP20 token balances using multicall

      walletStore.update(s => ({ ...s, balances }));

    } catch (error) {
      console.error('Failed to update balances:', error);
    }
  }

  // Setup MetaMask event listeners
  private setupEventListeners(): void {
    if (!this.ethereum) return;

    // Remove any existing listeners first
    this.ethereum.removeAllListeners('accountsChanged');
    this.ethereum.removeAllListeners('chainChanged');

    // Handle account changes
    this.ethereum.on('accountsChanged', async (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected wallet
        await this.disconnect();
      } else {
        // User switched accounts - force reconnect with new account
        const newAddress = accounts[0];
        const currentState = await new Promise<WalletState>(resolve => {
          walletStore.subscribe(value => resolve(value))();
        });

        // Only update if it's actually a different account
        if (currentState.address?.toLowerCase() !== newAddress.toLowerCase()) {
          // Reset store first to ensure clean state
          walletStore.reset();
          // Then connect with the new account
          await this.connectMetaMask(true);
        }
      }
    });

    // Handle chain changes
    this.ethereum.on('chainChanged', (chainIdHex: string) => {
      // Reload the page on chain change (recommended by MetaMask)
      window.location.reload();
    });
  }

  // Fetch real token price
  private async fetchTokenPrice(symbol: string): Promise<number> {
    try {
      // TODO: Replace with real price API (CoinGecko, etc)
      const prices: Record<string, number> = {
        'ETH': 2500,
        'BNB': 300,
        'MATIC': 0.8,
        'GALA': 0.05,
      };
      return prices[symbol] || 0;
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
export const walletService = new WalletService();

// Export utility functions
export async function connectWallet(type: 'metamask' | 'private-key', privateKey?: string): Promise<void> {
  switch (type) {
    case 'metamask':
      // Always disconnect first to ensure clean state when connecting
      await walletService.disconnect();
      return walletService.connectMetaMask();
    case 'private-key':
      if (!privateKey) throw new Error('Private key required');
      await walletService.disconnect();
      return walletService.connectWithPrivateKey(privateKey);
    default:
      throw new Error('Unknown wallet type');
  }
}

export async function disconnectWallet(): Promise<void> {
  return walletService.disconnect();
}

export async function updateBalances(): Promise<void> {
  return walletService.updateBalances();
}