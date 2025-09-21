<script lang="ts">
  import { tradingStats, tradingConfig, paperTradingStats } from '$lib/stores/trading';

  function formatNumber(num: number) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
</script>

<div class="bg-card rounded-xl border border-border p-6">
  <h2 class="text-lg font-semibold mb-4">
    {$tradingConfig.paperTrading ? 'Paper Trading' : 'Live Trading'} Statistics
  </h2>

  {#if $tradingConfig.paperTrading}
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <div class="bg-secondary/30 rounded-lg p-3">
        <div class="text-xs text-muted-foreground">Initial Balance</div>
        <div class="text-lg font-semibold">${formatNumber($paperTradingStats.initialBalance)}</div>
      </div>

      <div class="bg-secondary/30 rounded-lg p-3">
        <div class="text-xs text-muted-foreground">Current Value</div>
        <div class="text-lg font-semibold">${formatNumber($paperTradingStats.currentValue)}</div>
      </div>

      <div class="bg-secondary/30 rounded-lg p-3">
        <div class="text-xs text-muted-foreground">P&L</div>
        <div class="text-lg font-semibold {$paperTradingStats.profitLoss >= 0 ? 'text-success' : 'text-destructive'}">
          ${formatNumber($paperTradingStats.profitLoss)}
          <span class="text-sm">({$paperTradingStats.profitLossPercent.toFixed(2)}%)</span>
        </div>
      </div>

      <div class="bg-secondary/30 rounded-lg p-3">
        <div class="text-xs text-muted-foreground">Win Rate</div>
        <div class="text-lg font-semibold">{$paperTradingStats.winRate.toFixed(1)}%</div>
        <div class="text-xs text-muted-foreground mt-1">
          {$paperTradingStats.winningTrades}W / {$paperTradingStats.losingTrades}L
        </div>
      </div>

      <div class="bg-secondary/30 rounded-lg p-3">
        <div class="text-xs text-muted-foreground">Avg Profit/Loss</div>
        <div class="text-sm font-semibold text-success">+{$paperTradingStats.avgProfit.toFixed(2)}%</div>
        <div class="text-sm font-semibold text-destructive">{$paperTradingStats.avgLoss.toFixed(2)}%</div>
      </div>
    </div>
  {/if}

  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
    <div class="bg-secondary/30 rounded-lg p-3">
      <div class="text-xs text-muted-foreground">Total Trades</div>
      <div class="text-lg font-semibold">{$tradingStats.totalTrades}</div>
      <div class="text-xs text-muted-foreground mt-1">
        {$tradingStats.successfulTrades} successful
      </div>
    </div>

    <div class="bg-secondary/30 rounded-lg p-3">
      <div class="text-xs text-muted-foreground">Win Rate</div>
      <div class="text-lg font-semibold {$tradingStats.winRate >= 50 ? 'text-success' : 'text-warning'}">
        {$tradingStats.winRate.toFixed(1)}%
      </div>
    </div>

    <div class="bg-secondary/30 rounded-lg p-3">
      <div class="text-xs text-muted-foreground">Total Signals</div>
      <div class="text-lg font-semibold">{$tradingStats.totalSignals}</div>
      <div class="text-xs text-muted-foreground mt-1">
        {$tradingStats.buySignals} buy / {$tradingStats.sellSignals} sell
      </div>
    </div>

    <div class="bg-secondary/30 rounded-lg p-3">
      <div class="text-xs text-muted-foreground">Avg Confidence</div>
      <div class="text-lg font-semibold">{$tradingStats.avgSignalConfidence.toFixed(1)}%</div>
    </div>
  </div>
</div>