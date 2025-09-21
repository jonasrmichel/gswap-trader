<script lang="ts">
  import { tradingActive, isWalletConnected, tradingConfig } from '$lib/stores/trading';
  import type { TradingAgent } from '$lib/trading/agent';
  import type { TradingLogger } from '$lib/trading/logger';

  export let agent: TradingAgent | null;
  export let logger: TradingLogger;

  async function toggleTrading() {
    if (!agent) {
      logger.logError('Trading agent not initialized');
      return;
    }

    if ($tradingActive) {
      agent.stop();
      tradingActive.set(false);
      logger.logSystem('Trading stopped by user', 'warning');
    } else {
      try {
        await agent.start();
        tradingActive.set(true);
        logger.logSystem(
          `Trading started in ${$tradingConfig.paperTrading ? 'PAPER' : 'LIVE'} mode`,
          'success'
        );
      } catch (error: any) {
        logger.logError('Failed to start trading', error);
      }
    }
  }
</script>

<div class="bg-surface-default backdrop-blur-xl rounded-xl border border-border-subtle p-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-lg font-semibold">Trading Control</h2>
      <p class="text-sm text-muted mt-1">
        {#if !$isWalletConnected}
          Connect wallet to start trading
        {:else if $tradingActive}
          Agent is actively monitoring markets
        {:else}
          Agent is ready to trade
        {/if}
      </p>
    </div>

    <button
      on:click={toggleTrading}
      disabled={!$isWalletConnected}
      class="px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105
        {$tradingActive
          ? 'bg-destructive text-white hover:bg-destructive/90'
          : 'bg-accent text-white hover:bg-accent/90'}
        {!$isWalletConnected ? 'opacity-50 cursor-not-allowed' : ''}"
    >
      {$tradingActive ? 'Stop Trading' : 'Start Trading'}
    </button>
  </div>

  {#if $tradingActive}
    <div class="mt-4 flex items-center gap-4 text-sm">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 bg-success rounded-full animate-pulse"></div>
        <span class="text-muted">Monitoring {$tradingConfig.strategy} signals</span>
      </div>
      <div class="text-muted">
        Check interval: {$tradingConfig.speed === 'fast' ? '1m' : $tradingConfig.speed === 'normal' ? '5m' : '15m'}
      </div>
      <div class="text-muted">
        Risk: {$tradingConfig.risk}
      </div>
    </div>
  {/if}
</div>