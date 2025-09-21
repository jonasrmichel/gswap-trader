import { writable, derived } from 'svelte/store';
import type { TradingConfig } from '../trading/config';
import type { LogEntry } from '../trading/logger';
import type { WalletConfig } from '../wallet/manager';
import type { LiquidityPool } from '../gswap/types';
import { DEFAULT_CONFIG } from '../trading/config';

export const tradingConfig = writable<TradingConfig>(DEFAULT_CONFIG);

export const walletConfig = writable<WalletConfig | null>(null);

export const isWalletConnected = writable(false);

export const walletAddress = writable<string | undefined>(undefined);

export const walletBalances = writable<any[]>([]);

export const tradingActive = writable(false);

export const tradingLogs = writable<LogEntry[]>([]);

export const tradingStats = writable({
  totalTrades: 0,
  successfulTrades: 0,
  failedTrades: 0,
  winRate: 0,
  totalSignals: 0,
  buySignals: 0,
  sellSignals: 0,
  avgSignalConfidence: 0,
});

export const liquidityPools = writable<LiquidityPool[]>([]);

export const selectedPool = writable<LiquidityPool | null>(null);

export const initialBalance = writable(500);

export const paperTradingStats = writable({
  initialBalance: 500,
  currentValue: 500,
  profitLoss: 0,
  profitLossPercent: 0,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  winRate: 0,
  avgProfit: 0,
  avgLoss: 0,
});