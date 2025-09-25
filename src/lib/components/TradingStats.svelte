<script lang="ts">
  import { tradingStats, tradingConfig, paperTradingStats, liveTradingStats, initialBalance } from '$lib/stores/trading';
  import type { LiveTradingStats } from '$lib/trading/live-stats';

  type PaperTradingStats = {
    initialBalance: number;
    currentValue: number;
    profitLoss: number;
    profitLossPercent: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgProfit: number;
    avgLoss: number;
  };

  type CombinedStats = Partial<LiveTradingStats> & Partial<PaperTradingStats>;

  function formatNumber(num: number) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  
  let stats: CombinedStats = {};

  // Use paper or live stats based on trading mode
  $: stats = ($tradingConfig.paperTrading ? $paperTradingStats : $liveTradingStats) as CombinedStats;
  $: displayInitialBalance = $tradingConfig.paperTrading ? $initialBalance : $liveTradingStats.initialBalance;
  $: currentValue = $tradingConfig.paperTrading
    ? (stats.currentValue ?? 0)
    : (stats.totalValue ?? stats.currentBalance ?? 0);
  $: profitLossValue = stats.profitLoss ?? 0;
  $: profitLossPercent = stats.profitLossPercent ?? 0;
  $: winRateValue = stats.winRate ?? $tradingStats.winRate ?? 0;
  $: winningTrades = stats.winningTrades ?? 0;
  $: losingTrades = stats.losingTrades ?? 0;
  $: avgProfit = stats.avgProfit ?? 0;
  $: avgLoss = stats.avgLoss ?? 0;
  $: totalTrades = stats.totalTrades ?? $tradingStats.totalTrades ?? 0;
  $: successfulTrades = stats.successfulTrades ?? $tradingStats.successfulTrades ?? 0;
  $: totalVolume = stats.totalVolume ?? 0;
  $: totalFees = stats.fees ?? 0;
</script>

<div class="bg-surface-default backdrop-blur-sm rounded-xl border border-border-subtle p-6">
  <h2 class="text-lg font-semibold mb-4">
    {$tradingConfig.paperTrading ? 'Paper Trading' : 'Live Trading'} Statistics
  </h2>

  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Initial Balance</div>
      <div class="text-lg font-semibold">${formatNumber(displayInitialBalance)}</div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Current Value</div>
      <div class="text-lg font-semibold">
        ${formatNumber(currentValue)}
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">P&L</div>
      <div class="text-lg font-semibold {profitLossValue >= 0 ? 'text-success' : 'text-destructive'}">
        ${formatNumber(profitLossValue)}
        <span class="text-sm">({profitLossPercent.toFixed(2)}%)</span>
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Win Rate</div>
      <div class="text-lg font-semibold">{winRateValue.toFixed(1)}%</div>
      <div class="text-xs text-muted mt-1">
        {winningTrades}W / {losingTrades}L
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Avg Profit/Loss</div>
      <div class="text-sm font-semibold text-success">+{avgProfit.toFixed(2)}%</div>
      <div class="text-sm font-semibold text-destructive">{avgLoss.toFixed(2)}%</div>
    </div>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Total Trades</div>
      <div class="text-lg font-semibold">{totalTrades}</div>
      <div class="text-xs text-muted mt-1">
        {successfulTrades} successful
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Win Rate</div>
      <div class="text-lg font-semibold {winRateValue >= 50 ? 'text-success' : 'text-warning'}">
        {winRateValue.toFixed(1)}%
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">{$tradingConfig.paperTrading ? 'Total Signals' : 'Total Volume'}</div>
      <div class="text-lg font-semibold">
        {$tradingConfig.paperTrading 
          ? $tradingStats.totalSignals 
          : totalVolume ? `$${formatNumber(totalVolume)}` : '0'}
      </div>
      {#if $tradingConfig.paperTrading}
        <div class="text-xs text-muted mt-1">
          {$tradingStats.buySignals} buy / {$tradingStats.sellSignals} sell
        </div>
      {/if}
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">{$tradingConfig.paperTrading ? 'Avg Confidence' : 'Total Fees'}</div>
      <div class="text-lg font-semibold">
        {$tradingConfig.paperTrading 
          ? `${$tradingStats.avgSignalConfidence.toFixed(1)}%`
          : totalFees ? `$${formatNumber(totalFees)}` : '$0'}
      </div>
    </div>
  </div>
</div>
