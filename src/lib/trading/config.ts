export type RiskLevel = 'safe' | 'balanced' | 'aggressive';
export type StrategyType = 'trend' | 'revert' | 'range';
export type TradingSpeed = 'fast' | 'normal' | 'slow';
export type SignalConfidence = 'precise' | 'normal' | 'active';
export type MarketBias = 'bullish' | 'neutral' | 'bearish';

export interface TradingConfig {
  risk: RiskLevel;
  strategy: StrategyType;
  speed: TradingSpeed;
  signals: SignalConfidence;
  bias: MarketBias;
  paperTrading: boolean;
}

export interface TradingParams {
  maxPositionSize: number;
  stopLoss: number;
  takeProfit: number;
  checkInterval: number; // milliseconds
  signalThreshold: number; // percentage
  slippage: number;
  trailingStop?: boolean; // Enable trailing stop for aggressive trading
  trailingStopPositive?: number; // Trailing stop activation threshold
  minVolume?: number; // Minimum volume multiplier for entry
}

// Based on freqtrade and professional trading strategies
export const RISK_PROFILES: Record<RiskLevel, Partial<TradingParams>> = {
  safe: {
    maxPositionSize: 0.15, // 15% of balance (conservative like freqtrade conservative)
    stopLoss: 0.03, // 3% stop loss (tighter than freqtrade's 10% for safety)
    takeProfit: 0.02, // 2% take profit (similar to freqtrade minimal_roi)
    slippage: 0.003, // 0.3% slippage (standard DEX fee)
    trailingStop: false, // No trailing stop for conservative
    minVolume: 1.5, // Require 50% above average volume
  },
  balanced: {
    maxPositionSize: 0.30, // 30% of balance (moderate exposure)
    stopLoss: 0.05, // 5% stop loss (like ClucMay72018 strategy)
    takeProfit: 0.04, // 4% take profit (freqtrade sample strategy target)
    slippage: 0.005, // 0.5% slippage
    trailingStop: false, // Optional trailing stop
    minVolume: 1.2, // Require 20% above average volume
  },
  aggressive: {
    maxPositionSize: 0.60, // 60% of balance (high exposure but not all-in)
    stopLoss: 0.15, // 15% stop loss (between freqtrade's 10-25% aggressive)
    takeProfit: 0.10, // 10% take profit (like AggressiveGalaAgent)
    slippage: 0.01, // 1% slippage (accept higher slippage for quick entry)
    trailingStop: true, // Enable trailing stop like AggressiveGalaAgent
    trailingStopPositive: 0.05, // Lock profits after 5% gain
    minVolume: 1.0, // No volume requirement for aggressive
  },
};

export const STRATEGY_PROFILES: Record<StrategyType, any> = {
  trend: {
    name: 'Trend Following',
    description: 'Follows market momentum using SMA crossovers',
    indicators: ['SMA_20', 'SMA_50', 'SMA_200', 'Volume'],
    // Buy when price > SMA20 > SMA50 > SMA200 (uptrend)
    entryRSI: { min: 40, max: 65 }, // Enter on momentum, not extremes
    exitRSI: { min: 70, max: 100 }, // Exit on overbought
  },
  revert: {
    name: 'Mean Reversion',
    description: 'Trades against extreme price movements using Bollinger Bands',
    indicators: ['BB', 'RSI', 'Volume'],
    // Buy when price < lower BB and RSI < 30 (oversold)
    entryRSI: { min: 0, max: 30 }, // Enter on oversold
    exitRSI: { min: 50, max: 70 }, // Exit when normalized
  },
  range: {
    name: 'Range Trading',
    description: 'Trades within established support/resistance levels',
    indicators: ['Support/Resistance', 'RSI', 'Volume'],
    // Buy at support, sell at resistance
    entryRSI: { min: 30, max: 50 }, // Enter on mild oversold
    exitRSI: { min: 50, max: 70 }, // Exit on mild overbought
  },
};

// Based on freqtrade timeframes (1m aggressive, 5m standard, 1h conservative)
export const SPEED_INTERVALS: Record<TradingSpeed, number> = {
  fast: 60000, // 1 minute (aggressive scalping like AggressiveGalaAgent)
  normal: 300000, // 5 minutes (standard freqtrade timeframe)
  slow: 3600000, // 60 minutes (conservative like GalaConservative strategy)
};

// Confidence based on multiple indicator agreement
export const SIGNAL_THRESHOLDS: Record<SignalConfidence, number> = {
  precise: 75, // >75% confidence (3+ indicators agree strongly)
  normal: 50, // >50% confidence (2+ indicators agree)
  active: 30, // >30% confidence (1+ indicator signals)
};

export const DEFAULT_CONFIG: TradingConfig = {
  risk: 'balanced',
  strategy: 'trend',
  speed: 'normal',
  signals: 'normal',
  bias: 'neutral',
  paperTrading: true,
};

export function getTradingParams(config: TradingConfig): TradingParams {
  const baseParams = {
    ...RISK_PROFILES[config.risk],
    checkInterval: SPEED_INTERVALS[config.speed],
    signalThreshold: SIGNAL_THRESHOLDS[config.signals],
  };

  // Adjust parameters based on market bias
  if (config.bias === 'bullish') {
    baseParams.takeProfit = (baseParams.takeProfit || 0.04) * 1.2; // 20% higher targets in bull market
    baseParams.stopLoss = (baseParams.stopLoss || 0.05) * 0.8; // Tighter stops in bull market
  } else if (config.bias === 'bearish') {
    baseParams.takeProfit = (baseParams.takeProfit || 0.04) * 0.8; // Lower targets in bear market
    baseParams.stopLoss = (baseParams.stopLoss || 0.05) * 1.2; // Wider stops in bear market
  }

  return baseParams as TradingParams;
}