<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { liquidityPools, selectedPool, tradingActive } from '$lib/stores/trading';
  import type { LiquidityPool } from '$lib/gswap/types';
  import { getGSwapClient, initializeGSwap } from '$lib/services/gswap';
  import type { GSwapSDKClient } from '$lib/gswap/gswap-sdk-client';

  let searchQuery = '';
  let filteredPools: LiquidityPool[] = [];
  let client: GSwapSDKClient | null = null;
  let priceUpdateInterval: number | null = null;
  let isLoadingPrices = false;
  let lastPriceUpdate: Date | null = null;

  $: filteredPools = $liquidityPools.filter(pool => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return pool.id.toLowerCase().includes(query) ||
           pool.name?.toLowerCase().includes(query) ||
           pool.tokenA.symbol.toLowerCase().includes(query) ||
           pool.tokenB.symbol.toLowerCase().includes(query);
  });

  function formatNumber(num: number) {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toFixed(2);
  }

  function selectPool(pool: LiquidityPool) {
    // Don't allow pool selection changes during active trading
    if (!$tradingActive) {
      selectedPool.set(pool);
    }
  }

  function calculateSwapPrice(pool: LiquidityPool): number {
    // Calculate the price of tokenA in terms of tokenB
    const reserveA = parseFloat(pool.reserveA) || 1;
    const reserveB = parseFloat(pool.reserveB) || 1;
    return reserveB / reserveA;
  }

  async function updatePools() {
    if (client) {
      isLoadingPrices = true;
      try {
        console.log('[PoolList] Fetching pools from GSwap client...');
        const pools = await client.getPools();
        console.log('[PoolList] Received pools:', pools);
        liquidityPools.set(pools);
        lastPriceUpdate = new Date();
      } catch (error) {
        console.error('[PoolList] Failed to update pools:', error);
      } finally {
        isLoadingPrices = false;
      }
    } else {
      console.warn('[PoolList] No client available to fetch pools');
    }
  }

  onMount(async () => {
    // Use shared GSwap SDK client instance
    client = getGSwapClient();
    
    // Initialize GSwap with current wallet state
    await initializeGSwap();

    // Try to update pools
    await updatePools();

    // Update prices every 60 seconds
    priceUpdateInterval = window.setInterval(() => {
      updatePools();
    }, 60000);
  });

  onDestroy(() => {
    if (priceUpdateInterval) {
      clearInterval(priceUpdateInterval);
    }
  });
</script>

<div class="bg-surface-default backdrop-blur-xl rounded-xl border border-border-subtle p-6">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-semibold">Liquidity Pools</h2>
    <div class="flex items-center gap-3">
      {#if isLoadingPrices}
        <div class="text-xs text-accent animate-pulse">
          🔄 Fetching live prices...
        </div>
      {:else if lastPriceUpdate}
        <div class="text-xs text-muted">
          GalaChain Pools via GSwap
        </div>
      {/if}
      {#if $tradingActive}
        <div class="text-xs text-warning bg-warning/10 px-2 py-1 rounded-full border border-warning/30">
          🔒 Locked during trading
        </div>
      {/if}
      {#if $selectedPool}
        <div class="text-sm text-accent">
          Selected: {$selectedPool.name || $selectedPool.id}
        </div>
      {/if}
    </div>
  </div>

  <!-- Search Input -->
  <div class="mb-4">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search pools by token or pair..."
      disabled={$tradingActive}
      class="w-full px-3 py-2 bg-surface-hover border border-border-subtle rounded-lg text-foreground placeholder-muted focus:border-accent focus:outline-none transition-colors {$tradingActive ? 'opacity-50 cursor-not-allowed' : ''}"
    />
  </div>

  <div class="space-y-3 max-h-96 overflow-y-auto">
    {#if filteredPools.length === 0}
      <div class="text-center py-8 text-muted">
        {searchQuery ? 'No pools found matching your search' : 'Loading pools...'}
      </div>
    {/if}

    {#each filteredPools as pool}
      <button
        on:click={() => selectPool(pool)}
        disabled={$tradingActive}
        class="w-full text-left bg-surface-hover rounded-lg p-4 transition-colors border-2
          {$selectedPool?.id === pool.id ? 'border-accent bg-accent/10' : 'border-transparent'}
          {$tradingActive ? 'opacity-60 cursor-not-allowed' : 'hover:bg-surface-pressed cursor-pointer'}">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="font-medium text-lg">{pool.id}</span>
            <span class="px-2 py-0.5 text-xs rounded-full bg-accent/20 text-accent">
              {(pool.fee * 100).toFixed(2)}% fee
            </span>
            {#if pool.tvl > 1000000}
              <span class="px-2 py-0.5 text-xs rounded-full bg-success/20 text-success">
                High Liquidity
              </span>
            {/if}
          </div>
          <div class="flex items-center gap-3">
            <div class="text-sm">
              {#if pool.priceTokenA && pool.priceTokenB}
                <div class="flex items-center gap-2">
                  <span class="text-muted">{pool.tokenA.symbol}:</span>
                  <span class="text-foreground font-medium">${pool.priceTokenA.toFixed(pool.priceTokenA < 0.01 ? 5 : 2)}</span>
                  <span class="text-muted mx-1">|</span>
                  <span class="text-muted">{pool.tokenB.symbol}:</span>
                  <span class="text-foreground font-medium">${pool.priceTokenB.toFixed(pool.priceTokenB < 0.01 ? 5 : 2)}</span>
                  <span class="text-xs text-success ml-2">LIVE</span>
                </div>
              {:else}
                <span class="text-muted">Swap: </span>
                <span class="text-foreground font-medium">1 {pool.tokenA.symbol} = {calculateSwapPrice(pool).toFixed(4)} {pool.tokenB.symbol}</span>
              {/if}
            </div>
            <div class="text-sm text-success">
              {pool.apy?.toFixed(1)}% APY
            </div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div class="text-muted text-xs">TVL</div>
            <div class="font-medium">${formatNumber(pool.tvl || 0)}</div>
            {#if pool.lastUpdated}
              <div class="text-xs text-success mt-0.5">Live</div>
            {/if}
          </div>
          <div>
            <div class="text-muted text-xs">24h Volume</div>
            <div class="font-medium">${formatNumber(pool.volume24h || 0)}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Reserves</div>
            <div class="font-mono text-xs">
              <div>
                {formatNumber(parseFloat(pool.reserveA))} {pool.tokenA.symbol}
                {#if pool.priceTokenA}
                  <span class="text-muted ml-1">
                    (${formatNumber(parseFloat(pool.reserveA) * pool.priceTokenA)})
                  </span>
                {/if}
              </div>
              <div>
                {formatNumber(parseFloat(pool.reserveB))} {pool.tokenB.symbol}
                {#if pool.priceTokenB}
                  <span class="text-muted ml-1">
                    (${formatNumber(parseFloat(pool.reserveB) * pool.priceTokenB)})
                  </span>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </button>
    {/each}
  </div>
</div>