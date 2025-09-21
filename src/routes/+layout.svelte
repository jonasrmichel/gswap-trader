<script lang="ts">
  import '../app.css';
  import ToastNotification from '$lib/components/ToastNotification.svelte';
</script>

<main class="min-h-screen bg-background">
  <slot />
</main>
<ToastNotification />