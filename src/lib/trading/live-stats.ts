import type { Trade } from '../gswap/types';

export interface LiveTradingStats {
  initialBalance: number;
  currentBalance: number;
  totalValue: number;
  profitLoss: number;
  profitLossPercent: number;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  winRate: number;
  totalVolume: number;
  fees: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  avgTradeSize: number;
  avgProfit: number;
  avgLoss: number;
  winningTrades: number;
  losingTrades: number;
  lastUpdate: Date;
}

export class LiveTradingStatsTracker {
  private stats: LiveTradingStats;
  private trades: Trade[] = [];
  private startTime: Date;
  private initialBalances: Map<string, number> = new Map();
  private currentBalances: Map<string, number> = new Map();

  constructor(initialBalance: number = 0) {
    this.startTime = new Date();
    this.stats = this.createEmptyStats(initialBalance);
  }

  private createEmptyStats(initialBalance: number): LiveTradingStats {
    return {
      initialBalance,
      currentBalance: initialBalance,
      totalValue: initialBalance,
      profitLoss: 0,
      profitLossPercent: 0,
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      winRate: 0,
      totalVolume: 0,
      fees: 0,
      bestTrade: null,
      worstTrade: null,
      avgTradeSize: 0,
      avgProfit: 0,
      avgLoss: 0,
      winningTrades: 0,
      losingTrades: 0,
      lastUpdate: new Date()
    };
  }

  setInitialBalances(balances: Array<{token: string, balance: string, value: number}>) {
    this.initialBalances.clear();
    let totalValue = 0;
    
    for (const b of balances) {
      const amount = parseFloat(b.balance);
      this.initialBalances.set(b.token, amount);
      this.currentBalances.set(b.token, amount);
      totalValue += b.value || 0;
    }
    
    this.stats.initialBalance = totalValue;
    this.stats.currentBalance = totalValue;
    this.stats.totalValue = totalValue;
    this.stats.lastUpdate = new Date();
  }

  updateCurrentBalances(balances: Array<{token: string, balance: string, value: number}>) {
    this.currentBalances.clear();
    let totalValue = 0;
    
    for (const b of balances) {
      const amount = parseFloat(b.balance);
      this.currentBalances.set(b.token, amount);
      totalValue += b.value || 0;
    }
    
    this.stats.currentBalance = totalValue;
    this.stats.totalValue = totalValue;
    this.stats.profitLoss = totalValue - this.stats.initialBalance;
    this.stats.profitLossPercent = this.stats.initialBalance > 0 
      ? (this.stats.profitLoss / this.stats.initialBalance) * 100 
      : 0;
    this.stats.lastUpdate = new Date();
  }

  addTrade(trade: Trade) {
    this.trades.push(trade);
    this.stats.totalTrades++;
    
    if (trade.status === 'success') {
      this.stats.successfulTrades++;
      
      // Calculate trade P&L if prices are available
      if (trade.priceIn && trade.priceOut) {
        const valueIn = parseFloat(trade.amountIn) * trade.priceIn;
        const valueOut = parseFloat(trade.amountOut) * trade.priceOut;
        const profit = valueOut - valueIn - (trade.fee || 0);
        
        if (profit > 0) {
          this.stats.winningTrades++;
          this.stats.avgProfit = ((this.stats.avgProfit * (this.stats.winningTrades - 1)) + profit) / this.stats.winningTrades;
        } else {
          this.stats.losingTrades++;
          this.stats.avgLoss = ((this.stats.avgLoss * (this.stats.losingTrades - 1)) + Math.abs(profit)) / this.stats.losingTrades;
        }
        
        // Track best and worst trades
        if (!this.stats.bestTrade || profit > this.calculateTradeProfit(this.stats.bestTrade)) {
          this.stats.bestTrade = trade;
        }
        if (!this.stats.worstTrade || profit < this.calculateTradeProfit(this.stats.worstTrade)) {
          this.stats.worstTrade = trade;
        }
      }
      
      // Update volume
      const tradeVolume = parseFloat(trade.amountIn) * (trade.priceIn || 0);
      this.stats.totalVolume += tradeVolume;
      this.stats.avgTradeSize = this.stats.totalVolume / this.stats.successfulTrades;
      
      // Update fees
      this.stats.fees += trade.fee || 0;
    } else if (trade.status === 'failed') {
      this.stats.failedTrades++;
    }
    
    // Update win rate
    this.stats.winRate = this.stats.totalTrades > 0 
      ? (this.stats.successfulTrades / this.stats.totalTrades) * 100 
      : 0;
    
    this.stats.lastUpdate = new Date();
  }

  private calculateTradeProfit(trade: Trade): number {
    if (!trade.priceIn || !trade.priceOut) return 0;
    const valueIn = parseFloat(trade.amountIn) * trade.priceIn;
    const valueOut = parseFloat(trade.amountOut) * trade.priceOut;
    return valueOut - valueIn - (trade.fee || 0);
  }

  getStats(): LiveTradingStats {
    return { ...this.stats };
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  reset(initialBalance: number = 0) {
    this.trades = [];
    this.initialBalances.clear();
    this.currentBalances.clear();
    this.startTime = new Date();
    this.stats = this.createEmptyStats(initialBalance);
  }

  getSessionDuration(): number {
    return Date.now() - this.startTime.getTime();
  }

  getTradesPerHour(): number {
    const hours = this.getSessionDuration() / (1000 * 60 * 60);
    return hours > 0 ? this.stats.totalTrades / hours : 0;
  }
}