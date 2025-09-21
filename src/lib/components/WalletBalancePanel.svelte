<script lang="ts">
  import { walletStore, walletService } from '$lib/services/wallet';
  import { walletBalances } from '$lib/stores/trading';

  $: totalValue = $walletBalances.reduce((sum, b) => sum + (b.value || 0), 0);
  $: hasBalances = $walletBalances && $walletBalances.length > 0;

  $: networkName = (() => {
    if (!$walletStore.chainId) return 'Unknown';
    switch($walletStore.chainId) {
      case 1: return 'Ethereum';
      case 56: return 'BSC';
      case 137: return 'Polygon';
      case 42161: return 'Arbitrum';
      default: return `Chain ${$walletStore.chainId}`;
    }
  })();

  async function refreshBalances() {
    await walletService.updateBalances();
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
      <div class="flex items-center justify-between mt-1">
        <div class="text-xs text-muted">
          Network: <span class="text-foreground">{networkName}</span>
        </div>
        <div class="text-xs text-muted">
          {$walletStore.address?.slice(0, 6)}...{$walletStore.address?.slice(-4)}
        </div>
      </div>
    </div>

    {#if hasBalances}
      <div class="space-y-2">
        {#each $walletBalances as balance}
          <div class="flex items-center justify-between py-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-foreground">{balance.token}</span>
            </div>
            <div class="text-right">
              <div class="text-sm font-mono text-foreground">
                {parseFloat(balance.balance || '0').toFixed(6)}
              </div>
              {#if balance.value}
                <div class="text-xs text-muted">
                  ${balance.value.toFixed(2)}
                </div>
              {/if}
            </div>
          </div>
        {/each}

        <div class="pt-2 mt-2 border-t border-border-subtle">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-foreground">Total Value</span>
            <span class="text-sm font-bold text-accent">
              ${totalValue.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    {:else}
      <div class="text-center py-4">
        <p class="text-sm text-muted mb-2">No balances detected</p>
        <p class="text-xs text-muted">Click "Refresh" to update</p>
        <div class="text-xs text-muted mt-2">
          Chain ID: {$walletStore.chainId || 'Unknown'}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Add any custom styles here if needed */
</style>