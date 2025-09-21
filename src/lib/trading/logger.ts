import type { Signal } from './strategies';
import type { Trade } from '../gswap/types';

export type LogLevel = 'info' | 'warning' | 'error' | 'success';
export type LogType = 'signal' | 'trade' | 'system' | 'wallet';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  type: LogType;
  message: string;
  details?: any;
}

export interface TradeLog extends LogEntry {
  type: 'trade';
  details: Trade;
}

export interface SignalLog extends LogEntry {
  type: 'signal';
  details: Signal;
}

export class TradingLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private listeners: Set<(log: LogEntry) => void> = new Set();

  addLog(level: LogLevel, type: LogType, message: string, details?: any): LogEntry {
    const log: LogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      level,
      type,
      message,
      details,
    };

    this.logs.unshift(log); // Add to beginning

    // Keep only maxLogs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(log));

    return log;
  }

  logSignal(signal: Signal): SignalLog {
    const level: LogLevel = signal.confidence >= 70 ? 'success' :
                            signal.confidence >= 50 ? 'info' : 'warning';

    const message = `${signal.action.toUpperCase()} signal for ${signal.poolId} ` +
                   `(${signal.confidence.toFixed(1)}% confidence)`;

    return this.addLog(level, 'signal', message, signal) as SignalLog;
  }

  logTrade(trade: Trade): TradeLog {
    const level: LogLevel = trade.status === 'success' ? 'success' :
                            trade.status === 'failed' ? 'error' : 'info';

    const message = `Trade ${trade.status}: ${trade.amountIn} ${trade.tokenIn} → ` +
                   `${trade.amountOut} ${trade.tokenOut}`;

    return this.addLog(level, 'trade', message, trade) as TradeLog;
  }

  logSystem(message: string, level: LogLevel = 'info') {
    return this.addLog(level, 'system', message);
  }

  logWallet(message: string, details?: any) {
    return this.addLog('info', 'wallet', message, details);
  }

  logError(message: string, error?: any) {
    return this.addLog('error', 'system', message, error);
  }

  getLogs(filter?: { type?: LogType; level?: LogLevel; limit?: number }): LogEntry[] {
    let filtered = this.logs;

    if (filter?.type) {
      filtered = filtered.filter(log => log.type === filter.type);
    }

    if (filter?.level) {
      filtered = filtered.filter(log => log.level === filter.level);
    }

    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  getRecentSignals(limit = 10): SignalLog[] {
    return this.getLogs({ type: 'signal', limit }) as SignalLog[];
  }

  getRecentTrades(limit = 10): TradeLog[] {
    return this.getLogs({ type: 'trade', limit }) as TradeLog[];
  }

  clearLogs() {
    this.logs = [];
  }

  subscribe(listener: (log: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStats() {
    const trades = this.getLogs({ type: 'trade' }) as TradeLog[];
    const signals = this.getLogs({ type: 'signal' }) as SignalLog[];

    const successfulTrades = trades.filter(t => t.details.status === 'success');
    const failedTrades = trades.filter(t => t.details.status === 'failed');

    const buySignals = signals.filter(s => s.details.action === 'buy');
    const sellSignals = signals.filter(s => s.details.action === 'sell');

    return {
      totalTrades: trades.length,
      successfulTrades: successfulTrades.length,
      failedTrades: failedTrades.length,
      winRate: trades.length > 0 ? (successfulTrades.length / trades.length) * 100 : 0,
      totalSignals: signals.length,
      buySignals: buySignals.length,
      sellSignals: sellSignals.length,
      avgSignalConfidence: signals.length > 0 ?
        signals.reduce((sum, s) => sum + s.details.confidence, 0) / signals.length : 0,
    };
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}