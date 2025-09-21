<script lang="ts">
  import { tradingStats, tradingConfig, paperTradingStats, initialBalance } from '$lib/stores/trading';

  function formatNumber(num: number) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
</script>

<div class="bg-surface-default backdrop-blur-sm rounded-xl border border-border-subtle p-6">
  <h2 class="text-lg font-semibold mb-4">
    {$tradingConfig.paperTrading ? 'Paper Trading' : 'Live Trading'} Statistics
  </h2>

  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Initial Balance</div>
      <div class="text-lg font-semibold">${formatNumber($initialBalance)}</div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Current Value</div>
      <div class="text-lg font-semibold">${formatNumber($paperTradingStats.currentValue)}</div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">P&L</div>
      <div class="text-lg font-semibold {$paperTradingStats.profitLoss >= 0 ? 'text-success' : 'text-destructive'}">
        ${formatNumber($paperTradingStats.profitLoss)}
        <span class="text-sm">({$paperTradingStats.profitLossPercent.toFixed(2)}%)</span>
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Win Rate</div>
      <div class="text-lg font-semibold">{$paperTradingStats.winRate.toFixed(1)}%</div>
      <div class="text-xs text-muted mt-1">
        {$paperTradingStats.winningTrades}W / {$paperTradingStats.losingTrades}L
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Avg Profit/Loss</div>
      <div class="text-sm font-semibold text-success">+{$paperTradingStats.avgProfit.toFixed(2)}%</div>
      <div class="text-sm font-semibold text-destructive">{$paperTradingStats.avgLoss.toFixed(2)}%</div>
    </div>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Total Trades</div>
      <div class="text-lg font-semibold">{$tradingStats.totalTrades}</div>
      <div class="text-xs text-muted mt-1">
        {$tradingStats.successfulTrades} successful
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Win Rate</div>
      <div class="text-lg font-semibold {$tradingStats.winRate >= 50 ? 'text-success' : 'text-warning'}">
        {$tradingStats.winRate.toFixed(1)}%
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Total Signals</div>
      <div class="text-lg font-semibold">{$tradingStats.totalSignals}</div>
      <div class="text-xs text-muted mt-1">
        {$tradingStats.buySignals} buy / {$tradingStats.sellSignals} sell
      </div>
    </div>

    <div class="bg-surface-hover rounded-lg p-3">
      <div class="text-xs text-muted">Avg Confidence</div>
      <div class="text-lg font-semibold">{$tradingStats.avgSignalConfidence.toFixed(1)}%</div>
    </div>
  </div>
</div>