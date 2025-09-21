<script lang="ts">
  import { liquidityPools } from '$lib/stores/trading';

  function formatNumber(num: number) {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toFixed(2);
  }
</script>

<div class="bg-surface-default backdrop-blur-xl rounded-xl border border-border-subtle p-6">
  <h2 class="text-lg font-semibold mb-4">Liquidity Pools</h2>

  <div class="space-y-3">
    {#if $liquidityPools.length === 0}
      <div class="text-center py-8 text-muted">
        Loading pools...
      </div>
    {/if}

    {#each $liquidityPools as pool}
      <div class="bg-surface-hover rounded-lg p-4 hover:bg-surface-pressed transition-colors">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="font-medium text-lg">{pool.id}</span>
            <span class="px-2 py-0.5 text-xs rounded-full bg-accent/20 text-accent">
              {(pool.fee * 100).toFixed(2)}% fee
            </span>
          </div>
          <div class="text-sm text-success">
            {pool.apy?.toFixed(1)}% APY
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div class="text-muted text-xs">TVL</div>
            <div class="font-medium">${formatNumber(pool.tvl || 0)}</div>
          </div>
          <div>
            <div class="text-muted text-xs">24h Volume</div>
            <div class="font-medium">${formatNumber(pool.volume24h || 0)}</div>
          </div>
          <div>
            <div class="text-muted text-xs">Reserves</div>
            <div class="font-mono text-xs">
              <div>{formatNumber(parseFloat(pool.reserveA))} {pool.tokenA.symbol}</div>
              <div>{formatNumber(parseFloat(pool.reserveB))} {pool.tokenB.symbol}</div>
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>