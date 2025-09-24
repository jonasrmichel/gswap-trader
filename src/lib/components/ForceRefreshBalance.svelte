<script lang="ts">
  import { walletService } from '$lib/services/wallet';
  import { toast } from '$lib/stores/toast';
  
  let isRefreshing = false;
  
  async function forceRefreshBalance() {
    isRefreshing = true;
    try {
      console.log('[ForceRefreshBalance] Starting balance refresh...');
      await walletService.updateBalances();
      
      // Wait a bit for the balances to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force a second update to ensure we get the latest
      await walletService.updateBalances();
      
      toast.success('Wallet balances refreshed');
      console.log('[ForceRefreshBalance] Balance refresh completed');
    } catch (error) {
      console.error('[ForceRefreshBalance] Failed to refresh balances:', error);
      toast.error('Failed to refresh balances');
    } finally {
      isRefreshing = false;
    }
  }
</script>

<button
  on:click={forceRefreshBalance}
  disabled={isRefreshing}
  class="px-4 py-2 bg-warning/20 text-warning border border-warning/40 rounded-lg hover:bg-warning/30 transition-colors disabled:opacity-50"
  title="Force refresh wallet balances from GalaChain"
>
  {#if isRefreshing}
    Refreshing...
  {:else}
    🔄 Force Refresh Balances
  {/if}
</button>