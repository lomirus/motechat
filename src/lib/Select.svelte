<script lang="ts">
  type Option = string | readonly [string, string] | readonly [string, string, string]

  let {
    id,
    value = $bindable(''),
    options,
    placeholder = '',
    editable = false,
    listLabel,
    listName,
    onchange,
  }: {
    id: string
    value: string
    options: readonly Option[]
    placeholder?: string
    editable?: boolean
    listLabel: string
    listName: string
    onchange?: (value: string) => void
  } = $props()

  let open = $state(false)

  function entry(option: Option): readonly [string, string, string] {
    if (typeof option === 'string') return [option, option, '']
    return [option[0], option[1], option[2] ?? '']
  }

  function iconFor(current: string) {
    for (const option of options) {
      const [optionValue, , optionIcon] = entry(option)
      if (optionValue === current) return optionIcon
    }
    return ''
  }

  function labelFor(current: string) {
    for (const option of options) {
      const [optionValue, optionLabel] = entry(option)
      if (optionValue === current) return optionLabel
    }
    return current
  }

  const faces = $derived(options.some((option) => Array.isArray(option) && option.length > 2))

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault()
      open = true
    }
    if (!editable && (event.key === 'Enter' || event.key === ' ') && options.length) {
      event.preventDefault()
      open = true
    }
  }

  function choose(next: string) {
    value = next
    open = false
    onchange?.(next)
  }
</script>

<div
  class="model-select"
  class:has-face={faces}
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false
  }}
>
  {#if faces}
    {@render face(iconFor(value))}
  {/if}
  {#if editable}
    <input
      {id}
      type="text"
      bind:value
      {placeholder}
      autocomplete="off"
      spellcheck="false"
      onkeydown={handleKeydown}
    />
  {:else}
    <input
      {id}
      type="text"
      readonly
      value={labelFor(value)}
      onmousedown={(event) => event.preventDefault()}
      onfocus={(event) => event.currentTarget.setSelectionRange(0, 0)}
      onclick={() => (open = !open)}
      onkeydown={handleKeydown}
    />
  {/if}
  <button
    class="model-select-toggle"
    type="button"
    disabled={!options.length}
    aria-label={open ? `Hide ${listName}` : `Show ${listName}`}
    aria-expanded={open}
    aria-controls="{id}-options"
    onclick={() => (open = !open)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
  </button>
  {#if open}
    <div
      id="{id}-options"
      class="model-options"
      role="listbox"
      tabindex="-1"
      aria-label={listLabel}
      onkeydown={(event) => {
        if (event.key === 'Escape') open = false
      }}
    >
      {#each options as option}
        {@const [optionValue, optionLabel, optionIcon] = entry(option)}
        <button
          class:selected={optionValue === value}
          type="button"
          role="option"
          aria-selected={optionValue === value}
          onclick={() => choose(optionValue)}
        >{#if faces}{@render face(optionIcon)}{/if}{optionLabel}</button>
      {/each}
    </div>
  {/if}
</div>

{#snippet face(src: string)}
  <span class="model-select-face" aria-hidden="true">
    {#if src}
      <img src={src} alt="" />
    {:else}
      <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5.8 19c1-3.4 3.2-5.2 6.2-5.2s5.2 1.8 6.2 5.2"/></svg>
    {/if}
  </span>
{/snippet}
