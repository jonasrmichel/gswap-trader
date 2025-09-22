<script lang="ts">
  import { tradingLogs, isWalletConnected, walletBalances } from '$lib/stores/trading';
  import { walletStore } from '$lib/services/wallet';
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

  function getExplorerUrl(txHash: string): string {
    // For GalaChain transactions, use GalaScan
    // GalaChain transaction hashes are typically UUIDs or alphanumeric strings
    return `https://galascan.gala.com/tx/${txHash}`;
  }

  function formatTxHash(hash: string): string {
    if (!hash) return '';
    if (hash.length <= 12) return hash;
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
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
                {#if log.details.txHash}
                  <div class="mt-1">
                    GalaChain TX:
                    <a
                      href={getExplorerUrl(log.details.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-accent hover:text-accent/80 underline inline-flex items-center gap-1"
                      title="View on GalaScan"
                    >
                      {formatTxHash(log.details.txHash)}
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                {/if}
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