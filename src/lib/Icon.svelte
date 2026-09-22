<script module lang="ts">
  export type IconName =
    | 'user'
    | 'trash-simple'
    | 'panel-left'
    | 'edit'
    | 'settings'
    | 'chevron-left'
    | 'chevron-down'
    | 'close'
    | 'image'
    | 'chevron-right'
    | 'copy'
    | 'regenerate'
    | 'arrow-up'
    | 'monitor'
    | 'sun'
    | 'moon'
    | 'plus'
    | 'duplicate'
    | 'trash'
    | 'eye'
    | 'eye-off'
    | 'refresh'
    | 'info'
    | 'gauge'
    | 'zap'
    | 'timer'
    | 'upload'
    | 'download'
    | 'coin'
</script>

<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  let { name, ...attributes }: { name: IconName } & SVGAttributes<SVGSVGElement> = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true" {...attributes}>
  {#if name === 'user'}
    <circle cx="12" cy="8" r="3.2"/>
    <path d="M5.8 19c1-3.4 3.2-5.2 6.2-5.2s5.2 1.8 6.2 5.2"/>
  {:else if name === 'trash-simple'}
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>
  {:else if name === 'panel-left'}
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <path d="M9 4v16"/>
  {:else if name === 'edit'}
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>
  {:else if name === 'settings'}
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>
  {:else if name === 'chevron-left'}
    <path d="m15 18-6-6 6-6"/>
  {:else if name === 'chevron-down'}
    <path d="m7 10 5 5 5-5"/>
  {:else if name === 'close'}
    <path d="M18 6 6 18M6 6l12 12"/>
  {:else if name === 'image'}
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="9" cy="9" r="2"/>
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>
  {:else if name === 'chevron-right'}
    <path d="m9 6 6 6-6 6"/>
  {:else if name === 'copy'}
    <rect x="9" y="9" width="11" height="11" rx="2"/>
    <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>
  {:else if name === 'regenerate'}
    <path d="M20 11a8 8 0 1 0-2.3 5.7"/>
    <path d="M20 4v7h-7"/>
  {:else if name === 'arrow-up'}
    <path d="m12 19V5"/>
    <path d="m6 11 6-6 6 6"/>
  {:else if name === 'monitor'}
    <rect x="3" y="4" width="18" height="13" rx="2"/>
    <path d="M8 21h8M12 17v4"/>
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
  {:else if name === 'moon'}
    <path d="M20.8 15.3A9 9 0 0 1 8.7 3.2 9 9 0 1 0 20.8 15.3Z"/>
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14"/>
  {:else if name === 'duplicate'}
    <path d="M9 9h10v10H9z"/>
    <path d="M5 15V5h10"/>
  {:else if name === 'trash'}
    <path d="M4 7h16"/>
    <path d="M9 7V4h6v3"/>
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/>
    <path d="M10 11v6M14 11v6"/>
  {:else if name === 'eye'}
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/>
    <circle cx="12" cy="12" r="2.5"/>
  {:else if name === 'eye-off'}
    <path d="m3 3 18 18"/>
    <path d="M6.7 6.7C4.3 8.2 2 12 2 12s3.5 6 10 6c1.9 0 3.6-.5 5-1.3"/>
    <path d="M10.7 6.1c.4-.1.8-.1 1.3-.1 6.5 0 10 6 10 6a18 18 0 0 1-2.1 2.8"/>
    <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/>
  {:else if name === 'refresh'}
    <path d="M20 11a8 8 0 0 0-14.9-4"/>
    <path d="M4 4v6h6"/>
    <path d="M4 13a8 8 0 0 0 14.9 4"/>
    <path d="M20 20v-6h-6"/>
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 11v6M12 8h.01"/>
  {:else if name === 'gauge'}
    <path d="M4.2 18a9 9 0 1 1 15.6 0M12 12l4-4M5 12h1M8 5l.5 1M16 5l-.5 1M18 12h1M8 20h8"/>
  {:else if name === 'zap'}
    <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>
  {:else if name === 'timer'}
    <path d="M9 2h6M12 2v3M18 5l2 2M12 9v5l3 2M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/>
  {:else if name === 'upload'}
    <path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>
  {:else if name === 'download'}
    <path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>
  {:else if name === 'coin'}
    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7l5 5-5 5-5-5 5-5Z"/>
  {/if}
</svg>
