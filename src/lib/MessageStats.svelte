<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte'
  import type { Message } from './chats'
  import { language, t } from './i18n'
  import { formatMoney } from './responses'

  let { message }: { message: Message } = $props()

  function duration(ms: number) {
    return ms >= 1000 ? `${(ms / 1000).toLocaleString($language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}s` : `${Math.round(ms)}ms`
  }

  let stats = $derived(([
    { icon: 'gauge', label: $t('Token speed'), value: message.tokensPerSecond != null ? $t('{count} tokens/s', { count: message.tokensPerSecond.toLocaleString($language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : undefined },
    { icon: 'zap', label: $t('Time to first token'), value: message.timeToFirstToken != null ? duration(message.timeToFirstToken) : undefined },
    { icon: 'timer', label: $t('Elapsed time'), value: message.elapsedMs != null ? duration(message.elapsedMs) : undefined },
    { icon: 'upload', label: $t('Input tokens'), value: message.usage?.input.toLocaleString($language) },
    { icon: 'download', label: $t('Output tokens'), value: message.usage?.output.toLocaleString($language) },
    { icon: 'coin', label: $t('Estimated cost'), value: message.cost ? formatMoney(message.cost.amount, message.cost.currency) : undefined },
  ] satisfies { icon: IconName; label: string; value: string | undefined }[]).filter((stat) => stat.value !== undefined))
</script>

{#if stats.length}
  <dl class="message-stats">
    {#each stats as stat}
      <div class="message-stat" title={`${stat.label}: ${stat.value}`}>
        <dt>
          <Icon name={stat.icon} />
          <span class="message-stat-label">{stat.label}</span>
        </dt>
        <dd>{stat.value}</dd>
      </div>
    {/each}
  </dl>
{/if}
