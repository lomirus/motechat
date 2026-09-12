<script lang="ts">
  import type { usageRing } from './responses'

  let { segments, circumference }: {
    segments: ReturnType<typeof usageRing>
    circumference: number
  } = $props()
</script>

<svg viewBox="0 0 24 24" aria-hidden="true">
  <circle class="track" cx="12" cy="12" r="9"></circle>
  {#each segments as segment}
    <circle
      class="seg {segment.key}"
      cx="12"
      cy="12"
      r="9"
      stroke-dasharray="{segment.dash} {circumference}"
      stroke-dashoffset={-segment.offset}
    ></circle>
  {/each}
</svg>
