import { CoinGeckoService } from '../services/coingecko';

// Historical price data for pools (24 hours, hourly data)
export interface PricePoint {
  timestamp: Date;
  price: number;
  volume: number;
}

export interface PoolPriceHistory {
  poolId: string;
  tokenA: string;
  tokenB: string;
  priceHistory: PricePoint[];  // Price of tokenA in terms of tokenB
  volume24h: number;
  priceChange24h: number;
  high24h: number;
  low24h: number;
}

const coingecko = new CoinGeckoService();

// Generate realistic price movements with volatility
function generatePriceHistory(
  basePrice: number,
  volatility: number = 0.02,
  trend: 'up' | 'down' | 'sideways' = 'sideways',
  hours: number = 24
): PricePoint[] {
  const history: PricePoint[] = [];
  const now = new Date();
  
  let currentPrice = basePrice;
  const trendFactor = trend === 'up' ? 0.0005 : trend === 'down' ? -0.0005 : 0;
  
  // Generate hourly data points
  for (let i = hours; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
    
    // Add some randomness with volatility
    const randomChange = (Math.random() - 0.5) * volatility;
    currentPrice = currentPrice * (1 + randomChange + trendFactor);
    
    // Ensure price doesn't go negative
    currentPrice = Math.max(currentPrice * 0.5, currentPrice);
    
    // Generate volume (higher during active hours)
    const hour = timestamp.getHours();
    const isActiveHour = (hour >= 9 && hour <= 17); // 9 AM to 5 PM
    const baseVolume = isActiveHour ? 50000 : 20000;
    const volume = baseVolume * (1 + Math.random() * 0.5);
    
    history.push({
      timestamp,
      price: currentPrice,
      volume: Math.round(volume)
    });
  }
  
  return history;
}

// Calculate statistics from price history
function calculateStats(history: PricePoint[]) {
  if (history.length === 0) return { volume24h: 0, priceChange24h: 0, high24h: 0, low24h: 0 };
  
  const prices = history.map(p => p.price);
  const startPrice = history[0].price;
  const endPrice = history[history.length - 1].price;
  
  return {
    volume24h: history.reduce((sum, p) => sum + p.volume, 0),
    priceChange24h: ((endPrice - startPrice) / startPrice) * 100,
    high24h: Math.max(...prices),
    low24h: Math.min(...prices)
  };
}

// Fetch real historical data from CoinGecko
async function fetchRealHistoricalData(coinId: string): Promise<PricePoint[]> {
  try {
    // Fetch 24-hour chart data from CoinGecko
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=1`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch historical data');
    }
    
    const data = await response.json();
    const prices = data.prices || [];
    const volumes = data.total_volumes || [];
    
    // Convert to our format
    const history: PricePoint[] = prices.map((point: [number, number], index: number) => ({
      timestamp: new Date(point[0]),
      price: point[1],
      volume: volumes[index] ? volumes[index][1] : 0
    }));
    
    return history;
  } catch (error) {
    console.warn(`Failed to fetch real data for ${coinId}, using generated data:`, error);
    return [];
  }
}

// Generate historical data for all pools
export async function generatePoolHistoricalData(): Promise<PoolPriceHistory[]> {
  const pools: PoolPriceHistory[] = [];
  
  try {
    // Fetch real data from CoinGecko
    const [galaHistory, ethHistory] = await Promise.all([
      fetchRealHistoricalData('gala'),
      fetchRealHistoricalData('ethereum')
    ]);
    
    // If we got real data, use it
    if (galaHistory.length > 0 && ethHistory.length > 0) {
      // GALA/GWETH Pool - calculate GALA price in ETH
      const galaEthHistory = galaHistory.map((point, index) => {
        const ethPoint = ethHistory[Math.min(index, ethHistory.length - 1)];
        return {
          timestamp: point.timestamp,
          price: point.price / ethPoint.price, // GALA in ETH
          volume: point.volume
        };
      });
      const galaEthStats = calculateStats(galaEthHistory);
      pools.push({
        poolId: 'GALA-GWETH',
        tokenA: 'GALA',
        tokenB: 'GWETH',
        priceHistory: galaEthHistory,
        ...galaEthStats
      });
      
      // GALA/GUSDC Pool - GALA is already in USD
      const galaUsdcStats = calculateStats(galaHistory);
      pools.push({
        poolId: 'GALA-GUSDC',
        tokenA: 'GALA',
        tokenB: 'GUSDC',
        priceHistory: galaHistory,
        ...galaUsdcStats
      });
      
      // GALA/GUSDT Pool - same as USDC
      pools.push({
        poolId: 'GALA-GUSDT',
        tokenA: 'GALA',
        tokenB: 'GUSDT',
        priceHistory: galaHistory,
        ...galaUsdcStats
      });
      
      // GWETH/GUSDC Pool - ETH is already in USD
      const ethUsdcStats = calculateStats(ethHistory);
      pools.push({
        poolId: 'GWETH-GUSDC',
        tokenA: 'GWETH',
        tokenB: 'GUSDC',
        priceHistory: ethHistory,
        ...ethUsdcStats
      });
      
      // GWETH/GUSDT Pool - same as USDC
      pools.push({
        poolId: 'GWETH-GUSDT',
        tokenA: 'GWETH',
        tokenB: 'GUSDT',
        priceHistory: ethHistory,
        ...ethUsdcStats
      });
    } else {
      // Fallback to generated data
      console.log('Using generated historical data as fallback');
      
      // GALA/GWETH Pool
      const galaEthHistory = generatePriceHistory(0.000006, 0.025, 'up', 24);
      const galaEthStats = calculateStats(galaEthHistory);
      pools.push({
        poolId: 'GALA-GWETH',
        tokenA: 'GALA',
        tokenB: 'GWETH',
        priceHistory: galaEthHistory,
        ...galaEthStats
      });
      
      // GALA/GUSDC Pool
      const galaUsdcHistory = generatePriceHistory(0.02, 0.03, 'sideways', 24);
      const galaUsdcStats = calculateStats(galaUsdcHistory);
      pools.push({
        poolId: 'GALA-GUSDC',
        tokenA: 'GALA',
        tokenB: 'GUSDC',
        priceHistory: galaUsdcHistory,
        ...galaUsdcStats
      });
      
      // Other pools...
      const galaUsdtHistory = generatePriceHistory(0.02, 0.025, 'up', 24);
      pools.push({
        poolId: 'GALA-GUSDT',
        tokenA: 'GALA',
        tokenB: 'GUSDT',
        priceHistory: galaUsdtHistory,
        ...calculateStats(galaUsdtHistory)
      });
      
      const ethUsdcHistory = generatePriceHistory(3500, 0.015, 'up', 24);
      pools.push({
        poolId: 'GWETH-GUSDC',
        tokenA: 'GWETH',
        tokenB: 'GUSDC',
        priceHistory: ethUsdcHistory,
        ...calculateStats(ethUsdcHistory)
      });
      
      pools.push({
        poolId: 'GWETH-GUSDT',
        tokenA: 'GWETH',
        tokenB: 'GUSDT',
        priceHistory: ethUsdcHistory,
        ...calculateStats(ethUsdcHistory)
      });
    }
    
    // GUSDC/GUSDT Pool (Stablecoin) - always near 1.0
    const usdcUsdtHistory = generatePriceHistory(1.0, 0.001, 'sideways', 24);
    const usdcUsdtStats = calculateStats(usdcUsdtHistory);
    pools.push({
      poolId: 'GUSDC-GUSDT',
      tokenA: 'GUSDC',
      tokenB: 'GUSDT',
      priceHistory: usdcUsdtHistory,
      ...usdcUsdtStats
    });
    
  } catch (error) {
    console.error('Error generating pool historical data:', error);
  }
  
  return pools;
}

// Get price history for a specific pool
export async function getPoolPriceHistory(poolId: string): Promise<PoolPriceHistory | undefined> {
  const allHistory = await generatePoolHistoricalData();
  return allHistory.find(p => p.poolId === poolId);
}

// Export singleton instance with caching
let historicalDataCache: PoolPriceHistory[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getHistoricalData(): Promise<PoolPriceHistory[]> {
  const now = Date.now();
  
  // Return cached data if fresh
  if (historicalDataCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return historicalDataCache;
  }
  
  // Fetch fresh data
  historicalDataCache = await generatePoolHistoricalData();
  cacheTimestamp = now;
  return historicalDataCache;
}

// Add real-time price update (for live data)
export function updateLatestPrice(poolId: string, newPrice: number, volume: number = 0) {
  const history = getPoolPriceHistory(poolId);
  if (history) {
    history.priceHistory.push({
      timestamp: new Date(),
      price: newPrice,
      volume
    });
    
    // Keep only last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    history.priceHistory = history.priceHistory.filter(p => p.timestamp > oneDayAgo);
    
    // Recalculate stats
    const stats = calculateStats(history.priceHistory);
    Object.assign(history, stats);
  }
}