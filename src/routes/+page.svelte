<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import WalletConnect from '$lib/components/WalletConnect.svelte';
  import TradingConfig from '$lib/components/TradingConfig.svelte';
  import TradingLog from '$lib/components/TradingLog.svelte';
  import TradingStats from '$lib/components/TradingStats.svelte';
  import TradingControls from '$lib/components/TradingControls.svelte';
  import PoolList from '$lib/components/PoolList.svelte';
  import InitialBalance from '$lib/components/InitialBalance.svelte';
  import {
    tradingActive,
    tradingLogs,
    tradingStats,
    liquidityPools,
    isWalletConnected,
    tradingConfig,
    paperTradingStats,
    selectedPool,
    initialBalance
  } from '$lib/stores/trading';
  import { GSwapClient } from '$lib/gswap/client';
  import { WalletManager } from '$lib/wallet/manager';
  import { TradingAgent } from '$lib/trading/agent';
  import { TradingLogger } from '$lib/trading/logger';
  import { PaperTradingManager } from '$lib/trading/paper-trading';

  let client: GSwapClient | null = null;
  let wallet: WalletManager | null = null;
  let agent: TradingAgent | null = null;
  let logger: TradingLogger | null = null;
  let paperManager: PaperTradingManager | null = null;

  onMount(async () => {
    // Initialize services
    client = new GSwapClient();
    wallet = new WalletManager(client);
    logger = new TradingLogger();
    paperManager = new PaperTradingManager($initialBalance);

    // Subscribe to logger updates
    const unsubscribe = logger.subscribe((log) => {
      tradingLogs.update(logs => [log, ...logs].slice(0, 100));
      tradingStats.set(logger.getStats());
    });

    // Update paper trading stats periodically
    const statsInterval = setInterval(() => {
      if (paperManager) {
        paperTradingStats.set(paperManager.getStats());
      }
    }, 1000); // Update every second

    // Simulate some initial logs
    logger.logSystem('GSwap Agent initialized', 'success');
    logger.logSystem('Connected to BSC network');

    return () => {
      unsubscribe();
      clearInterval(statsInterval);
      if (agent?.isActive()) {
        agent.stop();
      }
    };
  });

  $: if ($isWalletConnected && !agent && client && wallet && logger) {
    agent = new TradingAgent(client, wallet, $tradingConfig, logger, paperManager);
    if ($selectedPool) {
      agent.setSelectedPool($selectedPool);
    }
  }

  // Update agent config when it changes
  $: if (agent && $tradingConfig && logger) {
    agent.updateConfig($tradingConfig);
  }

  // Update agent's selected pool when it changes
  $: if (agent && $selectedPool) {
    agent.setSelectedPool($selectedPool);
  }

  // Update paper trading initial balance
  $: if (paperManager && $initialBalance && paperManager.balance !== $initialBalance) {
    paperManager.updateInitialBalance($initialBalance);
    paperTradingStats.set(paperManager.getStats());
  }
</script>

<div class="min-h-screen bg-background text-foreground font-primary">
  <!-- Header -->
  <header class="border-b border-border-subtle bg-surface-default" style="position: relative; z-index: 10;">
    <div class="container mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <h1 class="text-2xl font-bold bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
            GSwap Agent
          </h1>
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full {$tradingActive ? 'bg-success animate-pulse' : 'bg-muted'}"></div>
            <span class="text-sm text-muted">
              {$tradingActive ? 'Trading Active' : 'Idle'}
            </span>
          </div>
        </div>
        <WalletConnect />
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="container mx-auto px-4 py-6 space-y-6">
    <!-- Trading Mode Indicator -->
    {#if !$tradingConfig.paperTrading && $isWalletConnected}
      <div class="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-center">
        <span class="text-destructive font-medium">🔴 Live Trading Mode</span>
        <span class="text-sm text-muted ml-2">Trading with real funds</span>
      </div>
    {:else}
      <div class="bg-warning/10 border border-warning/30 rounded-lg p-3 text-center">
        <span class="text-warning font-medium">⚠️ Paper Trading Mode</span>
        <span class="text-sm text-muted ml-2">Trading with simulated funds</span>
      </div>
    {/if}

    <!-- Trading Controls -->
    <TradingControls {agent} {logger} />

    <!-- Initial Balance and Trading Configuration -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div class="lg:col-span-1">
        <InitialBalance />
      </div>
      <div class="lg:col-span-3">
        <TradingConfig />
      </div>
    </div>

    <!-- Stats and Pools -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <TradingStats />
      <PoolList />
    </div>

    <!-- Trading Log -->
    <TradingLog />
  </main>
</div>

<style>
  :global(body) {
    font-family: 'Space Grotesk', 'Noto Sans', sans-serif;
  }
</style>