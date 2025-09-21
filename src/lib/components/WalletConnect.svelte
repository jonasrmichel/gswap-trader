<script lang="ts">
  import { walletStore, connectWallet, disconnectWallet } from '$lib/services/wallet';
  import { isWalletConnected, walletAddress, walletBalances } from '$lib/stores/trading';
  import WalletModal from './WalletModal.svelte';

  let showModal = false;
  let selectedType: 'metamask' | 'private-key' = 'metamask';
  let privateKey = '';
  let error = '';
  let isConnecting = false;

  // Sync wallet store with trading store
  $: if ($walletStore.connected) {
    isWalletConnected.set(true);
    walletAddress.set($walletStore.address);
    walletBalances.set($walletStore.balances);
  } else {
    isWalletConnected.set(false);
    walletAddress.set(undefined);
    walletBalances.set([]);
  }

  async function handleConnect() {
    error = '';
    isConnecting = true;

    try {
      if (selectedType === 'private-key' && !privateKey) {
        error = 'Please enter a private key';
        isConnecting = false;
        return;
      }

      await connectWallet(selectedType, privateKey || undefined);
      showModal = false;
      privateKey = '';
    } catch (err: any) {
      error = err.message || 'Failed to connect wallet';
    } finally {
      isConnecting = false;
    }
  }

  async function disconnect() {
    await disconnectWallet();
  }

  function handleClose() {
    showModal = false;
    error = '';
    privateKey = '';
  }
</script>

{#if !$walletStore.connected}
  <button
    on:click={() => showModal = true}
    class="px-4 py-2 bg-accent/20 text-accent border border-accent/40 rounded-lg hover:bg-accent/30 transition-colors"
  >
    Connect Wallet
  </button>
{:else}
  <div class="flex items-center gap-2">
    <div class="px-3 py-1 bg-card-dark rounded-lg border border-border-subtle">
      <span class="text-xs text-muted">Connected:</span>
      <span class="ml-2 text-sm font-mono text-accent">{$walletStore.address?.slice(0, 6)}...{$walletStore.address?.slice(-4)}</span>
    </div>
    <button
      on:click={disconnect}
      class="px-3 py-1 bg-destructive/20 text-destructive border border-destructive/40 rounded-lg hover:bg-destructive/30 transition-colors"
    >
      Disconnect
    </button>
  </div>
{/if}

<WalletModal
  bind:show={showModal}
  bind:selectedType
  bind:privateKey
  bind:error
  bind:isConnecting
  onConnect={handleConnect}
  onClose={handleClose}
/>