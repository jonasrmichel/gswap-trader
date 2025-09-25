<script lang="ts">
  import { initialBalance, tradingActive } from '$lib/stores/trading';

  let balanceInput = $initialBalance;
  let showEditModal = false;

  function updateBalance() {
    if (balanceInput > 0) {
      initialBalance.set(balanceInput);
      showEditModal = false;
    }
  }
</script>

<div class="bg-surface-default backdrop-blur-sm rounded-xl border border-border-subtle p-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-medium text-muted">Initial Balance</h3>
      <div class="text-2xl font-bold text-accent">
        ${$initialBalance.toLocaleString()}
      </div>
    </div>
    <button
      on:click={() => showEditModal = true}
      disabled={$tradingActive}
      class="px-3 py-1.5 text-sm bg-surface-hover border border-border-subtle rounded-lg transition-colors
        {$tradingActive ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-pressed'}"
    >
      {$tradingActive ? 'Locked' : 'Configure'}
    </button>
  </div>
</div>

{#if showEditModal}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center" style="z-index: 9999;">
    <div class="bg-card-dark border border-border-default p-6 rounded-xl shadow-2xl max-w-md w-full mx-4">
      <h2 class="text-xl font-bold mb-4 text-accent">Configure Initial Balance</h2>

      <div class="mb-4">
        <label class="block text-sm font-medium mb-2 text-muted" for="initial-balance-modal-input">Initial Trading Balance (USD)</label>
        <input
          type="number"
          bind:value={balanceInput}
          min="100"
          max="1000000"
          step="100"
          id="initial-balance-modal-input"
          class="w-full px-3 py-2 bg-card-darker rounded-lg border border-border-subtle text-foreground focus:border-accent focus:outline-none transition-colors"
        />
        <div class="mt-2 text-xs text-muted">
          This balance is used for paper trading and position sizing calculations.
        </div>
      </div>

      <div class="flex gap-3">
        <button
          on:click={() => showEditModal = false}
          class="flex-1 px-4 py-2 bg-card-darker border border-border-subtle rounded-lg text-muted hover:bg-surface-pressed hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          on:click={updateBalance}
          class="flex-1 px-4 py-2 bg-accent/20 text-accent border border-accent/40 rounded-lg hover:bg-accent/30 transition-colors"
        >
          Update
        </button>
      </div>
    </div>
  </div>
{/if}
