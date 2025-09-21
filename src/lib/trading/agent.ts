import type { GSwapClient } from '../gswap/client';
import type { WalletManager } from '../wallet/manager';
import type { TradingConfig } from './config';
import type { LiquidityPool, Trade } from '../gswap/types';
import { TradingStrategy } from './strategies';
import { TradingLogger } from './logger';
import { getTradingParams, SIGNAL_THRESHOLDS } from './config';

export class TradingAgent {
  private client: GSwapClient;
  private wallet: WalletManager;
  private strategy: TradingStrategy;
  private logger: TradingLogger;
  private config: TradingConfig;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private currentTrades: Map<string, Trade> = new Map();

  constructor(
    client: GSwapClient,
    wallet: WalletManager,
    config: TradingConfig,
    logger: TradingLogger
  ) {
    this.client = client;
    this.wallet = wallet;
    this.config = config;
    this.strategy = new TradingStrategy(config);
    this.logger = logger;
  }

  updateConfig(config: TradingConfig) {
    this.config = config;
    this.strategy.updateConfig(config);
    this.logger.logSystem(`Trading config updated: ${JSON.stringify(config)}`);

    // Restart if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  async start() {
    if (this.isRunning) {
      this.logger.logSystem('Trading agent already running', 'warning');
      return;
    }

    if (!this.wallet.isConnected()) {
      this.logger.logError('Cannot start: Wallet not connected');
      throw new Error('Wallet not connected');
    }

    this.isRunning = true;
    this.logger.logSystem('Trading agent started', 'success');

    const params = getTradingParams(this.config);

    // Start trading loop
    this.intervalId = setInterval(() => {
      this.executeTradingCycle();
    }, params.checkInterval);

    // Execute immediately
    this.executeTradingCycle();
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    this.logger.logSystem('Trading agent stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private async executeTradingCycle() {
    try {
      this.logger.logSystem('Executing trading cycle');

      // Get pools
      const pools = await this.client.getPools();

      // Get wallet balances
      const balances = await this.wallet.getBalances();
      const totalValue = balances.reduce((sum, b) => sum + (b.value || 0), 0);

      // Analyze each pool
      for (const pool of pools) {
        // Update price data
        const price = this.calculatePoolPrice(pool);
        const volume = parseFloat(pool.volume24h?.toString() || '0');
        this.strategy.addPriceData(pool.id, price, volume);

        // Generate signal
        const signal = this.strategy.generateSignal(pool);

        // Log signal
        this.logger.logSignal(signal);

        // Check if signal meets threshold
        const threshold = SIGNAL_THRESHOLDS[this.config.signals];
        if (signal.confidence >= threshold && signal.action !== 'hold') {
          await this.executeSignal(signal, pool, totalValue);
        }
      }
    } catch (error) {
      this.logger.logError('Trading cycle error', error);
    }
  }

  private async executeSignal(signal: any, pool: LiquidityPool, totalValue: number) {
    try {
      const params = getTradingParams(this.config);

      // Calculate trade size
      const maxSize = totalValue * params.maxPositionSize;
      const tradeSize = Math.min(maxSize, signal.suggestedAmount || maxSize * 0.5);

      // Determine tokens
      let tokenIn: string, tokenOut: string, amountIn: string;

      if (signal.action === 'buy') {
        // Buy tokenA with tokenB
        tokenIn = pool.tokenB.symbol;
        tokenOut = pool.tokenA.symbol;
        amountIn = (tradeSize / (pool.tokenB.price || 1)).toFixed(6);
      } else {
        // Sell tokenA for tokenB
        tokenIn = pool.tokenA.symbol;
        tokenOut = pool.tokenB.symbol;
        amountIn = (tradeSize / (pool.tokenA.price || 1)).toFixed(6);
      }

      // Calculate expected output
      const amountOut = this.client.calculateAmountOut(
        amountIn,
        signal.action === 'buy' ? pool.reserveB : pool.reserveA,
        signal.action === 'buy' ? pool.reserveA : pool.reserveB,
        pool.fee
      );

      // Check slippage
      const priceImpact = this.client.calculatePriceImpact(
        amountIn,
        signal.action === 'buy' ? pool.reserveB : pool.reserveA,
        signal.action === 'buy' ? pool.reserveA : pool.reserveB
      );

      if (Math.abs(priceImpact) > params.slippage * 100) {
        this.logger.logSystem(
          `Trade skipped: Price impact ${priceImpact.toFixed(2)}% exceeds slippage tolerance`,
          'warning'
        );
        return;
      }

      // Create trade record
      const trade: Trade = {
        id: this.generateTradeId(),
        timestamp: new Date(),
        poolId: pool.id,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        status: 'pending',
      };

      this.currentTrades.set(trade.id, trade);
      this.logger.logTrade(trade);

      // Execute swap
      const txHash = await this.client.executeSwap({
        poolId: pool.id,
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut: (parseFloat(amountOut) * (1 - params.slippage)).toString(),
        slippage: params.slippage,
      });

      // Update trade status
      trade.txHash = txHash;
      trade.status = 'success';
      trade.profit = this.calculateProfit(trade, pool);

      this.logger.logTrade(trade);
      this.logger.logSystem(`Trade executed: ${txHash}`, 'success');

    } catch (error) {
      this.logger.logError('Trade execution failed', error);
    }
  }

  private calculatePoolPrice(pool: LiquidityPool): number {
    const reserveA = parseFloat(pool.reserveA);
    const reserveB = parseFloat(pool.reserveB);
    return reserveB / reserveA; // Price of tokenA in terms of tokenB
  }

  private calculateProfit(trade: Trade, pool: LiquidityPool): number {
    // Simplified profit calculation
    const inputValue = parseFloat(trade.amountIn) * (pool.tokenA.price || 1);
    const outputValue = parseFloat(trade.amountOut) * (pool.tokenB.price || 1);
    return ((outputValue - inputValue) / inputValue) * 100;
  }

  private generateTradeId(): string {
    return 'trade_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      trades: Array.from(this.currentTrades.values()),
      ...this.logger.getStats(),
    };
  }
}