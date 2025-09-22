import { GSwap, PrivateKeySigner, FEE_TIER, type GalaChainSigner } from '@gala-chain/gswap-sdk';
import type { LiquidityPool, SwapParams } from './types';
import { CoinGeckoService } from '../services/coingecko';
import { MetaMaskSigner } from './metamask-signer';
import { ethers } from 'ethers';

// Helper functions for token format conversion
export function formatTokenForGSwap(symbol: string): string {
  // Convert simple token symbol to GSwap format
  // Special handling for wrapped tokens
  if (symbol === 'ETH' || symbol === 'WETH') {
    return 'GWETH|Unit|none|none';
  }
  if (symbol === 'USDC' || symbol === 'GUSDC') {
    return 'GUSDC|Unit|none|none';
  }
  if (symbol === 'USDT' || symbol === 'GUSDT') {
    return 'GUSDT|Unit|none|none';
  }
  // Default format for other tokens
  return `${symbol}|Unit|none|none`;
}

export function parseTokenFromGSwap(token: string): string {
  // Extract symbol from GSwap format
  return token.split('|')[0].replace('G', ''); // Remove G prefix for display
}

export class GSwapSDKClient {
  private gswap: GSwap | null = null;
  private signer: GalaChainSigner | null = null;
  private coinGecko: CoinGeckoService;
  private connected: boolean = false;
  private address: string | null = null;

  constructor() {
    this.coinGecko = new CoinGeckoService();
  }

  // Validate private key format
  private validatePrivateKey(privateKey: string): void {
    const isHex64 = /^[0-9a-fA-F]{64}$/.test(privateKey);
    const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(privateKey) && privateKey.length === 44;
    const isPrefixedHex = /^0x[0-9a-fA-F]{64}$/.test(privateKey);

    if (!(isHex64 || isBase64 || isPrefixedHex)) {
      throw new Error('PRIVATE_KEY must be a hex (64 chars), hex with 0x prefix, or base64-encoded value.');
    }
  }

  async connect(privateKey: string): Promise<string> {
    try {
      this.validatePrivateKey(privateKey);

      // Create PrivateKeySigner
      this.signer = new PrivateKeySigner(privateKey);

      // Derive address from private key
      const wallet = new ethers.Wallet(privateKey);
      this.address = wallet.address;
      const galaChainAddress = `eth|${this.address.slice(2)}`;

      // Create GSwap instance with wallet address
      this.gswap = new GSwap({
        signer: this.signer,
        walletAddress: galaChainAddress,
      });

      this.connected = true;
      return this.address;
    } catch (error) {
      console.error('Failed to connect to GSwap with private key:', error);
      throw error;
    }
  }

  // Set signer for MetaMask
  async setSigner(ethersSigner: ethers.Signer | null) {
    if (!ethersSigner) {
      this.signer = null;
      this.gswap = null;
      this.connected = false;
      this.address = null;
      return;
    }

    try {
      // Create MetaMaskSigner wrapper
      this.signer = new MetaMaskSigner(ethersSigner);

      // Create GSwap instance with MetaMask signer
      this.gswap = new GSwap({
        signer: this.signer,
      });

      // Get address from signer
      this.address = await ethersSigner.getAddress();
      this.connected = true;

      console.log('Connected to GSwap SDK with MetaMask signer');
    } catch (error) {
      console.error('Failed to connect GSwap with MetaMask:', error);
      throw error;
    }
  }

  getAddress(): string | null {
    return this.address;
  }

  async getBalance(tokenAddress: string, walletAddress: string): Promise<string> {
    if (!this.gswap) {
      console.log('GSwap not connected - cannot fetch balance');
      return '0';
    }

    try {
      // Convert Ethereum address to GalaChain format
      const galaChainAddress = walletAddress.startsWith('0x')
        ? `eth|${walletAddress.slice(2)}`
        : walletAddress;

      // Use the assets service to get user balances (limit max 20)
      const assets = await this.gswap.assets.getUserAssets(galaChainAddress, 1, 20);

      // Find the specific token balance
      const token = assets.tokens.find(t => {
        // Match by symbol (extract from GSwap format)
        const symbol = tokenAddress.split('|')[0];
        return t.symbol === symbol;
      });

      return token ? token.quantity : '0';
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return '0';
    }
  }

  async getUserAssets(walletAddress: string): Promise<any> {
    if (!this.gswap) {
      console.log('GSwap not connected - cannot fetch assets');
      return { tokens: [], count: 0 };
    }

    try {
      // Convert Ethereum address to GalaChain format
      const galaChainAddress = walletAddress.startsWith('0x')
        ? `eth|${walletAddress.slice(2)}`
        : walletAddress;

      return await this.gswap.assets.getUserAssets(galaChainAddress, 1, 20);
    } catch (error) {
      console.error('Failed to fetch user assets:', error);
      return { tokens: [], count: 0 };
    }
  }

  async getPools(): Promise<LiquidityPool[]> {
    if (!this.gswap) {
      throw new Error('GSwap not connected');
    }

    // Get prices from CoinGecko
    const prices = await this.coinGecko.getPrices(['GALA', 'ethereum']);
    const galaPrice = prices.get('GALA')?.price || 0.02;
    const ethPrice = prices.get('ethereum')?.price || 3500;

    // GSwap SDK doesn't provide pool listing directly
    // Return hardcoded pools based on known GSwap pairs
    return [
      {
        id: 'GALA-GWETH',
        tokenA: {
          symbol: 'GALA',
          address: 'GALA|Unit|none|none',
          decimals: 8,
        },
        tokenB: {
          symbol: 'GWETH',
          address: 'GWETH|Unit|none|none',
          decimals: 8,
        },
        reserveA: '10000000',
        reserveB: '100',
        totalSupply: '10000',
        fee: 0.003,
        tvl: (10000000 * galaPrice + 100 * ethPrice),
        volume24h: 100000,
        apy: 15.0,
        name: 'GALA/GWETH',
        priceTokenA: galaPrice,
        priceTokenB: ethPrice,
        lastUpdated: new Date(),
      },
      {
        id: 'GALA-GUSDC',
        tokenA: {
          symbol: 'GALA',
          address: 'GALA|Unit|none|none',
          decimals: 8,
        },
        tokenB: {
          symbol: 'GUSDC',
          address: 'GUSDC|Unit|none|none',
          decimals: 8,
        },
        reserveA: '5000000',
        reserveB: '100000',
        totalSupply: '5000',
        fee: 0.003,
        tvl: (5000000 * galaPrice + 100000 * 1),
        volume24h: 50000,
        apy: 12.5,
        name: 'GALA/GUSDC',
        priceTokenA: galaPrice,
        priceTokenB: 1,
        lastUpdated: new Date(),
      },
      {
        id: 'GWETH-GUSDC',
        tokenA: {
          symbol: 'GWETH',
          address: 'GWETH|Unit|none|none',
          decimals: 8,
        },
        tokenB: {
          symbol: 'GUSDC',
          address: 'GUSDC|Unit|none|none',
          decimals: 8,
        },
        reserveA: '50',
        reserveB: '175000',
        totalSupply: '2500',
        fee: 0.003,
        tvl: (50 * ethPrice + 175000 * 1),
        volume24h: 75000,
        apy: 10.0,
        name: 'GWETH/GUSDC',
        priceTokenA: ethPrice,
        priceTokenB: 1,
        lastUpdated: new Date(),
      },
    ];
  }

  calculateAmountOut(amountIn: string, reserveIn: string, reserveOut: string, fee: number): string {
    const amountInNum = parseFloat(amountIn);
    const reserveInNum = parseFloat(reserveIn);
    const reserveOutNum = parseFloat(reserveOut);

    const amountInWithFee = amountInNum * (1 - fee);
    const numerator = amountInWithFee * reserveOutNum;
    const denominator = reserveInNum + amountInWithFee;

    return (numerator / denominator).toFixed(6);
  }

  calculatePriceImpact(amountIn: string, reserveIn: string, reserveOut: string): number {
    const amountInNum = parseFloat(amountIn);
    const reserveInNum = parseFloat(reserveIn);
    const reserveOutNum = parseFloat(reserveOut);

    const priceImpact = (amountInNum / (reserveInNum + amountInNum)) * 100;
    return priceImpact;
  }

  async executeSwap(params: SwapParams): Promise<string> {
    if (!this.gswap) {
      throw new Error('GSwap not connected');
    }

    try {
      console.log('Executing GSwap SDK swap:', params);

      // Convert token symbols to GSwap format
      const tokenIn = formatTokenForGSwap(params.tokenIn);
      const tokenOut = formatTokenForGSwap(params.tokenOut);
      const amountIn = parseFloat(params.amountIn);

      console.log('GSwap formatted tokens:', {
        tokenIn,
        tokenOut,
        amountIn
      });

      // Get quote first
      const quote = await this.gswap.quoting.quoteExactInput(
        tokenIn,
        tokenOut,
        amountIn
      );

      console.log('GSwap quote:', {
        outAmount: quote.outTokenAmount.toNumber(),
        price: quote.currentPrice,
        priceImpact: quote.priceImpact,
        feeTier: quote.feeTier,
        fee: quote.fee
      });
      console.log('Full quote object:', quote);

      // Calculate minimum output with slippage
      const minAmountOut = quote.outTokenAmount.toNumber() * (1 - (params.slippage || 0.01));

      // Execute swap - use GalaChain format for recipient address
      console.log('Executing swap with GSwap SDK...');
      const recipient = this.address ? `eth|${this.address.slice(2)}` : undefined;
      console.log('Recipient address:', recipient);

      // Execute swap using the correct signature
      // swap(tokenIn, tokenOut, fee, amount, walletAddress)
      const swapResult = await this.gswap.swaps.swap(
        tokenIn,              // tokenIn
        tokenOut,             // tokenOut
        quote.feeTier,        // fee (use the fee tier from the quote)
        {                     // amount object
          exactIn: amountIn,
          amountOutMinimum: minAmountOut,
          deadline: Math.floor(Date.now() / 1000) + 300
        },
        recipient             // walletAddress (GalaChain formatted)
      );

      console.log('Swap result:', swapResult);

      // Return transaction ID
      if (swapResult && typeof swapResult === 'object') {
        // For PendingTransaction, we get a transactionId that's not the final blockchain hash
        // This is an internal GalaChain ID that can't be looked up on GalaScan
        const txId = (swapResult as any).transactionId;
        if (txId) {
          console.log('Transaction submitted with ID:', txId);
          // Note: To get the actual blockchain hash, we'd need to wait for confirmation
          // but that requires a socket connection which is not set up in this context
          return txId;
        }
      }

      // Fallback
      const timestamp = Date.now().toString(16);
      const random = Math.random().toString(16).substring(2, 10);
      return `pending-${timestamp}-${random}`;
    } catch (error: any) {
      console.error('GSwap SDK execution error:', error);
      throw new Error(`GSwap execution failed: ${error.message}`);
    }
  }
}