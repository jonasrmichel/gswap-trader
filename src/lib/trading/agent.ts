import type { GSwapSDKClient } from '../gswap/gswap-sdk-client';
import type { WalletManager } from '../wallet/manager';
import type { TradingConfig } from './config';
import type { LiquidityPool, Trade } from '../gswap/types';
import { TradingStrategy } from './strategies';
import { TradingLogger } from './logger';
import { PaperTradingManager } from './paper-trading';
import { LiveTradingStatsTracker } from './live-stats';
import { getTradingParams, SIGNAL_THRESHOLDS } from './config';
import { toast } from '../stores/toast';
import { paperTradingStats, tradingStats } from '../stores/trading';

export class TradingAgent {
  private client: GSwapSDKClient;
  private wallet: WalletManager;
  private strategy: TradingStrategy;
  private logger: TradingLogger;
  private config: TradingConfig;
  private paperManager: PaperTradingManager | null = null;
  private liveStatsTracker: LiveTradingStatsTracker;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private statsUpdateInterval?: NodeJS.Timeout;
  private currentTrades: Map<string, Trade> = new Map();
  private selectedPool: LiquidityPool | null = null;
  private hasExecutedTestTrade = false;

  constructor(
    client: GSwapSDKClient,
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
    this.liveStatsTracker = new LiveTradingStatsTracker();
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

    // Execute debug test trade if enabled
    const executeTestTrade = import.meta.env.VITE_EXECUTE_TEST_TRADE === 'true';
    if (executeTestTrade && !this.hasExecutedTestTrade && !this.config.paperTrading) {
      this.logger.logSystem('Executing $1 test trade for debugging...', 'warning');
      await this.executeTestTrade();
    }

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

      // Get wallet balances or paper trading balance
      let totalValue: number;
      if (this.config.paperTrading && this.paperManager) {
        // Use paper trading current balance
        const paperStats = this.paperManager.getStats();
        totalValue = paperStats.currentValue;
        this.logger.logSystem(`Paper trading balance: $${totalValue.toFixed(2)}`, 'info');
      } else {
        // Use real wallet balance
        const balances = await this.wallet.getBalances();
        totalValue = balances.reduce((sum, b) => sum + (b.value || 0), 0);
        this.logger.logSystem(`Live wallet balance: $${totalValue.toFixed(2)}`, 'info');
      }

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

      // Calculate trade size based on available balance
      const maxSize = totalValue * params.maxPositionSize;
      let tradeSize = Math.min(maxSize, signal.suggestedAmount || maxSize * 0.5);

      // For paper trading, check if we have enough balance
      if (this.config.paperTrading && this.paperManager) {
        const paperStats = this.paperManager.getStats();
        // Don't trade more than 90% of available balance to leave some for fees
        const maxTrade = paperStats.currentValue * 0.9;
        if (tradeSize > maxTrade) {
          tradeSize = maxTrade;
          this.logger.logSystem(`Trade size limited to available balance: $${tradeSize.toFixed(2)}`, 'warning');
        }
      }

      // Ensure minimum trade size
      const minTradeSize = 1; // $1 minimum
      if (tradeSize < minTradeSize) {
        this.logger.logSystem(`Trade size too small: $${tradeSize.toFixed(2)} < $${minTradeSize}`, 'warning');
        return;
      }

      // Determine tokens and check available balance first
      let tokenIn: string, tokenOut: string, amountIn: string;
      let availableTokenBalance: number;

      if (signal.action === 'buy') {
        // Buy tokenA with tokenB
        tokenIn = pool.tokenB.symbol;
        tokenOut = pool.tokenA.symbol;
      } else {
        // Sell tokenA for tokenB
        tokenIn = pool.tokenA.symbol;
        tokenOut = pool.tokenB.symbol;
      }

      // Get available balance for the input token
      if (this.config.paperTrading && this.paperManager) {
        availableTokenBalance = this.paperManager.getBalance(tokenIn);
        this.logger.logSystem(`[Paper Trading] ${tokenIn} balance: ${availableTokenBalance}`, 'info');
      } else {
        const balances = await this.wallet.getBalances();
        console.log('[TradingAgent] All wallet balances:', balances);
        const tokenBalance = balances.find(b => b.token === tokenIn || b.token === `${tokenIn} (GalaChain)`);
        availableTokenBalance = parseFloat(tokenBalance?.balance || '0');
        this.logger.logSystem(`[Live Trading] ${tokenIn} balance: ${availableTokenBalance} (from wallet)`, 'info');
        
        // Log all balances for debugging
        if (balances.length > 0) {
          balances.forEach(b => {
            console.log(`[TradingAgent] Token: ${b.token}, Balance: ${b.balance}, Value: ${b.value}`);
          });
        } else {
          console.log('[TradingAgent] No balances found in wallet!');
        }
      }

      // Calculate the maximum we can trade based on available token balance
      const tokenPrice = signal.action === 'buy' ? (pool.tokenB.price || 1) : (pool.tokenA.price || 1);
      const maxTradableValue = availableTokenBalance * tokenPrice * 0.95; // Keep 5% buffer for fees/slippage

      // Adjust trade size if it exceeds what we can actually trade
      if (tradeSize > maxTradableValue) {
        tradeSize = maxTradableValue;
        this.logger.logSystem(
          `Trade size adjusted to available ${tokenIn} balance: $${tradeSize.toFixed(2)}`,
          'info'
        );
      }

      // Now calculate the actual amount based on adjusted trade size
      amountIn = (tradeSize / tokenPrice).toFixed(6);

      // Log the calculation for debugging
      this.logger.logSystem(
        `Trade calculation: $${tradeSize.toFixed(2)} / $${tokenPrice.toFixed(4)} = ${amountIn} ${tokenIn}`,
        'info'
      );

      // Ensure amount is not too small after formatting
      if (parseFloat(amountIn) < 0.000001) {
        this.logger.logSystem(
          `Trade amount too small after calculation: ${amountIn} ${tokenIn}. Skipping trade.`,
          'warning'
        );
        return;
      }

      // Check if we have sufficient balance BEFORE attempting trade
      if (this.config.paperTrading && this.paperManager) {
        // Check paper trading balance
        const availableBalance = this.paperManager.getBalance(tokenIn);
        if (parseFloat(amountIn) > availableBalance) {
          this.logger.logSystem(
            `Insufficient ${tokenIn} balance for paper trade. Required: ${amountIn}, Available: ${availableBalance.toFixed(6)}`,
            'warning'
          );
          return;
        }
      } else {
        // Check live wallet balance
        const balances = await this.wallet.getBalances();
        
        // Debug: log all balances
        console.log('[TradingAgent] All wallet balances:', balances);
        
        // Find the balance - check both exact match and with (GalaChain) suffix
        const tokenInBalance = balances.find(b => 
          b.token === tokenIn || 
          b.token === `${tokenIn} (GalaChain)` ||
          b.token.replace(' (GalaChain)', '') === tokenIn
        );
        
        console.log(`[TradingAgent] Looking for ${tokenIn}, found:`, tokenInBalance);
        
        const availableBalance = parseFloat(tokenInBalance?.balance || '0');

        if (availableBalance < parseFloat(amountIn)) {
          this.logger.logSystem(
            `Insufficient ${tokenIn} balance. Required: ${amountIn}, Available: ${availableBalance.toFixed(6)}`,
            'warning'
          );
          return;
        }
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
        // Balance was already checked above, proceed with trade

        try {
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

          this.logger.logSystem(`Live trade executed on GalaChain: ${txHash}`, 'success');
          this.logger.logSystem(`View on GalaScan: https://galascan.gala.com/transaction/${txHash}`, 'info');
        } catch (swapError: any) {
          trade.status = 'failed';
          this.logger.logError(`Failed to execute swap: ${swapError.message}`, swapError);

          // Update the trade record with failure
          this.currentTrades.set(trade.id, trade);
          this.logger.logTrade(trade);
          return;
        }
      }

      // Update and log successful trade
      this.currentTrades.set(trade.id, trade);
      this.logger.logTrade(trade);

    } catch (error: any) {
      this.logger.logError(`Trade execution error: ${error.message || 'Unknown error'}`, error);

      // If we have a trade record, mark it as failed
      if (trade) {
        trade.status = 'failed';
        this.currentTrades.set(trade.id, trade);
        this.logger.logTrade(trade);
      }
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

  private async executeTestTrade() {
    if (!this.selectedPool) {
      this.logger.logError('Cannot execute test trade: No pool selected');
      return;
    }

    try {
      this.hasExecutedTestTrade = true;

      // Get current balances
      const balances = await this.wallet.getBalances();

      // For a BUY trade, we need a stable/base token (USDC, USDT, ETH, BNB)
      // We'll buy the other token in the pool
      let baseToken = null;
      let baseBalance = 0;
      let targetToken = null;

      // Determine which token is the base (stable/native) and which to buy
      const stableTokens = ['USDC', 'USDT', 'DAI', 'BUSD'];
      const nativeTokens = ['ETH', 'BNB', 'MATIC'];

      if (stableTokens.includes(this.selectedPool.tokenA.symbol) || nativeTokens.includes(this.selectedPool.tokenA.symbol)) {
        baseToken = this.selectedPool.tokenA.symbol;
        targetToken = this.selectedPool.tokenB.symbol;
      } else if (stableTokens.includes(this.selectedPool.tokenB.symbol) || nativeTokens.includes(this.selectedPool.tokenB.symbol)) {
        baseToken = this.selectedPool.tokenB.symbol;
        targetToken = this.selectedPool.tokenA.symbol;
      } else {
        // Default: use tokenB as base (usually the second token is stable/native)
        baseToken = this.selectedPool.tokenB.symbol;
        targetToken = this.selectedPool.tokenA.symbol;
      }

      // Check if we have balance for the base token
      const baseTokenBalance = balances.find(b => b.token === baseToken);
      if (!baseTokenBalance || !baseTokenBalance.value || baseTokenBalance.value < 1) {
        this.logger.logError(`Cannot execute test trade: Insufficient ${baseToken} balance`);
        return;
      }

      baseBalance = parseFloat(baseTokenBalance.balance);

      // Calculate $1 worth of the base token
      const baseTokenPrice = this.selectedPool.tokenA.symbol === baseToken ?
        (this.selectedPool.priceTokenA || 1) :
        (this.selectedPool.priceTokenB || 1);

      let testAmount = Math.min(1 / baseTokenPrice, baseBalance * 0.01); // Max 1% of balance or $1

      // Format to appropriate decimals (max 18 decimals for ETH/tokens)
      // Round to 6 decimal places to avoid precision issues
      testAmount = Math.floor(testAmount * 1000000) / 1000000;

      this.logger.logSystem(
        `Test trade: Buying ${targetToken} with ${testAmount.toFixed(6)} ${baseToken} (~$1)`,
        'info'
      );

      // Calculate expected output
      const reserveIn = baseToken === this.selectedPool.tokenA.symbol ?
        this.selectedPool.reserveA : this.selectedPool.reserveB;
      const reserveOut = baseToken === this.selectedPool.tokenA.symbol ?
        this.selectedPool.reserveB : this.selectedPool.reserveA;

      const amountOut = this.client.calculateAmountOut(
        testAmount.toFixed(6),
        reserveIn,
        reserveOut,
        this.selectedPool.fee
      );

      // Execute the test trade
      const trade: Trade = {
        id: this.generateTradeId() + '_test',
        timestamp: new Date(),
        poolId: this.selectedPool.id,
        tokenIn: baseToken,
        tokenOut: targetToken,
        amountIn: testAmount.toFixed(6),
        amountOut: amountOut,
        status: 'pending',
      };

      this.currentTrades.set(trade.id, trade);
      this.logger.logTrade(trade);

      try {
        const txHash = await this.client.executeSwap({
          poolId: this.selectedPool.id,
          tokenIn: baseToken,
          tokenOut: targetToken,
          amountIn: testAmount.toFixed(6),
          minAmountOut: (parseFloat(amountOut) * 0.95).toFixed(6), // 5% slippage
          slippage: 0.05,
        });

        trade.txHash = txHash;
        trade.status = 'success';
        trade.profit = this.calculateProfit(trade, this.selectedPool);
        this.logger.logSystem(`Test BUY trade executed successfully: ${txHash}`, 'success');
        this.logger.logSystem(`Bought ${amountOut} ${targetToken} for ${testAmount.toFixed(6)} ${baseToken}`, 'info');
      } catch (error: any) {
        trade.status = 'failed';
        this.logger.logError(`Test BUY trade failed: ${error.message}`, error);
      }

      this.currentTrades.set(trade.id, trade);
      this.logger.logTrade(trade);

    } catch (error: any) {
      this.logger.logError(`Failed to execute test trade: ${error.message}`, error);
    }
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