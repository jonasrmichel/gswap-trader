<script lang="ts">
  import { walletConfig, isWalletConnected, walletAddress, walletBalances } from '$lib/stores/trading';
  import type { WalletType } from '$lib/wallet/manager';

  let showModal = false;
  let selectedType: WalletType = 'demo';
  let privateKey = '';
  let error = '';

  async function connectWallet() {
    error = '';
    try {
      if (selectedType === 'private-key' && !privateKey) {
        error = 'Please enter a private key';
        return;
      }

      const config = {
        type: selectedType,
        privateKey: selectedType === 'private-key' ? privateKey : undefined,
      };

      // Simulated connection
      const address = selectedType === 'demo'
        ? '0xDemo' + Math.random().toString(16).substring(2, 10)
        : privateKey.substring(0, 10) + '...';

      walletConfig.set(config);
      walletAddress.set(address);
      isWalletConnected.set(true);

      // Set demo balances
      walletBalances.set([
        { token: 'BNB', balance: '1.5', value: 450 },
        { token: 'GALA', balance: '10000', value: 500 },
        { token: 'USDC', balance: '1000', value: 1000 },
      ]);

      showModal = false;
      privateKey = '';
    } catch (err: any) {
      error = err.message || 'Failed to connect wallet';
    }
  }

  function disconnect() {
    walletConfig.set(null);
    walletAddress.set(undefined);
    isWalletConnected.set(false);
    walletBalances.set([]);
  }
</script>

{#if !$isWalletConnected}
  <button
    on:click={() => showModal = true}
    class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
  >
    Connect Wallet
  </button>
{:else}
  <div class="flex items-center gap-2">
    <div class="px-3 py-1 bg-card rounded-lg border border-border">
      <span class="text-xs text-muted-foreground">Connected:</span>
      <span class="ml-2 text-sm font-mono">{$walletAddress}</span>
    </div>
    <button
      on:click={disconnect}
      class="px-3 py-1 bg-destructive/10 text-destructive rounded hover:bg-destructive/20 transition-colors"
    >
      Disconnect
    </button>
  </div>
{/if}

{#if showModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-card p-6 rounded-xl border border-border max-w-md w-full mx-4">
      <h2 class="text-xl font-bold mb-4">Connect Wallet</h2>

      <div class="space-y-3">
        <button
          on:click={() => selectedType = 'demo'}
          class="w-full p-3 rounded-lg border {selectedType === 'demo' ? 'border-primary bg-primary/10' : 'border-border'} hover:border-primary/50 transition-colors text-left"
        >
          <div class="font-semibold">Demo Wallet</div>
          <div class="text-sm text-muted-foreground">Start with simulated funds</div>
        </button>

        <button
          on:click={() => selectedType = 'private-key'}
          class="w-full p-3 rounded-lg border {selectedType === 'private-key' ? 'border-primary bg-primary/10' : 'border-border'} hover:border-primary/50 transition-colors text-left"
        >
          <div class="font-semibold">Private Key</div>
          <div class="text-sm text-muted-foreground">Import using private key</div>
        </button>

        <button
          on:click={() => selectedType = 'metamask'}
          class="w-full p-3 rounded-lg border {selectedType === 'metamask' ? 'border-primary bg-primary/10' : 'border-border'} hover:border-primary/50 transition-colors text-left"
        >
          <div class="font-semibold">MetaMask</div>
          <div class="text-sm text-muted-foreground">Connect browser wallet</div>
        </button>
      </div>

      {#if selectedType === 'private-key'}
        <div class="mt-4">
          <label class="block text-sm font-medium mb-2">Private Key</label>
          <input
            type="password"
            bind:value={privateKey}
            placeholder="Enter your private key"
            class="w-full px-3 py-2 bg-secondary rounded-lg border border-border focus:border-primary focus:outline-none"
          />
        </div>
      {/if}

      {#if error}
        <div class="mt-3 p-2 bg-destructive/10 text-destructive rounded text-sm">
          {error}
        </div>
      {/if}

      <div class="flex gap-3 mt-6">
        <button
          on:click={() => { showModal = false; error = ''; privateKey = ''; }}
          class="flex-1 px-4 py-2 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
        >
          Cancel
        </button>
        <button
          on:click={connectWallet}
          class="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Connect
        </button>
      </div>
    </div>
  </div>
{/if}