<script lang="ts">
  import { tradingLogs } from '$lib/stores/trading';
  import type { LogEntry } from '$lib/trading/logger';

  function getLevelColor(level: string) {
    switch (level) {
      case 'success': return 'text-success';
      case 'error': return 'text-destructive';
      case 'warning': return 'text-warning';
      default: return 'text-foreground';
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'signal': return '📡';
      case 'trade': return '💱';
      case 'wallet': return '👛';
      case 'system': return '⚙️';
      default: return '📝';
    }
  }

  function formatTime(date: Date) {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
</script>

<div class="bg-card rounded-xl border border-border p-6">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-semibold">Trading Activity Log</h2>
    <div class="text-sm text-muted-foreground">
      {$tradingLogs.length} entries
    </div>
  </div>

  <div class="space-y-2 max-h-96 overflow-y-auto">
    {#if $tradingLogs.length === 0}
      <div class="text-center py-8 text-muted-foreground">
        No trading activity yet. Start the trading agent to see logs.
      </div>
    {/if}

    {#each $tradingLogs as log}
      <div class="flex items-start gap-3 p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
        <span class="text-lg">{getTypeIcon(log.type)}</span>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">
              {formatTime(log.timestamp)}
            </span>
            <span class="px-2 py-0.5 text-xs rounded-full bg-secondary {getLevelColor(log.level)}">
              {log.level}
            </span>
          </div>

          <div class="mt-1 text-sm break-words">
            {log.message}
          </div>

          {#if log.details}
            <div class="mt-2 p-2 bg-background/50 rounded text-xs font-mono">
              {#if log.type === 'signal' && log.details}
                <div>Action: <span class="text-accent">{log.details.action}</span></div>
                <div>Confidence: <span class="text-accent">{log.details.confidence}%</span></div>
                <div>Pool: <span class="text-accent">{log.details.poolId}</span></div>
                <div>Reason: {log.details.reason}</div>
              {:else if log.type === 'trade' && log.details}
                <div>Status: <span class="{log.details.status === 'success' ? 'text-success' : 'text-destructive'}">{log.details.status}</span></div>
                <div>{log.details.amountIn} {log.details.tokenIn} → {log.details.amountOut} {log.details.tokenOut}</div>
                {#if log.details.profit}
                  <div>Profit: <span class="{log.details.profit > 0 ? 'text-success' : 'text-destructive'}">{log.details.profit.toFixed(2)}%</span></div>
                {/if}
              {:else}
                <pre class="whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>