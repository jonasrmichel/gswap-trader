import { GSwap, PrivateKeySigner, FEE_TIER, EventSocketClient, type GalaChainSigner } from '@gala-chain/gswap-sdk';
import type { LiquidityPool, SwapParams } from './types';
import { CoinGeckoService } from '../services/coingecko';
import { MetaMaskSigner } from './metamask-signer';
import { ethers } from 'ethers';

// Helper functions for token format conversion
export function formatTokenForGSwap(symbol: string): string {
  // Convert simple token symbol to GSwap format
  // Special handling for wrapped tokens
  if (symbol === 'ETH' || symbol === 'WETH' || symbol === 'GWETH') {
    return 'GWETH|Unit|none|none';
  }
  if (symbol === 'GALA') {
    return 'GALA|Unit|none|none';
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
  private galaChainAddress: string | null = null;
  private socketClient: EventSocketClient | null = null;

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
      this.galaChainAddress = `eth|${this.address.slice(2)}`; // Match test-swap.js format exactly (no toLowerCase)

      console.log('[GSwapSDKClient] Connecting with addresses:');
      console.log('  - Ethereum address:', this.address);
      console.log('  - GalaChain address:', this.galaChainAddress);

      // Create GSwap instance with signer and wallet address (just like test-swap.js)
      this.gswap = new GSwap({
        signer: this.signer,
        walletAddress: this.galaChainAddress
      });
      
      // Initialize socket connection AFTER GSwap (optional, for tracking)
      try {
        const bundlerUrl = 'https://bundle-backend-prod1.defi.gala.com';
        this.socketClient = new EventSocketClient(bundlerUrl);
        await this.socketClient.connect();
        console.log('[GSwapSDKClient] ✅ Socket connected to bundler (for tracking)');
      } catch (socketError) {
        console.log('[GSwapSDKClient] Socket connection failed (non-critical):', socketError);
        // Socket is optional, continue without it
      }

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
      this.galaChainAddress = null;
      return;
    }

    try {
      // Create MetaMaskSigner wrapper
      this.signer = new MetaMaskSigner(ethersSigner);

      // Get address from signer
      this.address = await ethersSigner.getAddress();
      this.galaChainAddress = `eth|${this.address.slice(2)}`; // Match test-swap.js format exactly (no toLowerCase)

      console.log('[GSwapSDKClient] MetaMask connection:');
      console.log('  - Ethereum address:', this.address);
      console.log('  - GalaChain address:', this.galaChainAddress);

      // Create GSwap instance with MetaMask signer and GalaChain formatted address
      this.gswap = new GSwap({
        signer: this.signer,
        walletAddress: this.galaChainAddress
      });
      
      // Initialize socket connection AFTER GSwap (optional, for tracking)
      try {
        const bundlerUrl = 'https://bundle-backend-prod1.defi.gala.com';
        this.socketClient = new EventSocketClient(bundlerUrl);
        await this.socketClient.connect();
        console.log('[GSwapSDKClient] ✅ Socket connected to bundler (for tracking)');
      } catch (socketError) {
        console.log('[GSwapSDKClient] Socket connection failed (non-critical):', socketError);
        // Socket is optional, continue without it
      }

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

  isConnected(): boolean {
    return this.connected;
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
    // For getUserAssets, we can fetch without being connected (read-only operation)
    // Create a temporary GSwap instance if not connected
    let gswapInstance = this.gswap;
    
    if (!gswapInstance) {
      console.log('[GSwapSDKClient] Creating temporary GSwap instance for asset query');
      // Create a read-only instance without signer
      const tempAddress = walletAddress.startsWith('0x')
        ? `eth|${walletAddress.slice(2).toLowerCase()}`
        : walletAddress;
        
      gswapInstance = new GSwap({
        walletAddress: tempAddress,
      });
    }

    try {
      // Convert Ethereum address to GalaChain format
      const galaChainAddress = walletAddress.startsWith('0x')
        ? `eth|${walletAddress.slice(2).toLowerCase()}`
        : walletAddress;

      // Silently try to fetch assets - don't log unless successful
      const result = await gswapInstance.assets.getUserAssets(galaChainAddress, 1, 20);
      console.log('[GSwapSDKClient] Assets fetched successfully');
      
      // If no tokens, try fetching specific token balances
      if (!result.tokens || result.tokens.length === 0) {
        console.log('[GSwapSDKClient] No tokens found, using default balances');
        
        // Return default tokens immediately
        return { 
          tokens: [
            { symbol: 'GALA', quantity: '0', decimals: 8 },
            { symbol: 'GWETH', quantity: '0', decimals: 8 },
            { symbol: 'GUSDC', quantity: '0', decimals: 8 },
            { symbol: 'GUSDT', quantity: '0', decimals: 8 }
          ], 
          count: 4 
        };
      }
      
      return result;
    } catch (error: any) {
      // Check if this is a 400 error (likely unregistered wallet)
      if (error?.message?.includes('400') || error?.message?.includes('Bad Request')) {
        console.log('[GSwapSDKClient] Wallet not found on GalaChain, using default balances');
      } else if (error?.message && !error.message.includes('fetch')) {
        // Only log non-network errors
        console.warn('[GSwapSDKClient] Error fetching assets:', error.message);
      }
      
      // Don't try the API fallback again to avoid duplicate 400 errors
      
      // Return default tokens with 0 balance
      return { 
        tokens: [
          { symbol: 'GALA', quantity: '0', decimals: 8 },
          { symbol: 'GWETH', quantity: '0', decimals: 8 },
          { symbol: 'GUSDC', quantity: '0', decimals: 8 },
          { symbol: 'GUSDT', quantity: '0', decimals: 8 }
        ], 
        count: 4 
      };
    }
  }

  async getPools(): Promise<LiquidityPool[]> {
    // Pools should be viewable even without wallet connection
    console.log('[GSwapSDKClient] Getting pools...');
    
    // Get prices from CoinGecko with error handling
    let galaPrice = 0.02;
    let ethPrice = 3500;
    
    try {
      const prices = await this.coinGecko.getPrices(['GALA', 'ethereum']);
      galaPrice = prices.get('GALA')?.price || 0.02;
      ethPrice = prices.get('ethereum')?.price || 3500;
      console.log('[GSwapSDKClient] Got prices - GALA:', galaPrice, 'ETH:', ethPrice);
    } catch (error) {
      console.warn('[GSwapSDKClient] Failed to get prices, using defaults:', error);
    }

    // GSwap SDK doesn't provide pool listing directly
    // Return hardcoded pools based on known GSwap pairs
    // In the future, this could fetch from a GSwap API endpoint
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
    console.log('[GSwapSDKClient] executeSwap called');
    console.log('[GSwapSDKClient] Connected?', this.connected);
    console.log('[GSwapSDKClient] Has GSwap?', !!this.gswap);
    console.log('[GSwapSDKClient] Has signer?', !!this.signer);
    console.log('[GSwapSDKClient] Address:', this.address);
    
    if (!this.connected) {
      throw new Error('GSwapSDKClient not connected. Call connect() first.');
    }
    
    if (!this.gswap) {
      throw new Error('GSwap instance not initialized');
    }

    try {
      console.log('🚀 Starting real GSwap transaction');
      console.log('📊 Swap parameters:', params);

      // Verify we have a signer
      if (!this.signer) {
        throw new Error('No signer available - wallet not connected properly');
      }

      // Convert token symbols to GSwap format
      const tokenIn = formatTokenForGSwap(params.tokenIn);
      const tokenOut = formatTokenForGSwap(params.tokenOut);
      const amountIn = parseFloat(params.amountIn);

      console.log('🔄 GSwap formatted tokens:', {
        tokenIn,
        tokenOut,
        amountIn,
        walletAddress: this.address
      });

      // Get quote first
      console.log('💱 Getting quote from GSwap...');
      console.log('  - Token In:', tokenIn);
      console.log('  - Token Out:', tokenOut);
      console.log('  - Amount In:', amountIn);
      console.log('  - GSwap instance:', this.gswap);
      console.log('  - Signer type:', this.signer?.constructor.name);
      console.log('  - GalaChain address:', this.galaChainAddress);
      console.log('  - Connected?:', this.connected);
      
      // Small delay to ensure GSwap is ready (might help with 409 conflicts)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Log the actual request that will be sent
      console.log('  - About to call quoteExactInput with:', { tokenIn, tokenOut, amountIn });
      
      let quote;
      try {
        quote = await this.gswap.quoting.quoteExactInput(
          tokenIn,
          tokenOut,
          amountIn
        );
      } catch (quoteError: any) {
        console.error('Quote failed:', quoteError);
        console.error('Quote error response:', quoteError.response);
        console.error('Quote error data:', quoteError.response?.data);
        console.error('Quote error status:', quoteError.response?.status);
        console.error('Quote error details:', quoteError.details);
        
        // Try to extract more details from the error
        if (quoteError.response?.data) {
          console.error('Server response data:', JSON.stringify(quoteError.response.data, null, 2));
        }
        
        throw new Error(`Failed to get quote: ${quoteError.message || 'Unknown error'}`);
      }

      console.log('📈 Quote received:', {
        outAmount: quote.outTokenAmount.toNumber(),
        price: quote.currentPrice,
        priceImpact: quote.priceImpact,
        feeTier: quote.feeTier,
      });

      // Calculate minimum output with slippage
      const minAmountOut = quote.outTokenAmount.toNumber() * (1 - (params.slippage || 0.01));

      // Use the stored GalaChain address - MUST match the one used in GSwap initialization
      const recipient = this.galaChainAddress;
      
      if (!recipient) {
        throw new Error('GalaChain address not set - wallet not properly connected');
      }
      
      console.log('🔄 Executing REAL swap on GalaChain...');
      console.log('  - Amount In:', amountIn, params.tokenIn);
      console.log('  - Min Amount Out:', minAmountOut, params.tokenOut);
      console.log('  - Recipient (GalaChain):', recipient);
      console.log('  - Slippage:', (params.slippage || 0.01) * 100 + '%');
      console.log('  - Fee Tier:', quote.feeTier || FEE_TIER.PERCENT_01_00);

      // Use the working format from test-trade.js
      // The fee must be one of the valid FEE_TIER enum values: 500, 3000, or 10000
      let fee = 10000; // Default to 1% (PERCENT_01_00 = 10000)
      
      // Check if quote has a valid fee tier
      if (quote.feeTier !== undefined) {
        console.log('  - Quote fee tier:', quote.feeTier, 'type:', typeof quote.feeTier);
        // Validate it's one of the allowed values
        if (quote.feeTier === 500 || quote.feeTier === 3000 || quote.feeTier === 10000) {
          fee = quote.feeTier;
        } else if (quote.feeTier === FEE_TIER.PERCENT_00_05 || 
                   quote.feeTier === FEE_TIER.PERCENT_00_30 || 
                   quote.feeTier === FEE_TIER.PERCENT_01_00) {
          fee = quote.feeTier;
        } else {
          console.warn('Invalid fee tier from quote:', quote.feeTier, '- using default 10000 (1%)');
        }
      }
      
      console.log('  - Using fee value:', fee, '(type:', typeof fee, ', isInteger:', Number.isInteger(fee), ')');
      
      // Use the CORRECT signature from test-swap.js
      // swap(tokenIn, tokenOut, fee, amount, walletAddress)
      const swapResult = await this.gswap.swaps.swap(
        tokenIn,           // tokenIn
        tokenOut,          // tokenOut
        fee,               // fee (500, 3000, or 10000)
        {                  // amount object
          exactIn: amountIn,
          amountOutMinimum: minAmountOut,
        },
        recipient          // walletAddress (GalaChain format)
      );

      console.log('✅ Swap submitted successfully!');
      console.log('📋 Swap result:', swapResult);
      console.log('📝 Transaction ID:', swapResult.transactionId);
      
      // Log all properties of swapResult to find the blockchain hash
      console.log('🔍 Swap result properties:', Object.keys(swapResult));
      const swapResultDetails = swapResult as unknown as Record<string, unknown>;
      console.log('🔍 Swap result details:', {
        transactionId: swapResultDetails.transactionId,
        transactionHash: swapResultDetails.transactionHash,
        hash: swapResultDetails.hash,
        txHash: swapResultDetails.txHash,
        message: swapResultDetails.message,
        error: swapResultDetails.error
      });
      
      console.log('⏳ Waiting for blockchain confirmation...');

      // The swap returns a PendingTransaction that we need to wait for
      if (swapResult && typeof swapResult === 'object') {
        const txId = (swapResult as any).transactionId;
        console.log('📝 Transaction submitted with ID:', txId);
        
        // Try to get blockchain hash if socket is connected
        if (this.socketClient && this.socketClient.isConnected()) {
          console.log('🔌 Socket connected, attempting to get blockchain hash...');
          try {
            const confirmedTx = await (swapResult as any).waitDelegate();
            console.log('✅ Transaction confirmed!', confirmedTx);
            
            // Extract the blockchain transaction hash
            const txHash = confirmedTx?.transactionHash || 
                          confirmedTx?.hash || 
                          confirmedTx?.txHash ||
                          confirmedTx?.Data?.TransactionId ||
                          confirmedTx?.id;
                          
            if (txHash && txHash !== txId) {
              console.log('🎉 Got blockchain hash:', txHash);
              console.log('🔗 View on GalaScan: https://galascan.gala.com/transaction/' + txHash);
              return txHash;
            }
          } catch (waitError: any) {
            console.warn('Could not get blockchain hash:', waitError.message);
          }
        } else {
          console.log('⚠️ Socket not connected - cannot get blockchain hash');
        }
        
        // Fallback to transaction ID
        console.log('✅ Trade submitted to GalaChain successfully');
        console.log('ℹ️ Transaction ID:', txId);
        console.log('📌 Transaction Status: PENDING (processing on blockchain)');
        console.log('⏱️ Confirmation: ~5-10 seconds for blockchain processing');
        
        return txId || `pending-${Date.now()}`;
      }

      // Fallback - should never reach here
      const fallbackId = `pending-${Date.now()}`;
      console.warn('⚠️ Using fallback transaction ID:', fallbackId);
      return fallbackId;
    } catch (error: any) {
      console.error('GSwap SDK execution error:', error);
      throw new Error(`GSwap execution failed: ${error.message}`);
    }
  }
}
