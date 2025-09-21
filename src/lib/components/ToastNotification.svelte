<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { toast } from '$lib/stores/toast';

  function getIconForType(type: string) {
    switch(type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return 'ℹ️';
    }
  }

  function getColorClasses(type: string) {
    switch(type) {
      case 'success': return 'bg-success/20 border-success/40 text-success';
      case 'error': return 'bg-destructive/20 border-destructive/40 text-destructive';
      case 'warning': return 'bg-warning/20 border-warning/40 text-warning';
      case 'info': return 'bg-accent/20 border-accent/40 text-accent';
      default: return 'bg-accent/20 border-accent/40 text-accent';
    }
  }
</script>

<div class="fixed top-4 right-4 z-50 space-y-2 pointer-events-none" style="z-index: 2147483647;">
  {#each $toast as item (item.id)}
    <div
      class="pointer-events-auto max-w-md"
      transition:fly="{{ y: -20, duration: 300 }}"
    >
      <div class="flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md shadow-lg {getColorClasses(item.type)}">
        <span class="text-xl">{getIconForType(item.type)}</span>
        <p class="flex-1 text-sm font-medium text-foreground">{item.message}</p>
        <button
          on:click={() => toast.remove(item.id)}
          class="ml-2 text-muted hover:text-foreground transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  {/each}
</div>