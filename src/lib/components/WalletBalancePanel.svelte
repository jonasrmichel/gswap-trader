<script lang="ts">
  import { walletStore, walletService } from '$lib/services/wallet';
  import { walletBalances } from '$lib/stores/trading';

  // Only show GalaChain balances
  // GalaChain tokens have G prefix (GUSDC, GWETH, GALA, etc)
  $: galaChainBalances = $walletBalances.filter(b => 
    b.token.startsWith('G') || b.token === 'GALA'
  );
  $: totalValue = galaChainBalances.reduce((sum, b) => sum + (b.value || 0), 0);
  $: hasBalances = galaChainBalances && galaChainBalances.length > 0;

  async function refreshBalances() {
    await walletService.updateBalances();
  }

  function formatBalance(balance: string): string {
    const num = parseFloat(balance || '0');
    if (num === 0) return '0';
    if (num < 0.000001) return '<0.000001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function getTokenDisplayName(token: string): string {
    // No longer need to remove suffix since we fixed that
    return token;
  }
</script>

{#if $walletStore.connected}
  <div class="bg-card-darker rounded-lg border border-border-subtle p-4">
    <div class="mb-3">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-accent">Wallet Balance</h3>
        <button
          on:click={refreshBalances}
          class="px-2 py-1 text-xs bg-primary/20 text-primary border border-primary/40 rounded hover:bg-primary/30 transition-colors"
        >
          Refresh
        </button>
      </div>
      <div class="flex items-center justify-end mt-1">
        <div class="text-xs text-muted">
          {$walletStore.address?.slice(0, 6)}...{$walletStore.address?.slice(-4)}
        </div>
      </div>
    </div>

    {#if hasBalances}
      <div class="space-y-3 overflow-y-auto" style="max-height: 280px;">
        <!-- GalaChain Balances Only -->
        <div>
          <div class="flex items-center gap-2 mb-2">
            <div class="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
            <span class="text-xs font-semibold text-accent uppercase tracking-wider">GalaChain Network</span>
          </div>
          <div class="space-y-2 pl-4 border-l-2 border-accent/20">
            {#each galaChainBalances as balance}
              <div class="flex items-center justify-between py-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-foreground">{getTokenDisplayName(balance.token)}</span>
                </div>
                <div class="text-right">
                  <div class="text-sm font-mono text-foreground">
                    {formatBalance(balance.balance)}
                  </div>
                  {#if balance.value && balance.value > 0}
                    <div class="text-xs text-muted">
                      ${balance.value.toFixed(2)}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        {#if totalValue > 0}
          <div class="pt-2 mt-2 border-t border-border-subtle">
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold text-foreground">Total Value</span>
              <span class="text-sm font-bold text-accent">
                ${totalValue.toFixed(2)}
              </span>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="text-center py-4">
        <p class="text-sm text-muted mb-2">No GalaChain balances detected</p>
        <p class="text-xs text-muted">Click "Refresh" to update</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Add any custom styles here if needed */
</style>