import type { LiquidityPool, MarketData } from '../gswap/types';
import type { TradingConfig, StrategyType, MarketBias } from './config';

export interface Signal {
  action: 'buy' | 'sell' | 'hold';
  confidence: number; // 0-100
  reason: string;
  poolId: string;
  suggestedAmount?: number;
}

export interface PriceHistory {
  timestamp: number;
  price: number;
  volume: number;
}

export class TradingStrategy {
  private config: TradingConfig;
  private priceHistory: Map<string, PriceHistory[]> = new Map();

  constructor(config: TradingConfig) {
    this.config = config;
  }

  updateConfig(config: TradingConfig) {
    this.config = config;
  }

  private calculatePoolPrice(pool: LiquidityPool): number {
    // Calculate price based on pool reserves and token prices
    if (pool.tokenA.price && pool.tokenB.price) {
      return pool.tokenA.price / pool.tokenB.price;
    }
    // Fallback to reserve ratio
    const reserveA = parseFloat(pool.reserveA.toString());
    const reserveB = parseFloat(pool.reserveB.toString());
    if (reserveA > 0 && reserveB > 0) {
      return reserveB / reserveA;
    }
    return 1;
  }

  addPriceData(poolId: string, price: number, volume: number) {
    if (!this.priceHistory.has(poolId)) {
      this.priceHistory.set(poolId, []);
    }

    const history = this.priceHistory.get(poolId)!;
    history.push({
      timestamp: Date.now(),
      price,
      volume,
    });

    // Keep last 100 data points
    if (history.length > 100) {
      history.shift();
    }
  }

  generateSignal(pool: LiquidityPool, marketData?: MarketData): Signal {
    let history = this.priceHistory.get(pool.id) || [];

    // If we don't have enough history, generate synthetic data based on current price
    if (history.length < 5) {
      const currentPrice = this.calculatePoolPrice(pool);
      // Generate synthetic historical data with some variation
      for (let i = 20; i > 0; i--) {
        const variation = 1 + (Math.random() - 0.5) * 0.02; // ±1% variation
        const syntheticPrice = currentPrice * variation;
        history.push({
          timestamp: new Date(Date.now() - i * 60000), // 1 minute intervals
          price: syntheticPrice,
          volume: parseFloat(pool.volume24h?.toString() || '1000') / 1440 // Daily volume / minutes
        });
      }
      this.priceHistory.set(pool.id, history);
    }

    if (history.length < 3) {
      return {
        action: 'hold',
        confidence: 0,
        reason: 'Initializing data',
        poolId: pool.id,
      };
    }

    let signal: Signal;

    switch (this.config.strategy) {
      case 'trend':
        signal = this.trendFollowingStrategy(pool, history);
        break;
      case 'revert':
        signal = this.meanReversionStrategy(pool, history);
        break;
      case 'range':
        signal = this.rangeStrategy(pool, history);
        break;
      default:
        signal = {
          action: 'hold',
          confidence: 0,
          reason: 'Unknown strategy',
          poolId: pool.id,
        };
    }

    // Apply market bias
    signal = this.applyMarketBias(signal);

    return signal;
  }

  private trendFollowingStrategy(pool: LiquidityPool, history: PriceHistory[]): Signal {
    const recentPrices = history.slice(-Math.min(20, history.length)).map(h => h.price);

    // Calculate simple moving averages
    const sma5 = this.calculateSMA(recentPrices.slice(-5));
    const sma10 = this.calculateSMA(recentPrices.slice(-10));
    const sma20 = this.calculateSMA(recentPrices);

    const currentPrice = recentPrices[recentPrices.length - 1];
    const momentum = this.calculateMomentum(recentPrices);

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reason = '';

    // Bullish signal: price > SMA5 > SMA10 > SMA20
    if (currentPrice > sma5 && sma5 > sma10 && sma10 > sma20) {
      action = 'buy';
      confidence = Math.min(80 + momentum * 10, 95);
      reason = 'Strong upward trend detected';
    }
    // Bearish signal: price < SMA5 < SMA10 < SMA20
    else if (currentPrice < sma5 && sma5 < sma10 && sma10 < sma20) {
      action = 'sell';
      confidence = Math.min(80 + Math.abs(momentum) * 10, 95);
      reason = 'Strong downward trend detected';
    }
    // Weak bullish
    else if (currentPrice > sma10 && momentum > 0.5) {
      action = 'buy';
      confidence = 60;
      reason = 'Moderate upward momentum';
    }
    // Weak bearish
    else if (currentPrice < sma10 && momentum < -0.5) {
      action = 'sell';
      confidence = 60;
      reason = 'Moderate downward momentum';
    }
    else {
      confidence = 30;
      reason = 'No clear trend';
    }

    return { action, confidence, reason, poolId: pool.id };
  }

  private meanReversionStrategy(pool: LiquidityPool, history: PriceHistory[]): Signal {
    const recentPrices = history.slice(-Math.min(20, history.length)).map(h => h.price);
    const mean = this.calculateSMA(recentPrices);
    const stdDev = this.calculateStandardDeviation(recentPrices, mean);
    const currentPrice = recentPrices[recentPrices.length - 1];

    const zscore = (currentPrice - mean) / stdDev;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reason = '';

    // Oversold - buy signal
    if (zscore < -2) {
      action = 'buy';
      confidence = Math.min(90, 70 + Math.abs(zscore) * 10);
      reason = 'Price significantly below mean - oversold';
    }
    // Overbought - sell signal
    else if (zscore > 2) {
      action = 'sell';
      confidence = Math.min(90, 70 + Math.abs(zscore) * 10);
      reason = 'Price significantly above mean - overbought';
    }
    // Mild oversold
    else if (zscore < -1) {
      action = 'buy';
      confidence = 50;
      reason = 'Price below mean';
    }
    // Mild overbought
    else if (zscore > 1) {
      action = 'sell';
      confidence = 50;
      reason = 'Price above mean';
    }
    else {
      confidence = 20;
      reason = 'Price near mean';
    }

    return { action, confidence, reason, poolId: pool.id };
  }

  private rangeStrategy(pool: LiquidityPool, history: PriceHistory[]): Signal {
    const recentPrices = history.slice(-Math.min(30, history.length)).map(h => h.price);
    const support = Math.min(...recentPrices) * 1.02; // 2% above min
    const resistance = Math.max(...recentPrices) * 0.98; // 2% below max
    const currentPrice = recentPrices[recentPrices.length - 1];
    const range = resistance - support;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reason = '';

    const positionInRange = (currentPrice - support) / range;

    // Near support - buy
    if (positionInRange < 0.2) {
      action = 'buy';
      confidence = 75;
      reason = 'Price near support level';
    }
    // Near resistance - sell
    else if (positionInRange > 0.8) {
      action = 'sell';
      confidence = 75;
      reason = 'Price near resistance level';
    }
    // Breaking support
    else if (currentPrice < support) {
      action = 'sell';
      confidence = 85;
      reason = 'Breaking below support - potential breakdown';
    }
    // Breaking resistance
    else if (currentPrice > resistance) {
      action = 'buy';
      confidence = 85;
      reason = 'Breaking above resistance - potential breakout';
    }
    else {
      confidence = 30;
      reason = 'Price within range';
    }

    return { action, confidence, reason, poolId: pool.id };
  }

  private applyMarketBias(signal: Signal): Signal {
    const biasMultiplier = {
      bullish: { buy: 1.2, sell: 0.8 },
      bearish: { buy: 0.8, sell: 1.2 },
      neutral: { buy: 1.0, sell: 1.0 },
    };

    const multiplier = biasMultiplier[this.config.bias];

    if (signal.action === 'buy') {
      signal.confidence *= multiplier.buy;
    } else if (signal.action === 'sell') {
      signal.confidence *= multiplier.sell;
    }

    signal.confidence = Math.min(100, Math.max(0, signal.confidence));

    if (this.config.bias !== 'neutral') {
      signal.reason += ` (${this.config.bias} bias applied)`;
    }

    return signal;
  }

  private calculateSMA(prices: number[]): number {
    if (prices.length === 0) return 0;
    return prices.reduce((sum, price) => sum + price, 0) / prices.length;
  }

  private calculateStandardDeviation(prices: number[], mean?: number): number {
    if (prices.length === 0) return 0;
    const avg = mean || this.calculateSMA(prices);
    const squareDiffs = prices.map(price => Math.pow(price - avg, 2));
    const avgSquareDiff = this.calculateSMA(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }

  private calculateMomentum(prices: number[]): number {
    if (prices.length < 2) return 0;
    const oldPrice = prices[0];
    const currentPrice = prices[prices.length - 1];
    return ((currentPrice - oldPrice) / oldPrice) * 100;
  }
}