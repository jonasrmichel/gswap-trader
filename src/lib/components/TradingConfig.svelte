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

<div class="bg-card rounded-xl border border-border p-6">
  <h2 class="text-lg font-semibold mb-4 flex items-center justify-between">
    Trading Configuration
    <div class="flex items-center gap-2">
      <span class="text-sm text-muted-foreground">Paper Trading</span>
      <button
        on:click={() => updateConfig('paperTrading', !$tradingConfig.paperTrading)}
        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {$tradingConfig.paperTrading ? 'bg-primary' : 'bg-secondary'}"
      >
        <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {$tradingConfig.paperTrading ? 'translate-x-6' : 'translate-x-1'}"></span>
      </button>
      <span class="text-sm text-muted-foreground">Live Trading</span>
    </div>
  </h2>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
    <!-- Risk Level -->
    <div>
      <label class="block text-sm font-medium mb-2">Risk Level</label>
      <div class="space-y-2">
        {#each ['safe', 'balanced', 'aggressive'] as risk}
          <button
            on:click={() => updateConfig('risk', risk)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg border transition-colors text-sm
              {$tradingConfig.risk === risk
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary border-border hover:border-primary/50'}
              {$tradingActive ? 'opacity-50 cursor-not-allowed' : ''}"
          >
            <div class="capitalize font-medium">{risk}</div>
            <div class="text-xs opacity-70">
              {risk === 'safe' ? '10% pos, 2% SL' :
               risk === 'balanced' ? '25% pos, 5% SL' :
               '50% pos, 10% SL'}
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Strategy -->
    <div>
      <label class="block text-sm font-medium mb-2">Strategy</label>
      <div class="space-y-2">
        {#each ['trend', 'revert', 'range'] as strategy}
          <button
            on:click={() => updateConfig('strategy', strategy)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg border transition-colors text-sm
              {$tradingConfig.strategy === strategy
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary border-border hover:border-primary/50'}
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
      <label class="block text-sm font-medium mb-2">Speed</label>
      <div class="space-y-2">
        {#each [
          { value: 'fast', label: 'Fast', desc: '1 minute' },
          { value: 'normal', label: 'Normal', desc: '5 minutes' },
          { value: 'slow', label: 'Slow', desc: '15 minutes' }
        ] as speed}
          <button
            on:click={() => updateConfig('speed', speed.value)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg border transition-colors text-sm
              {$tradingConfig.speed === speed.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary border-border hover:border-primary/50'}
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
      <label class="block text-sm font-medium mb-2">Signals</label>
      <div class="space-y-2">
        {#each [
          { value: 'precise', label: 'Precise', desc: '>80% confidence' },
          { value: 'normal', label: 'Normal', desc: '>60% confidence' },
          { value: 'active', label: 'Active', desc: '>40% confidence' }
        ] as signal}
          <button
            on:click={() => updateConfig('signals', signal.value)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg border transition-colors text-sm
              {$tradingConfig.signals === signal.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary border-border hover:border-primary/50'}
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
      <label class="block text-sm font-medium mb-2">Bias</label>
      <div class="space-y-2">
        {#each ['bullish', 'neutral', 'bearish'] as bias}
          <button
            on:click={() => updateConfig('bias', bias)}
            disabled={$tradingActive}
            class="w-full px-3 py-2 rounded-lg border transition-colors text-sm
              {$tradingConfig.bias === bias
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary border-border hover:border-primary/50'}
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