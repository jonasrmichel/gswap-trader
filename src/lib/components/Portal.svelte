<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let portal: HTMLDivElement;
  let target: HTMLElement;

  onMount(() => {
    target = document.body;
    portal = document.createElement('div');
    portal.className = 'svelte-portal';
    target.appendChild(portal);
  });

  onDestroy(() => {
    if (portal && target) {
      target.removeChild(portal);
    }
  });
</script>

{#if portal}
  <div bind:this={portal}>
    <slot />
  </div>
{/if}