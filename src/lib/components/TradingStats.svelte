<script lang="ts">
  import { tradingStats, tradingConfig, paperTradingStats, liveTradingStats, initialBalance } from '$lib/stores/trading';

  function formatNumber(num: number) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  
  // Use paper or live stats based on trading mode
  $: stats = $tradingConfig.paperTrading ? $paperTradingStats : $liveTradingStats;
  $: displayInitialBalance = $tradingConfig.paperTrading ? $initialBalance : $liveTradingStats.initialBalance;
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
        ${formatNumber($tradingConfig.paperTrading ? stats.currentValue : stats.totalValue || stats.currentBalance || 0)}
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">P&L</div>
      <div class="text-lg font-semibold {stats.profitLoss >= 0 ? 'text-success' : 'text-destructive'}">
        ${formatNumber(stats.profitLoss)}
        <span class="text-sm">({stats.profitLossPercent?.toFixed(2) || '0.00'}%)</span>
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Win Rate</div>
      <div class="text-lg font-semibold">{stats.winRate?.toFixed(1) || '0.0'}%</div>
      <div class="text-xs text-muted mt-1">
        {stats.winningTrades || 0}W / {stats.losingTrades || 0}L
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Avg Profit/Loss</div>
      <div class="text-sm font-semibold text-success">+{stats.avgProfit?.toFixed(2) || '0.00'}%</div>
      <div class="text-sm font-semibold text-destructive">{stats.avgLoss?.toFixed(2) || '0.00'}%</div>
    </div>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Total Trades</div>
      <div class="text-lg font-semibold">{stats.totalTrades || $tradingStats.totalTrades}</div>
      <div class="text-xs text-muted mt-1">
        {stats.successfulTrades || $tradingStats.successfulTrades} successful
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Win Rate</div>
      <div class="text-lg font-semibold {(stats.winRate || $tradingStats.winRate) >= 50 ? 'text-success' : 'text-warning'}">
        {(stats.winRate || $tradingStats.winRate).toFixed(1)}%
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">{$tradingConfig.paperTrading ? 'Total Signals' : 'Total Volume'}</div>
      <div class="text-lg font-semibold">
        {$tradingConfig.paperTrading 
          ? $tradingStats.totalSignals 
          : stats.totalVolume ? `$${formatNumber(stats.totalVolume)}` : '0'}
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
          : stats.fees ? `$${formatNumber(stats.fees)}` : '$0'}
      </div>
    </div>
  </div>
</div>