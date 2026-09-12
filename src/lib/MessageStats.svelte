<script lang="ts">
  import type { Message } from './chats'
  import { language, t } from './i18n'
  import { formatMoney } from './responses'

  let { message }: { message: Message } = $props()

  function duration(ms: number) {
    return ms >= 1000 ? `${(ms / 1000).toLocaleString($language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}s` : `${Math.round(ms)}ms`
  }

  const icons = {
    speed: 'M4.2 18a9 9 0 1 1 15.6 0M12 12l4-4M5 12h1M8 5l.5 1M16 5l-.5 1M18 12h1M8 20h8',
    first: 'm13 2-9 12h7l-1 8 10-12h-7l1-8Z',
    elapsed: 'M9 2h6M12 2v3M18 5l2 2M12 9v5l3 2M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    input: 'M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
    output: 'M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
    cost: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7l5 5-5 5-5-5 5-5Z',
  }

  let stats = $derived([
    { icon: icons.speed, label: $t('Token speed'), value: message.tokensPerSecond != null ? $t('{count} tokens/s', { count: message.tokensPerSecond.toLocaleString($language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : undefined },
    { icon: icons.first, label: $t('Time to first token'), value: message.timeToFirstToken != null ? duration(message.timeToFirstToken) : undefined },
    { icon: icons.elapsed, label: $t('Elapsed time'), value: message.elapsedMs != null ? duration(message.elapsedMs) : undefined },
    { icon: icons.input, label: $t('Input tokens'), value: message.usage?.input.toLocaleString($language) },
    { icon: icons.output, label: $t('Output tokens'), value: message.usage?.output.toLocaleString($language) },
    { icon: icons.cost, label: $t('Estimated cost'), value: message.cost ? formatMoney(message.cost.amount, message.cost.currency) : undefined },
  ].filter((stat) => stat.value !== undefined))
</script>

{#if stats.length}
  <dl class="message-stats">
    {#each stats as stat}
      <div class="message-stat" title={`${stat.label}: ${stat.value}`}>
        <dt>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={stat.icon} /></svg>
          <span class="message-stat-label">{stat.label}</span>
        </dt>
        <dd>{stat.value}</dd>
      </div>
    {/each}
  </dl>
{/if}
