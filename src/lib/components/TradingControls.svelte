<script lang="ts">
  import { tradingActive, isWalletConnected, tradingConfig, walletBalances, initialBalance } from '$lib/stores/trading';
  import { toast } from '$lib/stores/toast';
  import { walletService } from '$lib/services/wallet';
  import type { TradingAgent } from '$lib/trading/agent';
  import type { TradingLogger } from '$lib/trading/logger';

  export let agent: TradingAgent | null;
  export let logger: TradingLogger;

  // Development mode flag - set to true to bypass balance check
  const DEV_MODE_BYPASS_BALANCE_CHECK = true; // TEMPORARILY ENABLED FOR TESTING

  async function toggleTrading() {
    if (!agent) {
      logger.logError('Trading agent not initialized');
      toast.error('Trading agent not initialized. Please refresh the page.');
      return;
    }

    if ($tradingActive) {
      agent.stop();
      tradingActive.set(false);
      logger.logSystem('Trading stopped by user', 'warning');
      toast.warning('Trading stopped');
    } else {
      // Check wallet balance for live trading
      if (!$tradingConfig.paperTrading) {
        console.log('[TradingControls] Checking wallet balances:', $walletBalances);

        // If balances haven't been fetched yet, try to fetch them
        if (!$walletBalances || $walletBalances.length === 0) {
          logger.logSystem('Fetching wallet balances...', 'info');
          toast.info('Fetching wallet balances, please wait...');

          // Try to update balances
          await walletService.updateBalances();

          // Wait a bit for the store to update
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Re-check balances after fetch
          console.log('[TradingControls] Balances after fetch:', $walletBalances);
        }

        // Check if wallet has any balance
        const currentBalances = $walletBalances || [];
        console.log('[TradingControls] Current balances array:', currentBalances);

        const hasBalance = currentBalances.length > 0 &&
          currentBalances.some(b => {
            const balance = parseFloat(b.balance || '0');
            console.log(`[TradingControls] Token: ${b.token}, balance field: ${b.balance}, parsed: ${balance}, has value: ${balance > 0}`);
            // Check for very small amounts too (in case of dust)
            return balance > 0.000001;
          });

        console.log('[TradingControls] Has balance:', hasBalance);
        console.log('[TradingControls] Balance check summary - Length:', currentBalances.length, 'Has any positive:', hasBalance);

        if (!hasBalance && !DEV_MODE_BYPASS_BALANCE_CHECK) {
          logger.logError('Insufficient wallet balance for live trading');

          // Show more detailed error
          const balanceDetails = currentBalances.map(b => `${b.token}: ${b.balance}`).join(', ');
          console.error('[TradingControls] Balance check failed. Balances:', balanceDetails || 'No balances found');

          toast.error(
            'Insufficient wallet balance! Your wallet needs funds to start live trading. ' +
            'Switch to paper trading mode or add funds to your wallet. ' +
            (balanceDetails ? `Current balances: ${balanceDetails}` : 'No balances detected'),
            10000
          );
          return;
        }

        if (DEV_MODE_BYPASS_BALANCE_CHECK && !hasBalance) {
          toast.warning('DEV MODE: Bypassing balance check - trading may fail without funds', 3000);
        }

        // Warn if balance is low
        const totalUsdValue = $walletBalances.reduce((sum, b) => sum + (b.value || b.usdValue || 0), 0);
        if (totalUsdValue < $initialBalance * 0.1) {
          toast.warning(
            `Low wallet balance detected ($${totalUsdValue.toFixed(2)}). ` +
            'Consider adding more funds for effective trading.',
            6000
          );
        }
      }

      try {
        await agent.start();
        tradingActive.set(true);

        const message = `Trading started in ${$tradingConfig.paperTrading ? 'PAPER' : 'LIVE'} mode`;
        logger.logSystem(message, 'success');

        if ($tradingConfig.paperTrading) {
          toast.info(`Paper trading started with $${$initialBalance} virtual balance`);
        } else {
          toast.success('Live trading started! Monitoring markets...');
        }
      } catch (error: any) {
        logger.logError('Failed to start trading', error);
        toast.error(`Failed to start trading: ${error.message || 'Unknown error'}`);
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