import { writable, derived } from 'svelte/store';
import type { PoolPriceHistory } from '../data/historical-prices';
import { getHistoricalData } from '../data/historical-prices';

// Store for pool historical data
function createPoolHistoryStore() {
  const { subscribe, set, update } = writable<PoolPriceHistory[]>([]);
  
  return {
    subscribe,
    async load() {
      try {
        const data = await getHistoricalData();
        set(data);
      } catch (error) {
        console.error('Failed to load historical data:', error);
        set([]);
      }
    },
    updatePool(poolId: string, history: PoolPriceHistory) {
      update(pools => {
        const index = pools.findIndex(p => p.poolId === poolId);
        if (index >= 0) {
          pools[index] = history;
        } else {
          pools.push(history);
        }
        return pools;
      });
    }
  };
}

export const poolHistory = createPoolHistoryStore();

// Derived store for quick lookup by poolId
export const poolHistoryMap = derived(
  poolHistory,
  $poolHistory => {
    const map = new Map<string, PoolPriceHistory>();
    $poolHistory.forEach(pool => {
      map.set(pool.poolId, pool);
    });
    return map;
  }
);