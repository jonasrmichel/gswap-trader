<script lang="ts">
  import { walletStore, connectWallet, disconnectWallet } from '$lib/services/wallet';
  import { isWalletConnected, walletAddress, walletBalances, tradingActive } from '$lib/stores/trading';
  import { toast } from '$lib/stores/toast';
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

      // Disconnect first if already connected to ensure fresh connection
      if ($walletStore.connected) {
        await disconnectWallet();
        // Small delay to ensure clean state
        await new Promise(resolve => setTimeout(resolve, 100));
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

  async function handleSwitchWallet() {
    showModal = true;
    selectedType = 'metamask';
  }

  async function disconnect() {
    if ($tradingActive) {
      toast.error('Cannot disconnect wallet while trading is active. Stop trading first.');
      return;
    }
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
    <div class="px-3 py-1 bg-surface-hover rounded-lg border border-border-subtle">
      <span class="text-xs text-muted">Connected:</span>
      <span class="ml-2 text-sm font-mono text-accent">{$walletStore.address?.slice(0, 6)}...{$walletStore.address?.slice(-4)}</span>
    </div>
    <button
      on:click={handleSwitchWallet}
      disabled={$tradingActive}
      class="px-3 py-1 bg-accent/20 text-accent border border-accent/40 rounded-lg transition-colors
        {$tradingActive ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent/30'}"
      title={$tradingActive ? 'Cannot switch wallet while trading' : 'Switch to a different wallet'}
    >
      Switch Wallet
    </button>
    <button
      on:click={disconnect}
      disabled={$tradingActive}
      class="px-3 py-1 bg-destructive/20 text-destructive border border-destructive/40 rounded-lg transition-colors
        {$tradingActive ? 'opacity-50 cursor-not-allowed' : 'hover:bg-destructive/30'}"
      title={$tradingActive ? 'Cannot disconnect while trading' : 'Disconnect wallet'}
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