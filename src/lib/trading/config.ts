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
}

export const RISK_PROFILES: Record<RiskLevel, Partial<TradingParams>> = {
  safe: {
    maxPositionSize: 0.1, // 10% of balance
    stopLoss: 0.02, // 2% stop loss
    takeProfit: 0.03, // 3% take profit
    slippage: 0.005, // 0.5% slippage
  },
  balanced: {
    maxPositionSize: 0.25, // 25% of balance
    stopLoss: 0.05, // 5% stop loss
    takeProfit: 0.08, // 8% take profit
    slippage: 0.01, // 1% slippage
  },
  aggressive: {
    maxPositionSize: 0.5, // 50% of balance
    stopLoss: 0.1, // 10% stop loss
    takeProfit: 0.15, // 15% take profit
    slippage: 0.02, // 2% slippage
  },
};

export const STRATEGY_PROFILES: Record<StrategyType, any> = {
  trend: {
    name: 'Trend Following',
    description: 'Follows market momentum and trends',
    indicators: ['EMA', 'MACD', 'RSI'],
  },
  revert: {
    name: 'Mean Reversion',
    description: 'Trades against extreme price movements',
    indicators: ['BB', 'RSI', 'Stochastic'],
  },
  range: {
    name: 'Range Trading',
    description: 'Trades within established price ranges',
    indicators: ['Support/Resistance', 'ATR', 'Volume'],
  },
};

export const SPEED_INTERVALS: Record<TradingSpeed, number> = {
  fast: 60000, // 1 minute
  normal: 300000, // 5 minutes
  slow: 900000, // 15 minutes
};

export const SIGNAL_THRESHOLDS: Record<SignalConfidence, number> = {
  precise: 80, // >80% confidence
  normal: 60, // >60% confidence
  active: 40, // >40% confidence
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
  return {
    ...RISK_PROFILES[config.risk],
    checkInterval: SPEED_INTERVALS[config.speed],
    signalThreshold: SIGNAL_THRESHOLDS[config.signals],
  } as TradingParams;
}