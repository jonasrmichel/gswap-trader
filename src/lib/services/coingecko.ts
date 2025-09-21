export interface CoinGeckoPrice {
  symbol: string;
  price: number;
  change24h: number;
  changePerc24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: Date;
}

export interface CoinGeckoResponse {
  [key: string]: {
    usd: number;
    usd_market_cap: number;
    usd_24h_vol: number;
    usd_24h_change: number;
    last_updated_at: number;
  }
}

// GSwap token mapping to CoinGecko IDs
const tokenToCoinGeckoID: Record<string, string> = {
  'GALA': 'gala',
  'ETH': 'ethereum',
  'USDC': 'usd-coin',
  'USDT': 'tether',
  'BTC': 'bitcoin',
  'WETH': 'ethereum',
  'WBTC': 'wrapped-bitcoin',
  'DAI': 'dai',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'AAVE': 'aave',
  'MATIC': 'matic-network',
  'BNB': 'binancecoin',
  'WBNB': 'binancecoin',
  'SOL': 'solana',
  'AVAX': 'avalanche-2',
  'DOT': 'polkadot',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'SHIB': 'shiba-inu',
  'TOWN': 'town-star',
  'MATERIUM': 'materium',
  'SILK': 'spider-tanks',
  'GREEN': 'green-satoshi-token',
  'CUBE': 'somnium-space-cubes'
};

export class CoinGeckoService {
  private cache: Map<string, { data: CoinGeckoPrice; timestamp: number }> = new Map();
  private readonly cacheTimeout = 60000; // 60 seconds cache
  private lastFetchTime = 0;
  private readonly minInterval = 60000; // Rate limit: 1 request per minute

  async getPrices(symbols: string[]): Promise<Map<string, CoinGeckoPrice>> {
    const now = Date.now();
    const results = new Map<string, CoinGeckoPrice>();

    console.log('[CoinGecko] Fetching prices for:', symbols);

    // Check cache first
    const uncachedSymbols: string[] = [];
    for (const symbol of symbols) {
      const cached = this.cache.get(symbol);
      if (cached && now - cached.timestamp < this.cacheTimeout) {
        console.log(`[CoinGecko] Using cached price for ${symbol}: $${cached.data.price}`);
        results.set(symbol, cached.data);
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    // If all are cached, return early
    if (uncachedSymbols.length === 0) {
      console.log('[CoinGecko] All prices from cache');
      return results;
    }

    // Rate limiting
    if (now - this.lastFetchTime < this.minInterval) {
      console.log('[CoinGecko] Rate limited, returning cached data');
      // Return cached data if within rate limit window
      return results;
    }

    // Build CoinGecko IDs
    const coinGeckoIds: string[] = [];
    const symbolToId = new Map<string, string>();

    for (const symbol of uncachedSymbols) {
      const cleanSymbol = symbol.replace(/USDT|USD|USDC/, '').trim();
      const cgId = tokenToCoinGeckoID[cleanSymbol];
      if (cgId) {
        coinGeckoIds.push(cgId);
        symbolToId.set(symbol, cgId);
      }
    }

    if (coinGeckoIds.length === 0) {
      return results;
    }

    try {
      // Fetch from CoinGecko
      const ids = coinGeckoIds.join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;

      console.log('[CoinGecko] Fetching from API:', url);

      const response = await fetch(url);
      if (!response.ok) {
        console.error('[CoinGecko] API error:', response.status, response.statusText);
        return results;
      }

      const data: CoinGeckoResponse = await response.json();
      console.log('[CoinGecko] API response:', data);

      // Process results
      for (const [symbol, cgId] of symbolToId.entries()) {
        const priceData = data[cgId];
        if (priceData) {
          const price: CoinGeckoPrice = {
            symbol,
            price: priceData.usd || 0,
            change24h: priceData.usd_24h_change || 0,
            changePerc24h: priceData.usd ? ((priceData.usd_24h_change || 0) / priceData.usd) * 100 : 0,
            volume24h: priceData.usd_24h_vol || 0,
            marketCap: priceData.usd_market_cap || 0,
            lastUpdated: new Date((priceData.last_updated_at || Date.now() / 1000) * 1000)
          };

          console.log(`[CoinGecko] Got price for ${symbol}: $${price.price}`);

          // Update cache
          this.cache.set(symbol, { data: price, timestamp: now });
          results.set(symbol, price);
        } else {
          console.warn(`[CoinGecko] No price data for ${symbol} (${cgId})`);
        }
      }

      this.lastFetchTime = now;
      console.log(`[CoinGecko] Successfully fetched ${results.size} prices`);
    } catch (error) {
      console.error('[CoinGecko] Failed to fetch prices:', error);
    }

    return results;
  }

  async getPrice(symbol: string): Promise<CoinGeckoPrice | null> {
    const prices = await this.getPrices([symbol]);
    return prices.get(symbol) || null;
  }

  // Calculate swap price based on token prices
  calculateSwapPrice(tokenA: string, tokenB: string, priceA: number, priceB: number): number {
    if (priceA === 0 || priceB === 0) return 0;
    // Price of tokenA in terms of tokenB
    return priceA / priceB;
  }
}