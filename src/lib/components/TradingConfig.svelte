<script lang="ts">
  import { tradingConfig, tradingActive } from '$lib/stores/trading';
  import type { RiskLevel, StrategyType, TradingSpeed, SignalConfidence, MarketBias } from '$lib/trading/config';

  function updateConfig(field: string, value: any) {
    tradingConfig.update(config => ({
      ...config,
      [field]: value
    }));
  }
</script>

<div class="bg-surface-default backdrop-blur-sm rounded-xl border border-border-subtle p-6">
  <h2 class="text-lg font-semibold mb-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <span>Trading Configuration</span>
      {#if $tradingActive}
        <div class="text-xs text-warning bg-warning/10 px-2 py-1 rounded-full border border-warning/30">
          🔒 Locked during trading
        </div>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <span class="text-sm text-muted">Live Trading</span>
      <button
        on:click={() => updateConfig('paperTrading', !$tradingConfig.paperTrading)}
        disabled={$tradingActive}
        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          {$tradingConfig.paperTrading ? 'bg-accent' : 'bg-surface-hover border border-border-subtle'}
          {$tradingActive ? 'opacity-50 cursor-not-allowed' : ''}"
      >
        <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {$tradingConfig.paperTrading ? 'translate-x-6' : 'translate-x-1'}"></span>
      </button>
      <span class="text-sm text-muted">Paper Trading</span>
    </div>
  </h2>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
    <!-- Risk Level -->
    <div>
      <p class="block text-sm font-medium mb-2">Risk Level</p>
      <div class="space-y-2">
        {#each ['safe', 'balanced', 'aggressive'] as risk}
          <button
            on:click={() => updateConfig('risk', risk)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg transition-colors text-sm
              {$tradingConfig.risk === risk
                ? 'bg-accent text-white border border-accent'
                : 'bg-surface-hover text-muted hover:text-foreground border border-border-subtle hover:bg-surface-pressed'}
              {$tradingActive ? 'opacity-50 cursor-not-allowed' : ''}"
          >
            <div class="capitalize font-medium">{risk}</div>
            <div class="text-xs opacity-70">
              {risk === 'safe' ? '15% pos, 3% SL, 2% TP' :
               risk === 'balanced' ? '30% pos, 5% SL, 4% TP' :
               '60% pos, 15% SL, 10% TP'}
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Strategy -->
    <div>
      <p class="block text-sm font-medium mb-2">Strategy</p>
      <div class="space-y-2">
        {#each ['trend', 'revert', 'range'] as strategy}
          <button
            on:click={() => updateConfig('strategy', strategy)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg transition-colors text-sm
              {$tradingConfig.strategy === strategy
                ? 'bg-accent text-white border border-accent'
                : 'bg-surface-hover text-muted hover:text-foreground border border-border-subtle hover:bg-surface-pressed'}
              {$tradingActive ? 'opacity-50 cursor-not-allowed' : ''}"
          >
            <div class="capitalize font-medium">
              {strategy === 'trend' ? 'Trend Following' :
               strategy === 'revert' ? 'Mean Reversion' :
               'Range Trading'}
            </div>
            <div class="text-xs opacity-70">
              {strategy === 'trend' ? 'Follow momentum' :
               strategy === 'revert' ? 'Trade extremes' :
               'Trade ranges'}
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Speed -->
    <div>
      <p class="block text-sm font-medium mb-2">Speed</p>
      <div class="space-y-2">
        {#each [
          { value: 'fast', label: 'Scalping', desc: '1 min candles' },
          { value: 'normal', label: 'Day Trading', desc: '5 min candles' },
          { value: 'slow', label: 'Position', desc: '1 hour candles' }
        ] as speed}
          <button
            on:click={() => updateConfig('speed', speed.value)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg transition-colors text-sm
              {$tradingConfig.speed === speed.value
                ? 'bg-accent text-white border border-accent'
                : 'bg-surface-hover text-muted hover:text-foreground border border-border-subtle hover:bg-surface-pressed'}
              {$tradingActive ? 'opacity-50 cursor-not-allowed' : ''}"
          >
            <div class="font-medium">{speed.label}</div>
            <div class="text-xs opacity-70">{speed.desc}</div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Signal Confidence -->
    <div>
      <p class="block text-sm font-medium mb-2">Signals</p>
      <div class="space-y-2">
        {#each [
          { value: 'precise', label: 'Conservative', desc: '3+ indicators' },
          { value: 'normal', label: 'Moderate', desc: '2+ indicators' },
          { value: 'active', label: 'Aggressive', desc: '1+ indicator' }
        ] as signal}
          <button
            on:click={() => updateConfig('signals', signal.value)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg transition-colors text-sm
              {$tradingConfig.signals === signal.value
                ? 'bg-accent text-white border border-accent'
                : 'bg-surface-hover text-muted hover:text-foreground border border-border-subtle hover:bg-surface-pressed'}
              {$tradingActive ? 'opacity-50 cursor-not-allowed' : ''}"
          >
            <div class="font-medium">{signal.label}</div>
            <div class="text-xs opacity-70">{signal.desc}</div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Market Bias -->
    <div>
      <p class="block text-sm font-medium mb-2">Bias</p>
      <div class="space-y-2">
        {#each ['bullish', 'neutral', 'bearish'] as bias}
          <button
            on:click={() => updateConfig('bias', bias)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg transition-colors text-sm
              {$tradingConfig.bias === bias
                ? 'bg-accent text-white border border-accent'
                : 'bg-surface-hover text-muted hover:text-foreground border border-border-subtle hover:bg-surface-pressed'}
              {$tradingActive ? 'opacity-50 cursor-not-allowed' : ''}"
          >
            <div class="capitalize font-medium">{bias}</div>
            <div class="text-xs opacity-70">
              {bias === 'bullish' ? 'Favor buys' :
               bias === 'neutral' ? 'No preference' :
               'Favor sells'}
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>
