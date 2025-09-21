import { ethers } from 'ethers';
import type { LiquidityPool, SwapParams, Token } from './types';
import { CoinGeckoService } from '../services/coingecko';

export class GSwapClient {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet | null = null;
  private routerAddress = '0x1234567890abcdef1234567890abcdef12345678'; // Placeholder
  private coinGecko: CoinGeckoService;

  constructor(rpcUrl: string = 'https://bsc-dataseed1.binance.org:443') {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.coinGecko = new CoinGeckoService();
  }

  async connect(privateKey: string) {
    this.signer = new ethers.Wallet(privateKey, this.provider);
    return this.signer.address;
  }

  async getBalance(tokenAddress: string, walletAddress: string): Promise<string> {
    if (tokenAddress === ethers.ZeroAddress) {
      // Native token balance
      const balance = await this.provider.getBalance(walletAddress);
      return ethers.formatEther(balance);
    }

    // ERC20 token balance
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );

    const balance = await tokenContract.balanceOf(walletAddress);
    return ethers.formatUnits(balance, 18); // Assuming 18 decimals
  }

  async getPools(): Promise<LiquidityPool[]> {
    console.log('[GSwapClient] Fetching pools with live prices...');

    // Fetch live prices from CoinGecko
    const symbols = ['GALA', 'USDC', 'BNB', 'ETH', 'USDT'];
    const prices = await this.coinGecko.getPrices(symbols);

    // Get live prices or use fallback (current market prices)
    const galaPrice = prices.get('GALA')?.price || 0.01751;
    const usdcPrice = prices.get('USDC')?.price || 1.0;
    const bnbPrice = prices.get('BNB')?.price || 600;
    const ethPrice = prices.get('ETH')?.price || 3500;
    const usdtPrice = prices.get('USDT')?.price || 1.0;

    console.log('[GSwapClient] Live prices:', {
      GALA: galaPrice,
      USDC: usdcPrice,
      BNB: bnbPrice,
      ETH: ethPrice,
      USDT: usdtPrice
    });

    // Return pools with live price data
    return [
      {
        id: 'GALA-USDC',
        tokenA: {
          symbol: 'GALA',
          address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae',
          decimals: 18,
        },
        tokenB: {
          symbol: 'USDC',
          address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
          decimals: 18,
        },
        reserveA: '1000000',
        reserveB: '50000',
        totalSupply: '223606.79',
        fee: 0.003,
        tvl: (1000000 * galaPrice + 50000 * usdcPrice),
        volume24h: Math.min(prices.get('GALA')?.volume24h || 15000, 100000),
        apy: 12.5,
        name: 'GALA/USDC',
        priceTokenA: galaPrice,
        priceTokenB: usdcPrice,
        lastUpdated: prices.get('GALA')?.lastUpdated || new Date(),
      },
      {
        id: 'USDC-GALA',
        tokenA: {
          symbol: 'USDC',
          address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
          decimals: 18,
        },
        tokenB: {
          symbol: 'GALA',
          address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae',
          decimals: 18,
        },
        reserveA: '50000',
        reserveB: '1000000',
        totalSupply: '223606.79',
        fee: 0.003,
        tvl: (50000 * usdcPrice + 1000000 * galaPrice),
        volume24h: Math.min(prices.get('GALA')?.volume24h || 15000, 100000),
        apy: 12.5,
        name: 'USDC/GALA',
        priceTokenA: usdcPrice,
        priceTokenB: galaPrice,
        lastUpdated: prices.get('USDC')?.lastUpdated || new Date(),
      },
      {
        id: 'GALA-BNB',
        tokenA: {
          symbol: 'GALA',
          address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae',
          decimals: 18,
        },
        tokenB: {
          symbol: 'BNB',
          address: ethers.ZeroAddress,
          decimals: 18,
        },
        reserveA: '500000',
        reserveB: '100',
        totalSupply: '7071.07',
        fee: 0.003,
        tvl: (500000 * galaPrice + 100 * bnbPrice),
        volume24h: Math.min(prices.get('GALA')?.volume24h || 8000, 50000),
        apy: 8.2,
        name: 'GALA/BNB',
        priceTokenA: galaPrice,
        priceTokenB: bnbPrice,
        lastUpdated: prices.get('GALA')?.lastUpdated || new Date(),
      },
      {
        id: 'USDC-BNB',
        tokenA: {
          symbol: 'USDC',
          address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
          decimals: 18,
        },
        tokenB: {
          symbol: 'BNB',
          address: ethers.ZeroAddress,
          decimals: 18,
        },
        reserveA: '100000',
        reserveB: '400',
        totalSupply: '6324.55',
        fee: 0.003,
        tvl: (100000 * usdcPrice + 400 * bnbPrice),
        volume24h: Math.min(prices.get('BNB')?.volume24h || 50000, 200000),
        apy: 15.0,
        name: 'USDC/BNB',
        priceTokenA: usdcPrice,
        priceTokenB: bnbPrice,
        lastUpdated: prices.get('BNB')?.lastUpdated || new Date(),
      },
      {
        id: 'ETH-USDT',
        tokenA: {
          symbol: 'ETH',
          address: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
          decimals: 18,
        },
        tokenB: {
          symbol: 'USDT',
          address: '0x55d398326f99059ff775485246999027b3197955',
          decimals: 18,
        },
        reserveA: '100',
        reserveB: '250000',
        totalSupply: '5000',
        fee: 0.003,
        tvl: (100 * ethPrice + 250000 * usdtPrice),
        volume24h: Math.min(prices.get('ETH')?.volume24h || 100000, 500000),
        apy: 18.5,
        name: 'ETH/USDT',
        priceTokenA: ethPrice,
        priceTokenB: usdtPrice,
        lastUpdated: prices.get('ETH')?.lastUpdated || new Date(),
      },
      {
        id: 'GALA-ETH',
        tokenA: {
          symbol: 'GALA',
          address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae',
          decimals: 18,
        },
        tokenB: {
          symbol: 'ETH',
          address: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
          decimals: 18,
        },
        reserveA: '2000000',
        reserveB: '40',
        totalSupply: '8944.27',
        fee: 0.003,
        tvl: (2000000 * galaPrice + 40 * ethPrice),
        volume24h: Math.min(prices.get('GALA')?.volume24h || 20000, 75000),
        apy: 10.3,
        name: 'GALA/ETH',
        priceTokenA: galaPrice,
        priceTokenB: ethPrice,
        lastUpdated: prices.get('GALA')?.lastUpdated || new Date(),
      },
      {
        id: 'ETH-GALA',
        tokenA: {
          symbol: 'ETH',
          address: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
          decimals: 18,
        },
        tokenB: {
          symbol: 'GALA',
          address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae',
          decimals: 18,
        },
        reserveA: '40',
        reserveB: '2000000',
        totalSupply: '8944.27',
        fee: 0.003,
        tvl: (40 * ethPrice + 2000000 * galaPrice),
        volume24h: Math.min(prices.get('ETH')?.volume24h || 20000, 75000),
        apy: 10.3,
        name: 'ETH/GALA',
        priceTokenA: ethPrice,
        priceTokenB: galaPrice,
        lastUpdated: prices.get('ETH')?.lastUpdated || new Date(),
      },
      {
        id: 'USDT-GALA',
        tokenA: {
          symbol: 'USDT',
          address: '0x55d398326f99059ff775485246999027b3197955',
          decimals: 18,
        },
        tokenB: {
          symbol: 'GALA',
          address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae',
          decimals: 18,
        },
        reserveA: '75000',
        reserveB: '1500000',
        totalSupply: '335410.19',
        fee: 0.003,
        tvl: (75000 * usdtPrice + 1500000 * galaPrice),
        volume24h: Math.min(prices.get('GALA')?.volume24h || 25000, 80000),
        apy: 14.2,
        name: 'USDT/GALA',
        priceTokenA: usdtPrice,
        priceTokenB: galaPrice,
        lastUpdated: prices.get('USDT')?.lastUpdated || new Date(),
      },
    ];
  }

  calculateAmountOut(
    amountIn: string,
    reserveIn: string,
    reserveOut: string,
    fee: number = 0.003
  ): string {
    const amountInBN = ethers.parseEther(amountIn);
    const reserveInBN = ethers.parseEther(reserveIn);
    const reserveOutBN = ethers.parseEther(reserveOut);

    const amountInWithFee = amountInBN * BigInt(Math.floor((1 - fee) * 10000)) / 10000n;
    const numerator = amountInWithFee * reserveOutBN;
    const denominator = reserveInBN + amountInWithFee;

    const amountOut = numerator / denominator;
    return ethers.formatEther(amountOut);
  }

  calculatePriceImpact(
    amountIn: string,
    reserveIn: string,
    reserveOut: string
  ): number {
    const amountInNum = parseFloat(amountIn);
    const reserveInNum = parseFloat(reserveIn);
    const reserveOutNum = parseFloat(reserveOut);

    const spotPrice = reserveOutNum / reserveInNum;
    const amountOut = parseFloat(this.calculateAmountOut(amountIn, reserveIn, reserveOut));
    const executionPrice = amountOut / amountInNum;

    return ((spotPrice - executionPrice) / spotPrice) * 100;
  }

  async executeSwap(params: SwapParams): Promise<string> {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }

    // Simulate swap for demo
    console.log('Executing swap:', params);

    // Return mock transaction hash
    return '0x' + Math.random().toString(16).substring(2, 66);
  }

  async getGasPrice(): Promise<string> {
    const gasPrice = await this.provider.getFeeData();
    return ethers.formatUnits(gasPrice.gasPrice || 0n, 'gwei');
  }
}