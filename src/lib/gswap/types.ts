export interface Token {
  symbol: string;
  address: string;
  decimals: number;
  balance?: string;
  price?: number;
}

export interface LiquidityPool {
  id: string;
  name?: string;
  tokenA: Token;
  tokenB: Token;
  reserveA: string;
  reserveB: string;
  totalSupply: string;
  fee: number;
  apy?: number;
  volume24h?: number;
  tvl?: number;
  priceTokenA?: number;
  priceTokenB?: number;
  lastUpdated?: Date;
}

export interface SwapParams {
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  slippage: number;
}

export interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  params: StrategyParams;
}

export interface StrategyParams {
  minProfit: number;
  maxSlippage: number;
  checkInterval: number;
  maxTradeSize: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface Trade {
  id: string;
  timestamp: Date;
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  priceIn?: number;  // Price of input token in USD
  priceOut?: number; // Price of output token in USD
  fee?: number;      // Transaction fee
  profit?: number;
  txHash?: string;
  status: 'pending' | 'success' | 'failed';
}

export interface MarketData {
  price: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
}