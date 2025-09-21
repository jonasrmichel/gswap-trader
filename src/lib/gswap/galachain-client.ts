import { GalaChainProvider, MetaMaskWallet } from '@gala-chain/connect';
import type { SwapParams, LiquidityPool, Trade } from './types';
import type { ChainCallDTO, TokenBalance } from '@gala-chain/api';

export class GalaChainSwapClient {
  private provider: GalaChainProvider | null = null;
  private wallet: MetaMaskWallet | null = null;
  private isConnected = false;

  constructor() {
    // Initialize with GalaChain mainnet
    this.provider = new GalaChainProvider('https://gateway.galachain.com/api/1');
  }

  async connect(): Promise<void> {
    try {
      // Connect to MetaMask
      this.wallet = new MetaMaskWallet();
      await this.wallet.connect();

      // Set the wallet for the provider
      if (this.provider) {
        await this.provider.setWallet(this.wallet);
        this.isConnected = true;
      }
    } catch (error) {
      console.error('Failed to connect to GalaChain:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.wallet) {
      await this.wallet.disconnect();
      this.wallet = null;
    }
    this.isConnected = false;
  }

  async getAddress(): Promise<string | null> {
    if (!this.wallet) return null;
    return await this.wallet.getAddress();
  }

  async getBalances(): Promise<TokenBalance[]> {
    if (!this.wallet || !this.provider) {
      throw new Error('Not connected to GalaChain');
    }

    const address = await this.wallet.getAddress();
    if (!address) {
      throw new Error('No wallet address');
    }

    // Call GalaChain to get token balances
    const dto: ChainCallDTO = {
      method: 'GetBalances',
      callerPublicKey: address,
      signature: '',
      prefix: '',
      uniqueKey: '',
    };

    const response = await this.provider.send(dto);
    return response.balances || [];
  }

  async getPools(): Promise<LiquidityPool[]> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    // Call GalaChain to get liquidity pools
    const dto: ChainCallDTO = {
      method: 'GetLiquidityPools',
      callerPublicKey: '',
      signature: '',
      prefix: '',
      uniqueKey: '',
    };

    try {
      const response = await this.provider.send(dto);

      // Map GalaChain pool data to our LiquidityPool type
      return (response.pools || []).map((pool: any) => ({
        id: pool.poolId,
        name: `${pool.tokenA.symbol}/${pool.tokenB.symbol}`,
        tokenA: {
          symbol: pool.tokenA.symbol,
          address: pool.tokenA.address,
          balance: pool.tokenA.balance || '0',
          price: pool.tokenA.price || 0,
        },
        tokenB: {
          symbol: pool.tokenB.symbol,
          address: pool.tokenB.address,
          balance: pool.tokenB.balance || '0',
          price: pool.tokenB.price || 0,
        },
        reserveA: pool.reserveA || '0',
        reserveB: pool.reserveB || '0',
        totalSupply: pool.totalSupply || '0',
        fee: pool.fee || 0.003, // 0.3% default fee
        volume24h: pool.volume24h || '0',
        tvl: pool.tvl || 0,
        apy: pool.apy || 0,
      }));
    } catch (error) {
      console.error('Failed to fetch pools:', error);
      throw error;
    }
  }

  async executeSwap(params: SwapParams): Promise<string> {
    if (!this.wallet || !this.provider) {
      throw new Error('Not connected to GalaChain');
    }

    const address = await this.wallet.getAddress();
    if (!address) {
      throw new Error('No wallet address');
    }

    // Prepare swap transaction
    const swapDto: ChainCallDTO = {
      method: 'ExecuteSwap',
      callerPublicKey: address,
      signature: '',
      prefix: '',
      uniqueKey: `swap_${Date.now()}`,
      params: {
        poolId: params.poolId,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        minAmountOut: params.minAmountOut,
        slippage: params.slippage,
      },
    };

    // Sign the transaction
    const signedDto = await this.wallet.sign(swapDto);

    // Submit to GalaChain
    const response = await this.provider.send(signedDto);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.txHash || response.transactionId || 'pending';
  }

  calculateAmountOut(
    amountIn: string,
    reserveIn: string,
    reserveOut: string,
    fee: number = 0.003
  ): string {
    const amountInNum = parseFloat(amountIn);
    const reserveInNum = parseFloat(reserveIn);
    const reserveOutNum = parseFloat(reserveOut);

    const amountInWithFee = amountInNum * (1 - fee);
    const numerator = amountInWithFee * reserveOutNum;
    const denominator = reserveInNum + amountInWithFee;

    return (numerator / denominator).toFixed(6);
  }

  calculatePriceImpact(
    amountIn: string,
    reserveIn: string,
    reserveOut: string
  ): number {
    const amountInNum = parseFloat(amountIn);
    const reserveInNum = parseFloat(reserveIn);
    const reserveOutNum = parseFloat(reserveOut);

    const currentPrice = reserveOutNum / reserveInNum;
    const newReserveIn = reserveInNum + amountInNum;
    const amountOut = this.calculateAmountOut(amountIn, reserveIn, reserveOut);
    const newReserveOut = reserveOutNum - parseFloat(amountOut);
    const newPrice = newReserveOut / newReserveIn;

    return ((newPrice - currentPrice) / currentPrice) * 100;
  }

}