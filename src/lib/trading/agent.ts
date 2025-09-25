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
import { paperTradingStats, tradingStats, liveTradingStats, initialBalance } from '../stores/trading';
import { get } from 'svelte/store';

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
  private liveInitialBalance: number = 0;  // Track initial balance for live trading
  private liveTotalSpent: number = 0;      // Track total amount spent in current session

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

    // Debug logging
    console.log('[TradingAgent] Starting agent...');
    console.log('[TradingAgent] Paper trading mode?', this.config.paperTrading);
    console.log('[TradingAgent] Wallet connected?', this.wallet.isConnected());
    console.log('[TradingAgent] Client connected?', this.client.isConnected());
    console.log('[TradingAgent] Selected pool?', this.selectedPool?.id);

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
        // Refresh balances before starting
        await this.wallet.refreshBalances();
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

        // Get the configured initial balance (trading limit)
        const configuredInitialBalance = get(initialBalance);
        
        // Use the minimum of wallet balance and configured initial balance
        const tradingLimit = Math.min(totalValue, configuredInitialBalance);
        
        // Initialize live trading stats with trading limit (not total wallet value)
        this.liveStatsTracker.reset(tradingLimit); // Reset stats for new session with trading limit
        this.liveStatsTracker.setInitialBalances(balances); // Store actual wallet balances for tracking
        liveTradingStats.set(this.liveStatsTracker.getStats());
        
        // Set the initial balance limit and reset spending counter
        this.liveInitialBalance = tradingLimit;
        this.liveTotalSpent = 0;
        
        this.logger.logSystem(`Wallet balance verified: $${totalValue.toFixed(2)}`, 'success');
        this.logger.logSystem(`Trading limit set to: $${this.liveInitialBalance.toFixed(2)} (configured: $${configuredInitialBalance}, wallet: $${totalValue.toFixed(2)})`, 'info');
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

    // Start stats update loop for live trading (every 30 seconds)
    if (!this.config.paperTrading) {
      this.statsUpdateInterval = setInterval(async () => {
        try {
          // Force refresh balances from blockchain
          await this.wallet.refreshBalances();
          const balances = await this.wallet.getBalances();
          this.liveStatsTracker.updateCurrentBalances(balances);
          liveTradingStats.set(this.liveStatsTracker.getStats());
          console.log('[TradingAgent] Periodic balance update completed');
        } catch (error) {
          console.error('Failed to update live trading stats:', error);
        }
      }, 30000); // Update every 30 seconds
    }

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
    
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = undefined;
    }

    this.isRunning = false;
    
    // Reset live trading counters
    this.liveTotalSpent = 0;
    
    this.logger.logSystem('Trading agent stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private async executeTradingCycle() {
    try {
      this.logger.logSystem('🔄 Starting trading cycle...', 'info');
      
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
      
      // Debug: Log signal details
      this.logger.logSystem(`📊 Signal: ${signal.action.toUpperCase()} with confidence ${(signal.confidence * 100).toFixed(1)}%`, 'info');

      // Check if signal meets threshold
      const threshold = SIGNAL_THRESHOLDS[this.config.signals];
      this.logger.logSystem(`📈 Threshold check: ${(signal.confidence * 100).toFixed(1)}% vs ${(threshold * 100).toFixed(1)}% required`, 'info');
      
      if (signal.confidence >= threshold && signal.action !== 'hold') {
        this.logger.logSystem(`✅ Signal meets threshold! Executing ${signal.action} trade...`, 'success');
        await this.executeSignal(signal, this.selectedPool, totalValue);
      } else {
        this.logger.logSystem(`⏸️ Signal below threshold or HOLD, skipping trade`, 'info');
      }
    } catch (error) {
      this.logger.logError('Trading cycle error', error);
    }
  }

  private async executeSignal(signal: any, pool: LiquidityPool, totalValue: number) {
    let tradeRef: Trade | null = null;

    try {
      this.logger.logSystem(`🎯 EXECUTING SIGNAL: ${signal.action} on ${pool.name || pool.id}`, 'success');
      console.log('[TradingAgent] executeSignal called with:', {
        signal,
        poolId: pool.id,
        totalValue,
        paperTrading: this.config.paperTrading
      });
      
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
      } else {
        // For live trading, respect the initial balance limit
        const remainingLimit = this.liveInitialBalance - this.liveTotalSpent;
        
        if (remainingLimit <= 0) {
          this.logger.logSystem(
            `Trading limit reached. Initial: $${this.liveInitialBalance.toFixed(2)}, Spent: $${this.liveTotalSpent.toFixed(2)}`,
            'warning'
          );
          return;
        }
        
        if (tradeSize > remainingLimit) {
          tradeSize = remainingLimit;
          this.logger.logSystem(
            `Trade size limited to remaining balance: $${tradeSize.toFixed(2)} (Remaining: $${remainingLimit.toFixed(2)})`,
            'warning'
          );
        }
        
        // Also check actual wallet balance
        const walletBalances = await this.wallet.getBalances();
        const totalWalletValue = walletBalances.reduce((sum, b) => sum + (b.value || 0), 0);
        const maxWalletTrade = totalWalletValue * 0.9; // Keep 10% reserve
        
        if (tradeSize > maxWalletTrade) {
          tradeSize = maxWalletTrade;
          this.logger.logSystem(
            `Trade size limited to wallet balance: $${tradeSize.toFixed(2)}`,
            'warning'
          );
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
        
        // If we don't have the input token, check if we have the output token and can reverse the trade
        if (availableTokenBalance === 0) {
          const oppositeToken = signal.action === 'buy' ? pool.tokenA.symbol : pool.tokenB.symbol;
          const oppositeBalance = balances.find(b => b.token === oppositeToken || b.token === `${oppositeToken} (GalaChain)`);
          const oppositeAvailable = parseFloat(oppositeBalance?.balance || '0');
          
          if (oppositeAvailable > 0) {
            // Reverse the trade direction
            this.logger.logSystem(`No ${tokenIn} available, but have ${oppositeAvailable} ${oppositeToken}. Reversing trade direction.`, 'info');
            signal.action = signal.action === 'buy' ? 'sell' : 'buy';
            
            // Recalculate tokens
            if (signal.action === 'buy') {
              tokenIn = pool.tokenB.symbol;
              tokenOut = pool.tokenA.symbol;
            } else {
              tokenIn = pool.tokenA.symbol;
              tokenOut = pool.tokenB.symbol;
            }
            
            // Update available balance
            availableTokenBalance = oppositeAvailable;
          }
        }
        
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
        // For live trading, check against session limit first
        const remainingLimit = this.liveInitialBalance - this.liveTotalSpent;
        if (remainingLimit <= 0.01) { // Less than 1 cent remaining
          this.logger.logSystem(`Trading limit reached for this session. Spent: $${this.liveTotalSpent.toFixed(2)} / $${this.liveInitialBalance.toFixed(2)}`, 'warning');
          return;
        }
        
        // Cap the trade amount to remaining limit
        const tokenPrice = signal.action === 'buy' ? (pool.priceTokenB || 1) : (pool.priceTokenA || 1);
        const tradeValue = parseFloat(amountIn) * tokenPrice;
        
        if (tradeValue > remainingLimit) {
          const cappedAmount = remainingLimit / tokenPrice;
          this.logger.logSystem(`Trade amount capped to remaining limit: ${cappedAmount.toFixed(6)} ${tokenIn} ($${remainingLimit.toFixed(2)})`, 'info');
          amountIn = cappedAmount.toString();
        }
        
        // Check live wallet balance
        const balances = await this.wallet.getBalances();
        
        // Debug: log all balances
        console.log('[TradingAgent] All wallet balances:', balances);
        console.log('[TradingAgent] Wallet balance count:', balances.length);
        balances.forEach(b => {
          console.log(`[TradingAgent]   - ${b.token}: ${b.balance} (value: $${b.value})`);
        });
        
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

      // Create trade record with price information
      const trade: Trade = {
        id: this.generateTradeId(),
        timestamp: new Date(),
        poolId: pool.id,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        priceIn: tokenIn === pool.tokenA.symbol ? pool.priceTokenA : pool.priceTokenB,
        priceOut: tokenOut === pool.tokenA.symbol ? pool.priceTokenA : pool.priceTokenB,
        fee: parseFloat(amountIn) * 0.01, // Assume 1% fee for now
        status: 'pending',
      };

      tradeRef = trade;

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
        this.logger.logSystem(`🚀 Executing LIVE trade on GalaChain...`, 'success');
        this.logger.logSystem(`  - Token In: ${tokenIn} (${amountIn})`, 'info');
        this.logger.logSystem(`  - Token Out: ${tokenOut} (expected: ${amountOut})`, 'info');
        
        // Debug: Log exact params being sent
        const swapParams = {
          poolId: pool.id,
          tokenIn,
          tokenOut,
          amountIn,
          minAmountOut: (parseFloat(amountOut) * (1 - params.slippage)).toString(),
          slippage: params.slippage,
        };
        console.log('[TradingAgent] Calling executeSwap with params:', swapParams);
        console.log('[TradingAgent] amountIn type:', typeof amountIn, 'value:', amountIn);
        console.log('[TradingAgent] Client connected?', this.client.isConnected());

        try {
          const txHash = await this.client.executeSwap(swapParams);

          trade.txHash = txHash;
          trade.status = 'success';
          trade.profit = this.calculateProfit(trade, pool);
          
          // Update live trading stats
          this.liveStatsTracker.addTrade(trade);
          
          // Fetch updated balances after trade to update stats
          // Wait a bit for blockchain to process
          setTimeout(async () => {
            try {
              this.logger.logSystem('🔄 Refreshing balances from blockchain...', 'info');
              
              // Force a fresh balance fetch from the blockchain
              await this.wallet.refreshBalances();
              
              // Now get the updated balances
              const balances = await this.wallet.getBalances();
              this.liveStatsTracker.updateCurrentBalances(balances);
              liveTradingStats.set(this.liveStatsTracker.getStats());
              this.logger.logSystem('📊 Trading statistics updated with new balances', 'success');
              
              // Log each balance
              for (const balance of balances) {
                if (parseFloat(balance.balance) > 0) {
                  this.logger.logSystem(`  ${balance.token}: ${balance.balance} ($${balance.value.toFixed(2)})`, 'info');
                }
              }
              
              // Log the updated stats
              const stats = this.liveStatsTracker.getStats();
              this.logger.logSystem(`💰 Current Balance: $${stats.totalValue.toFixed(2)}`, 'info');
              this.logger.logSystem(`📈 P&L: $${stats.profitLoss.toFixed(2)} (${stats.profitLossPercent.toFixed(2)}%)`, 
                stats.profitLoss >= 0 ? 'success' : 'warning');
            } catch (error) {
              console.error('Failed to update balances after trade:', error);
            }
          }, 15000); // Wait 15 seconds for blockchain confirmation
          
          liveTradingStats.set(this.liveStatsTracker.getStats());

          // Update spent amount for live trading limits
          // Determine the price of the input token
          const inputTokenPrice = trade.tokenIn === pool.tokenA.symbol 
            ? (pool.priceTokenA || pool.tokenA.price || 1)
            : (pool.priceTokenB || pool.tokenB.price || 1);
          const tradeValueIn = parseFloat(trade.amountIn) * inputTokenPrice;
          this.liveTotalSpent += tradeValueIn;
          this.logger.logSystem(`Total spent this session: $${this.liveTotalSpent.toFixed(2)} / $${this.liveInitialBalance.toFixed(2)}`, 'info');

          this.logger.logSystem(`✅ Live trade submitted to GalaChain!`, 'success');
          
          // Log transaction ID initially
          this.logger.logSystem(`📝 Transaction ID: ${txHash}`, 'info');
          this.logger.logSystem(`⏳ Waiting for blockchain confirmation...`, 'info');
          
          // Poll for the blockchain hash
          setTimeout(async () => {
            try {
              const blockchainHash = await this.client.getBlockchainHash(txHash, 600000);
              // Only show GalaScan link if we got a different hash (not the same as transaction ID)
              if (blockchainHash && blockchainHash !== txHash) {
                this.logger.logSystem(`✅ Trade confirmed on blockchain`, 'success');
                this.logger.logSystem(`📝 Blockchain Hash: ${blockchainHash}`, 'info');
                this.logger.logSystem(`🔗 View on GalaScan: https://galascan.gala.com/transaction/${blockchainHash}`, 'info');
                
                // Update the trade record with blockchain hash
                trade.blockchainHash = blockchainHash;
                this.currentTrades.set(trade.id, trade);
              } else {
                this.logger.logSystem(`⚠️ Could not get blockchain hash after 10 minutes (transaction may still be processing)`, 'warning');
                this.logger.logSystem(`📝 Track with transaction ID: ${txHash}`, 'info');
                this.logger.logSystem(`🔗 View on GalaScan: https://galascan.gala.com/transaction/${txHash}`, 'info');
              }
            } catch (error) {
              console.error('Failed to get blockchain hash:', error);
              this.logger.logSystem(`⚠️ Error getting blockchain hash, transaction ID: ${txHash}`, 'warning');
            }
          }, 5000); // Start polling after 5 seconds
        } catch (swapError: any) {
          trade.status = 'failed';
          this.logger.logError(`Failed to execute swap: ${swapError.message}`, swapError);

          // Update stats with failed trade
          this.liveStatsTracker.addTrade(trade);
          liveTradingStats.set(this.liveStatsTracker.getStats());

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
      if (tradeRef) {
        tradeRef.status = 'failed';
        this.currentTrades.set(tradeRef.id, tradeRef);
        this.logger.logTrade(tradeRef);
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

  getStats() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      trades: Array.from(this.currentTrades.values()),
      ...this.logger.getStats(),
    };
  }
}
