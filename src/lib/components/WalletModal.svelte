<script lang="ts">
  export let show = false;
  export let selectedType: 'metamask' | 'private-key' = 'metamask';
  export let privateKey = '';
  export let error = '';
  export let onConnect: () => void;
  export let onClose: () => void;
  export let isConnecting = false;
</script>

<!-- Render modal at body level to avoid z-index issues -->
{#if show}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="wallet-modal-overlay"
      on:click={onClose}>
      <div
        class="wallet-modal-content"
        on:click|stopPropagation>
        <h2 class="text-xl font-bold mb-4 text-accent">Connect Wallet</h2>

        <div class="space-y-3">
          <button
            on:click={() => selectedType = 'metamask'}
            class="w-full p-3 rounded-lg border {selectedType === 'metamask' ? 'border-accent bg-accent/30 shadow-lg' : 'border-border-subtle bg-card-darker'} hover:border-accent/50 hover:bg-surface-pressed transition-colors text-left"
          >
            <div class="font-semibold text-foreground">MetaMask</div>
            <div class="text-sm text-muted">Connect browser wallet</div>
          </button>

          <button
            on:click={() => selectedType = 'private-key'}
            class="w-full p-3 rounded-lg border {selectedType === 'private-key' ? 'border-accent bg-accent/30 shadow-lg' : 'border-border-subtle bg-card-darker'} hover:border-accent/50 hover:bg-surface-pressed transition-colors text-left"
          >
            <div class="font-semibold text-foreground">Private Key</div>
            <div class="text-sm text-muted">Import using private key</div>
          </button>
        </div>

        {#if selectedType === 'private-key'}
          <div class="mt-4">
            <label class="block text-sm font-medium mb-2 text-muted">Private Key</label>
            <input
              type="password"
              bind:value={privateKey}
              placeholder="Enter your private key"
              class="w-full px-3 py-2 bg-card-darker rounded-lg border border-border-subtle text-foreground placeholder-muted focus:border-accent focus:outline-none focus:bg-surface-solid transition-colors"
            />
          </div>
        {/if}

        {#if error}
          <div class="mt-3 p-2 bg-destructive/20 text-destructive border border-destructive/40 rounded-lg text-sm">
            {error}
          </div>
        {/if}

        <div class="flex gap-3 mt-6">
          <button
            on:click={onClose}
            class="flex-1 px-4 py-2 bg-card-darker border border-border-subtle rounded-lg text-muted hover:bg-surface-pressed hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            on:click={onConnect}
            disabled={isConnecting}
            class="flex-1 px-4 py-2 bg-accent/20 text-accent border border-accent/40 rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  {/if}

<style>
  :global(.wallet-modal-overlay) {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background-color: rgba(0, 0, 0, 0.8) !important;
    backdrop-filter: blur(8px) !important;
    z-index: 2147483646 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  :global(.wallet-modal-content) {
    position: relative !important;
    max-width: 28rem !important;
    width: 90% !important;
    margin: 0 auto !important;
    background-color: #18181b !important;
    border: 1px solid #27272a !important;
    border-radius: 0.75rem !important;
    padding: 1.5rem !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
    z-index: 2147483647 !important;
  }
</style>