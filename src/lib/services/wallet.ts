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
  private initialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.ethereum = (window as any).ethereum;
    }
  }

  // Initialize auto-connection (call this from a component onMount)
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (typeof window !== 'undefined') {
      // Check for env private key first
      await this.checkEnvAutoConnect();
      // Then auto-reconnect from storage if no env key
      const state = await new Promise<WalletState>(resolve => {
        walletStore.subscribe(value => resolve(value))();
      });
      if (!state.connected) {
        await this.autoReconnect();
      }
    }
  }

  // Check for environment variable private key and auto-connect
  private async checkEnvAutoConnect(): Promise<void> {
    const envPrivateKey = import.meta.env.VITE_WALLET_PRIVATE_KEY;
    if (!envPrivateKey || envPrivateKey === '') {
      return;
    }

    console.log('[Wallet] Found private key in environment, auto-connecting...');

    try {
      await this.connectWithPrivateKey(envPrivateKey);
      console.log('[Wallet] Successfully auto-connected with env private key');

      // Update balances after connection
      setTimeout(() => this.updateBalances(), 1000);
    } catch (error) {
      console.error('[Wallet] Failed to auto-connect with env private key:', error);
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
      // For non-silent connections, always get fresh accounts
      let accounts;
      if (silent) {
        accounts = await this.ethereum.request({ method: 'eth_accounts' });
      } else {
        // First disconnect to clear any cached state
        walletStore.reset();
        localStorage.removeItem(this.STORAGE_KEY);

        // Remove existing event listeners to prevent duplicates
        if (this.ethereum) {
          this.ethereum.removeAllListeners('accountsChanged');
          this.ethereum.removeAllListeners('chainChanged');
        }

        // Request fresh accounts - this will show MetaMask popup
        accounts = await this.ethereum.request({ method: 'eth_requestAccounts' });

        // Small delay to ensure MetaMask has updated
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the current accounts again to ensure we have the latest
        const verifyAccounts = await this.ethereum.request({ method: 'eth_accounts' });
        if (verifyAccounts.length > 0) {
          accounts = verifyAccounts;
        }
      }

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Use the first account (currently selected in MetaMask)
      const selectedAddress = accounts[0];
      console.log('[Wallet] Connecting to address:', selectedAddress);

      // Create provider and signer with the selected account
      const provider = new ethers.BrowserProvider(this.ethereum);

      // Try to switch to the configured network
      const targetChain = import.meta.env.VITE_TARGET_CHAIN || 'ethereum';
      let chainConfig;

      switch (targetChain) {
        case 'galachain':
          chainConfig = {
            chainId: '0x539', // 1337 in hex for GalaChain
            chainName: 'GalaChain',
            nativeCurrency: {
              name: 'GALA',
              symbol: 'GALA',
              decimals: 18
            },
            rpcUrls: [import.meta.env.VITE_GALACHAIN_RPC_URL || 'https://rpc.galachain.com'],
            blockExplorerUrls: ['https://explorer.galachain.com/']
          };
          break;
        case 'bsc':
          chainConfig = {
            chainId: '0x38', // 56 in hex
            chainName: 'BSC Mainnet',
            nativeCurrency: {
              name: 'BNB',
              symbol: 'BNB',
              decimals: 18
            },
            rpcUrls: ['https://bsc-dataseed1.binance.org'],
            blockExplorerUrls: ['https://bscscan.com/']
          };
          break;
        default: // ethereum
          chainConfig = {
            chainId: '0x1',
            chainName: 'Ethereum Mainnet',
            nativeCurrency: {
              name: 'Ether',
              symbol: 'ETH',
              decimals: 18
            },
            rpcUrls: ['https://eth.llamarpc.com'],
            blockExplorerUrls: ['https://etherscan.io/']
          };
      }

      try {
        await this.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainConfig.chainId }]
        });
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          try {
            await this.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [chainConfig]
            });
          } catch (addError) {
            console.error(`Failed to add ${chainConfig.chainName}:`, addError);
          }
        }
      }

      const network = await provider.getNetwork();

      // Get signer for the specific address
      const signer = await provider.getSigner(selectedAddress);
      const address = await signer.getAddress();
      console.log('[Wallet] Signer address:', address);

      // For silent connections, check if it's the same account
      if (silent) {
        const currentState = await new Promise<WalletState>(resolve => {
          walletStore.subscribe(value => resolve(value))();
        });

        if (currentState.connected &&
            currentState.address?.toLowerCase() === address.toLowerCase()) {
          return;
        }
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
      // Validate private key
      if (!privateKey || typeof privateKey !== 'string') {
        throw new Error('Invalid private key provided');
      }

      // Check if it's a valid hex string (remove 0x prefix if present)
      const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      if (!cleanKey.match(/^[0-9a-fA-F]{64}$/)) {
        console.error('[Wallet] Invalid private key format');
        throw new Error('Private key must be a 64-character hex string');
      }

      // Use Ethereum mainnet as default
      const rpcEndpoint = import.meta.env.VITE_ETH_RPC_URL || 'https://eth.llamarpc.com';
      console.log('[Wallet] Connecting to RPC:', rpcEndpoint);

      // Create a provider (using configured or default RPC)
      const provider = new ethers.JsonRpcProvider(rpcEndpoint);

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
        network: network.name || 'Ethereum',
        chainId: Number(network.chainId),
        provider: provider as any,
        signer: wallet as any
      }));

      // Save connection state
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        connected: true,
        address,
        network: network.name || 'Ethereum',
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
      console.log('[Wallet] Cannot update balances - wallet not ready');
      return;
    }

    console.log('[Wallet] Updating balances for address:', state.address);
    console.log('[Wallet] Chain ID:', state.chainId);

    try {
      const balances: WalletBalance[] = [];

      // Also fetch GalaChain balances
      try {
        const galaChainAddress = `eth|${state.address.slice(2)}`;
        console.log('[Wallet] Fetching GalaChain balances for:', galaChainAddress);

        const response = await fetch(`https://dex-backend-prod1.defi.gala.com/user/assets?address=${galaChainAddress}&page=1&limit=20`);
        if (response.ok) {
          const data = await response.json();
          if (data.tokens && data.tokens.length > 0) {
            console.log('[Wallet] GalaChain assets found:', data.tokens);

            // Add GalaChain tokens to balances
            for (const token of data.tokens) {
              // Try to get token price for value calculation
              let value = 0;
              try {
                const price = await this.fetchTokenPrice(token.symbol);
                value = parseFloat(token.quantity) * price;
              } catch (e) {
                // Price not available
              }

              balances.push({
                token: `${token.symbol} (GalaChain)`,
                balance: token.quantity,
                value: value
              });
            }
          }
        }
      } catch (galaError) {
        console.log('[Wallet] Could not fetch GalaChain balances:', galaError);
      }

      // Get native token balance first
      try {
        const nativeBalance = await state.provider.getBalance(state.address);
        console.log('[Wallet] Raw native balance:', nativeBalance.toString());

        const nativeBalanceInEther = ethers.formatEther(nativeBalance);
        console.log('[Wallet] Native token balance in ether:', nativeBalanceInEther);

        // Determine native token based on chain
        const nativeToken = state.chainId === 56 ? 'BNB' : state.chainId === 137 ? 'MATIC' : 'ETH';
        const nativePrice = await this.fetchTokenPrice(nativeToken);

        balances.push({
          token: nativeToken,
          balance: parseFloat(nativeBalanceInEther).toFixed(6),
          value: parseFloat(nativeBalanceInEther) * nativePrice
        });

        console.log(`[Wallet] Added ${nativeToken} balance:`, nativeBalanceInEther, 'value:', parseFloat(nativeBalanceInEther) * nativePrice);
      } catch (nativeError) {
        console.error('[Wallet] Error fetching native token balance:', nativeError);
      }

      // Fetch ERC20/BEP20 token balances
      // Define tokens based on chain
      let tokenContracts: Array<{symbol: string, address: string}> = [];

      // GalaChain is chain ID 43114 (Avalanche C-Chain) or custom
      // BSC Mainnet is 56
      // BSC Testnet is 97
      if (state.chainId === 56) {
        // BSC Mainnet tokens
        tokenContracts = [
          { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
          { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955' },
          { symbol: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' },
        ];
      } else if (state.chainId === 97) {
        // BSC Testnet tokens
        tokenContracts = [
          { symbol: 'BUSD', address: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee' },
          { symbol: 'USDT', address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd' },
        ];
      } else if (state.chainId === 1) {
        // Ethereum mainnet tokens
        tokenContracts = [
          { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
          { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
          { symbol: 'GALA', address: '0x15D4c048F83bd7e37d49eA4C83a07267Ec4203dA' },
          { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
        ];
      } else if (state.chainId === 137) {
        // Polygon tokens
        tokenContracts = [
          { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
          { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
        ];
      } else if (state.chainId === 42161) {
        // Arbitrum tokens
        tokenContracts = [
          { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
          { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
        ];
      } else if (state.chainId === 43114) {
        // Avalanche C-Chain (possible GalaChain)
        tokenContracts = [
          { symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' },
          { symbol: 'USDT', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7' },
        ];
      } else {
        console.log('[Wallet] Chain ID', state.chainId, 'not configured for token detection');
        // Still try to fetch common stablecoins with generic addresses
        tokenContracts = [];
      }

      // Fetch token balances
      console.log('[Wallet] Fetching token balances for tokens:', tokenContracts);

      for (const token of tokenContracts) {
        try {
          console.log(`[Wallet] Checking ${token.symbol} at address ${token.address}`);

          // First check if this is actually a contract
          const code = await state.provider.getCode(token.address);
          if (code === '0x' || code === '0x0') {
            console.log(`[Wallet] ${token.symbol} - No contract at address ${token.address} on chain ${state.chainId}`);
            continue; // Skip this token
          }

          const contract = new ethers.Contract(
            token.address,
            ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
            state.provider
          );

          // Fetch decimals first with proper error handling
          let decimals = 18;
          try {
            decimals = await contract.decimals();
            console.log(`[Wallet] ${token.symbol} decimals:`, decimals);
          } catch (e) {
            console.log(`[Wallet] Could not get decimals for ${token.symbol}, using 18`);
            // Try alternative decimals method name
            try {
              const altContract = new ethers.Contract(
                token.address,
                ['function DECIMALS() view returns (uint8)'],
                state.provider
              );
              decimals = await altContract.DECIMALS();
            } catch {
              // Keep default of 18
            }
          }

          // Fetch balance with timeout
          const balancePromise = contract.balanceOf(state.address);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
          );

          const tokenBalance = await Promise.race([balancePromise, timeoutPromise]) as bigint;
          console.log(`[Wallet] ${token.symbol} raw balance:`, tokenBalance.toString());

          const formattedBalance = ethers.formatUnits(tokenBalance, decimals);
          const tokenPrice = await this.fetchTokenPrice(token.symbol);

          console.log(`[Wallet] ${token.symbol} formatted balance:`, formattedBalance, 'price:', tokenPrice);

          balances.push({
            token: token.symbol,
            balance: parseFloat(formattedBalance).toFixed(6),
            value: parseFloat(formattedBalance) * tokenPrice
          });
        } catch (error: any) {
          if (error.message === 'Timeout') {
            console.error(`[Wallet] Timeout fetching ${token.symbol} balance`);
          } else {
            console.error(`[Wallet] Error fetching ${token.symbol} balance:`, error.message || error);
          }
          // Don't add zero balance for tokens that don't exist on this chain
        }
      }

      // Always update the store with whatever balances we managed to fetch
      console.log('[Wallet] Final balances to set:', balances);
      walletStore.update(s => ({ ...s, balances }));

      // Also update if we have at least some balances
      if (balances.length > 0) {
        console.log('[Wallet] Successfully updated balances, count:', balances.length);
      } else {
        console.warn('[Wallet] No balances could be fetched');
      }

    } catch (error) {
      console.error('[Wallet] Critical error in updateBalances:', error);
      // Even on error, update with empty balances so UI knows we tried
      walletStore.update(s => ({ ...s, balances: [] }));
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
          console.log('[Wallet] Account changed from', currentState.address, 'to', newAddress);
          // Reset store first to ensure clean state
          walletStore.reset();
          // Then connect with the new account
          await this.connectMetaMask(true);
        } else {
          console.log('[Wallet] Account unchanged:', newAddress);
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
      // Use default prices - should integrate with CoinGecko service
      const prices: Record<string, number> = {
        'ETH': 3500,
        'WETH': 3500,
        'GWETH': 3500,
        'BNB': 600,
        'MATIC': 0.8,
        'GALA': 0.01751,
        'USDC': 1,
        'USDT': 1,
      };
      return prices[symbol] || 0;
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
export const walletService = new WalletService();

// Export initialization function
export async function initializeWallet(): Promise<void> {
  return walletService.initialize();
}

// Export utility functions
export async function connectWallet(type: 'metamask' | 'private-key', privateKey?: string): Promise<void> {
  console.log('[connectWallet] Called with type:', type, 'privateKey:', privateKey ? 'provided' : 'not provided');

  switch (type) {
    case 'metamask':
      // Don't disconnect here as it's handled in connectMetaMask for non-silent connections
      return walletService.connectMetaMask();
    case 'private-key':
      if (!privateKey) throw new Error('Private key required');
      console.log('[connectWallet] Private key value:', privateKey);
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