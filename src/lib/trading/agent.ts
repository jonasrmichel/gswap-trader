import type { GSwapClient } from '../gswap/client';
import type { WalletManager } from '../wallet/manager';
import type { TradingConfig } from './config';
import type { LiquidityPool, Trade } from '../gswap/types';
import { TradingStrategy } from './strategies';
import { TradingLogger } from './logger';
import { PaperTradingManager } from './paper-trading';
import { getTradingParams, SIGNAL_THRESHOLDS } from './config';
import { toast } from '../stores/toast';
import { paperTradingStats } from '../stores/trading';

export class TradingAgent {
  private client: GSwapClient;
  private wallet: WalletManager;
  private strategy: TradingStrategy;
  private logger: TradingLogger;
  private config: TradingConfig;
  private paperManager: PaperTradingManager | null = null;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private currentTrades: Map<string, Trade> = new Map();
  private selectedPool: LiquidityPool | null = null;

  constructor(
    client: GSwapClient,
    wallet: WalletManager,
    config: TradingConfig,
    logger: TradingLogger,
    paperManager?: PaperTradingManager
  ) {
    this.client = client;
    this.wallet = wallet;
    this.config = config;
    this.strategy = new TradingStrategy(config);
    this.logger = logger;
    this.paperManager = paperManager || null;
  }

  setPaperManager(manager: PaperTradingManager) {
    this.paperManager = manager;
  }

  updateConfig(config: TradingConfig) {
    this.config = config;
    this.strategy.updateConfig(config);

    // Log configuration change in a more readable format
    const configSummary = `Risk: ${config.risk}, Strategy: ${config.strategy}, Speed: ${config.speed}, Signals: ${config.signals}, Bias: ${config.bias}`;
    this.logger.logSystem(`Configuration updated: ${configSummary}`, 'info');

    // Restart if running to apply new config immediately
    if (this.isRunning) {
      this.logger.logSystem('Restarting agent with new configuration', 'warning');
      this.stop();
      this.start();
    }
  }

  setSelectedPool(pool: LiquidityPool | null) {
    this.selectedPool = pool;
    if (pool) {
      this.logger.logSystem(`Selected trading pool: ${pool.name || pool.id}`, 'info');
    }
  }

  async start() {
    if (this.isRunning) {
      this.logger.logSystem('Trading agent already running', 'warning');
      return;
    }

    if (!this.wallet.isConnected()) {
      this.logger.logError('Cannot start: Wallet not connected');
      toast.error('Please connect your wallet before starting trading');
      throw new Error('Wallet not connected');
    }

    if (!this.selectedPool) {
      this.logger.logError('Cannot start: No pool selected');
      toast.error('Please select a liquidity pool before starting trading');
      throw new Error('Please select a liquidity pool to trade');
    }

    // Check wallet balance for live trading
    if (!this.config.paperTrading) {
      try {
        const balances = await this.wallet.getBalances();
        const totalValue = balances.reduce((sum, b) => sum + (b.value || 0), 0);

        if (totalValue === 0) {
          this.logger.logError('Insufficient wallet balance for live trading');
          toast.error(
            'Your wallet has no funds! Add funds to your wallet or switch to paper trading mode.',
            8000
          );
          throw new Error('Insufficient wallet balance. Your wallet has no funds for live trading.');
        }

        if (totalValue < 10) {
          this.logger.logError('Low wallet balance for live trading');
          toast.warning(
            `Low balance detected ($${totalValue.toFixed(2)}). Minimum $10 recommended for effective trading.`,
            6000
          );
        }

        this.logger.logSystem(`Wallet balance verified: $${totalValue.toFixed(2)}`, 'success');
      } catch (error: any) {
        this.logger.logError('Failed to verify wallet balance', error);
        toast.error(`Failed to verify wallet balance: ${error.message || 'Unknown error'}`);
        throw error;
      }
    }

    this.isRunning = true;
    this.logger.logSystem(`Trading agent started on ${this.selectedPool.name || this.selectedPool.id}`, 'success');

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
      if (!this.selectedPool) {
        this.logger.logSystem('No pool selected, skipping cycle', 'warning');
        return;
      }

      const strategyName = this.config.strategy === 'trend' ? 'Trend Following' :
                           this.config.strategy === 'revert' ? 'Mean Reversion' :
                           'Range Trading';
      this.logger.logSystem(`Executing ${strategyName} strategy on ${this.selectedPool.name || this.selectedPool.id}`);

      // Get wallet balances
      const balances = await this.wallet.getBalances();
      const totalValue = this.config.paperTrading ? 10000 : balances.reduce((sum, b) => sum + (b.value || 0), 0);

      // Update price data for selected pool
      const price = this.calculatePoolPrice(this.selectedPool);
      const volume = parseFloat(this.selectedPool.volume24h?.toString() || '0');
      this.strategy.addPriceData(this.selectedPool.id, price, volume);

      // Generate signal for selected pool
      const signal = this.strategy.generateSignal(this.selectedPool);

      // Log signal
      this.logger.logSignal(signal);

      // Check if signal meets threshold
      const threshold = SIGNAL_THRESHOLDS[this.config.signals];
      if (signal.confidence >= threshold && signal.action !== 'hold') {
        await this.executeSignal(signal, this.selectedPool, totalValue);
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

      // Execute swap (paper or live)
      if (this.config.paperTrading && this.paperManager) {
        // Paper trading execution
        try {
          // Update prices in paper manager
          if (pool.priceTokenA) this.paperManager.updatePrice(pool.tokenA.symbol, pool.priceTokenA);
          if (pool.priceTokenB) this.paperManager.updatePrice(pool.tokenB.symbol, pool.priceTokenB);

          const paperTrade = this.paperManager.executeTrade(
            tokenIn,
            tokenOut,
            parseFloat(amountIn),
            parseFloat(amountOut)
          );

          trade.txHash = paperTrade.id;
          trade.status = 'success';
          trade.profit = paperTrade.profit || 0;

          // Update stats store
          paperTradingStats.set(this.paperManager.getStats());

          this.logger.logSystem(`Paper trade executed: ${tokenIn} -> ${tokenOut}`, 'success');
        } catch (error: any) {
          trade.status = 'failed';
          this.logger.logError('Paper trade failed', error);
        }
      } else {
        // Live trading execution
        // Check if wallet has sufficient balance for the trade
        const balances = await this.walletManager.getBalances();
        const tokenInBalance = balances.find(b => b.token === tokenIn);

        if (!tokenInBalance || parseFloat(tokenInBalance.balance) < parseFloat(amountIn)) {
          const availableBalance = tokenInBalance?.balance || '0';
          this.logger.logSystem(
            `Insufficient ${tokenIn} balance. Required: ${amountIn}, Available: ${availableBalance}`,
            'warning'
          );
          trade.status = 'failed';
          this.logger.logTrade(trade);
          return;
        }

        const txHash = await this.client.executeSwap({
          poolId: pool.id,
          tokenIn,
          tokenOut,
          amountIn,
          minAmountOut: (parseFloat(amountOut) * (1 - params.slippage)).toString(),
          slippage: params.slippage,
        });

        trade.txHash = txHash;
        trade.status = 'success';
        trade.profit = this.calculateProfit(trade, pool);

        this.logger.logSystem(`Live trade executed: ${txHash}`, 'success');
      }

      this.logger.logTrade(trade);

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