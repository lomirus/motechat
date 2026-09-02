<script lang="ts">
  type Option = string | readonly [string, string]

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

  function entry(option: Option) {
    return typeof option === 'string' ? [option, option] as const : option
  }

  function labelFor(current: string) {
    for (const option of options) {
      const [optionValue, optionLabel] = entry(option)
      if (optionValue === current) return optionLabel
    }
    return current
  }

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
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false
  }}
>
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
        {@const [optionValue, optionLabel] = entry(option)}
        <button
          class:selected={optionValue === value}
          type="button"
          role="option"
          aria-selected={optionValue === value}
          onclick={() => choose(optionValue)}
        >{optionLabel}</button>
      {/each}
    </div>
  {/if}
</div>
