<script lang="ts">
  import { walletStore, walletService, connectWallet, disconnectWallet } from '$lib/services/wallet';
  import { isWalletConnected, walletAddress, walletBalances, tradingActive } from '$lib/stores/trading';
  import { toast } from '$lib/stores/toast';
  import WalletModal from './WalletModal.svelte';

  let showModal = false;
  let selectedType: 'metamask' | 'private-key' = 'metamask';
  let privateKey: string = '';
  let error: string = '';
  let isConnecting = false;

  // Sync wallet store with trading store
  $: if ($walletStore.connected) {
    console.log('[WalletConnect] Syncing wallet store, balances:', $walletStore.balances);
    isWalletConnected.set(true);
    walletAddress.set($walletStore.address);
    walletBalances.set($walletStore.balances);
  } else {
    isWalletConnected.set(false);
    walletAddress.set(undefined);
    walletBalances.set([]);
  }

  async function handleConnect() {
    console.log('[WalletConnect] handleConnect called, selectedType:', selectedType, 'privateKey:', privateKey);
    error = '';
    isConnecting = true;

    try {
      if (selectedType === 'private-key' && !privateKey) {
        error = 'Please enter a private key';
        isConnecting = false;
        return;
      }

      // Store the current privateKey value to avoid any binding issues
      const currentPrivateKey = selectedType === 'private-key' ? privateKey : undefined;
      console.log('[WalletConnect] About to connect with privateKey:', currentPrivateKey);

      // The wallet service now handles disconnecting internally for MetaMask
      await connectWallet(selectedType, currentPrivateKey);

      // Small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));

      showModal = false;
      privateKey = '';
    } catch (err: any) {
      console.error('[WalletConnect] Connection error:', err);
      error = err.message || 'Failed to connect wallet';
    } finally {
      isConnecting = false;
    }
  }

  async function handleSwitchWallet() {
    // Clear any errors
    error = '';
    // Show modal for wallet selection
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
    console.log('[WalletConnect] Closing modal, resetting state');
    showModal = false;
    error = '';
    privateKey = '';
    selectedType = 'metamask';
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
      on:click={() => walletService.updateBalances()}
      class="px-3 py-1 bg-primary/20 text-primary border border-primary/40 rounded-lg hover:bg-primary/30 transition-colors"
      title="Refresh wallet balances"
    >
      Refresh
    </button>
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