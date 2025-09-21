import { ethers } from 'ethers';
import type { LiquidityPool, SwapParams, Token } from './types';

export class GSwapClient {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet | null = null;
  private routerAddress = '0x1234567890abcdef1234567890abcdef12345678'; // Placeholder

  constructor(rpcUrl: string = 'https://bsc-dataseed1.binance.org:443') {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
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
    // Return demo pools for now
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
        tvl: 100000,
        volume24h: 15000,
        apy: 12.5,
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
        tvl: 60000,
        volume24h: 8000,
        apy: 8.2,
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
        tvl: 200000,
        volume24h: 50000,
        apy: 15.0,
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