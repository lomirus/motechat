<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    extractModelIds,
    extractResponseReasoning,
    extractResponseText,
    isRecord,
    modelsUrl,
    parseJson,
    readResponseJson,
    responseErrorMessage,
    responsesUrl,
    responseDeltas,
  } from './lib/responses'

  type Theme = 'system' | 'light' | 'dark'
  type Message = { role: 'user' | 'assistant'; content: string; reasoning?: string }

  const storageKey = 'saga-settings'

  let page: 'chat' | 'settings' = 'chat'
  let theme: Theme = 'system'
  let apiKey = ''
  let baseUrl = ''
  let model = ''
  let availableModels: string[] = []
  let modelsLoading = false
  let modelsError = ''
  let modelsOpen = false
  let systemPrompt = ''
  let showApiKey = false
  let showReasoning = false
  let prompt = ''
  let messages: Message[] = []
  let loading = false
  let error = ''
  let copiedMessage: number | null = null
  let editingMessage: number | null = null
  let editPrompt = ''
  let form: HTMLFormElement
  let textarea: HTMLTextAreaElement
  let editTextarea: HTMLTextAreaElement
  let messageEnd: HTMLDivElement
  let scrollbar: HTMLDivElement
  let scrollable = false
  let scrollThumbHeight = 0
  let scrollThumbTop = 0
  let dragOffset: number | null = null

  onMount(() => {
    try {
      const stored = parseJson(localStorage.getItem(storageKey) || '{}')
      if (isRecord(stored)) {
        theme = stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system'
        apiKey = typeof stored.apiKey === 'string' ? stored.apiKey : ''
        baseUrl = typeof stored.baseUrl === 'string' ? stored.baseUrl : baseUrl
        model = typeof stored.model === 'string' ? stored.model : ''
        availableModels = Array.isArray(stored.availableModels)
          ? stored.availableModels.filter((value): value is string => typeof value === 'string')
          : []
        systemPrompt = typeof stored.systemPrompt === 'string' ? stored.systemPrompt : ''
        showReasoning = stored.showReasoning === true
      }
    } catch {
      // Ignore malformed local preferences and keep safe defaults.
    }
    applyTheme(theme)

    const resizeObserver = new ResizeObserver(updateScrollbar)
    resizeObserver.observe(document.body)
    window.addEventListener('scroll', updateScrollbar, { passive: true })
    window.addEventListener('resize', updateScrollbar)
    updateScrollbar()

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('scroll', updateScrollbar)
      window.removeEventListener('resize', updateScrollbar)
    }
  })

  function applyTheme(value: Theme) {
    if (value === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = value
  }

  function chooseTheme(value: Theme) {
    theme = value
    applyTheme(value)
    saveSettings()
  }

  function saveSettings() {
    localStorage.setItem(storageKey, JSON.stringify({
      theme,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      model: model.trim(),
      availableModels,
      systemPrompt: systemPrompt.trim(),
      showReasoning,
    }))
  }

  function resizeTextarea(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`
  }

  function updateScrollbar() {
    if (!scrollbar) return
    const root = document.documentElement
    const trackHeight = scrollbar.clientHeight
    scrollable = root.scrollHeight > root.clientHeight
    scrollThumbHeight = scrollable ? Math.max(36, trackHeight * root.clientHeight / root.scrollHeight) : trackHeight
    scrollThumbTop = scrollable
      ? (trackHeight - scrollThumbHeight) * root.scrollTop / (root.scrollHeight - root.clientHeight)
      : 0
  }

  function scrollFromPointer(clientY: number) {
    if (dragOffset === null) return
    const root = document.documentElement
    const track = scrollbar.getBoundingClientRect()
    const travel = track.height - scrollThumbHeight
    const top = Math.max(0, Math.min(travel, clientY - track.top - dragOffset))
    window.scrollTo({ top: top / travel * (root.scrollHeight - root.clientHeight) })
  }

  function startScrollbarDrag(event: PointerEvent) {
    if (!scrollable) return
    const trackTop = scrollbar.getBoundingClientRect().top
    const pointerOnThumb = event.clientY >= trackTop + scrollThumbTop
      && event.clientY <= trackTop + scrollThumbTop + scrollThumbHeight
    dragOffset = pointerOnThumb ? event.clientY - trackTop - scrollThumbTop : scrollThumbHeight / 2
    scrollbar.setPointerCapture(event.pointerId)
    scrollFromPointer(event.clientY)
    event.preventDefault()
  }

  function stopScrollbarDrag(event: PointerEvent) {
    dragOffset = null
    if (scrollbar.hasPointerCapture(event.pointerId)) scrollbar.releasePointerCapture(event.pointerId)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  }

  async function showMessages(next: Message[]) {
    const wasAtBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
    messages = next
    await tick()
    if (wasAtBottom) messageEnd?.scrollIntoView()
  }

  function requestReady() {
    if (!apiKey.trim() || !baseUrl.trim()) {
      error = 'Add an API Key and Base URL in Settings first.'
      return false
    }
    if (!model.trim()) {
      error = 'Select a model before sending a message.'
      return false
    }
    return true
  }

  async function refreshModels() {
    if (!apiKey.trim() || !baseUrl.trim() || modelsLoading) return
    modelsOpen = false
    modelsLoading = true
    modelsError = ''

    try {
      const response = await fetch(modelsUrl(baseUrl), {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      })
      const data = await readResponseJson(response).catch((): unknown => undefined)
      if (!response.ok) throw new Error(responseErrorMessage(data) || `Request failed (${response.status}).`)
      availableModels = extractModelIds(data)
      if (!availableModels.length) throw new Error('The service returned no models.')
      saveSettings()
    } catch (cause) {
      availableModels = []
      modelsError = cause instanceof Error ? cause.message : 'Could not load models.'
    } finally {
      modelsLoading = false
    }
  }

  async function requestResponse(nextMessages: Message[]) {
    error = ''
    copiedMessage = null
    loading = true
    await showMessages(nextMessages)

    try {
      const response = await fetch(responsesUrl(baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim(),
          input: nextMessages.map(({ role, content }) => ({ role, content })),
          stream: true,
          ...(systemPrompt.trim() ? { instructions: systemPrompt.trim() } : {}),
          ...(showReasoning ? { reasoning: { summary: 'auto' } } : {}),
        }),
      })
      if (!response.ok) {
        const data = await readResponseJson(response).catch((): unknown => undefined)
        throw new Error(responseErrorMessage(data) || `Request failed (${response.status}).`)
      }

      if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        let reply = ''
        let reasoning = ''
        for await (const event of responseDeltas(response.body)) {
          if (event.type === 'reasoning') {
            if (!showReasoning) continue
            reasoning += event.delta
          } else {
            reply += event.delta
          }
          await showMessages([...nextMessages, { role: 'assistant', content: reply, reasoning }])
        }
        if (!reply) throw new Error('The service returned an empty response.')
      } else {
        const data = await readResponseJson(response).catch((): unknown => undefined)
        await showMessages([...nextMessages, {
          role: 'assistant',
          content: extractResponseText(data),
          reasoning: showReasoning ? extractResponseReasoning(data) : '',
        }])
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Request failed. Please try again.'
    } finally {
      loading = false
    }
  }

  async function sendMessage() {
    const content = prompt.trim()
    if (!content || loading || !requestReady()) return

    const nextMessages: Message[] = [...messages, { role: 'user', content }]
    prompt = ''
    await tick()
    resizeTextarea(textarea)
    await requestResponse(nextMessages)
  }

  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content)
      copiedMessage = index
      setTimeout(() => {
        if (copiedMessage === index) copiedMessage = null
      }, 1500)
    } catch {
      error = 'Could not copy this message.'
    }
  }

  async function regenerateMessage(index: number) {
    if (loading || editingMessage !== null || messages[index]?.role !== 'assistant' || messages[index - 1]?.role !== 'user' || !requestReady()) return
    await requestResponse(messages.slice(0, index))
  }

  async function editMessage(index: number) {
    const message = messages[index]
    if (loading || message?.role !== 'user') return
    editingMessage = index
    editPrompt = message.content
    error = ''
    copiedMessage = null
    await tick()
    editTextarea.focus()
    resizeTextarea(editTextarea)
  }

  function cancelEdit() {
    editingMessage = null
    editPrompt = ''
  }

  async function saveEdit(index: number) {
    const content = editPrompt.trim()
    if (!content || loading || messages[index]?.role !== 'user' || !requestReady()) return
    if (content === messages[index].content) {
      cancelEdit()
      return
    }
    cancelEdit()
    await requestResponse([...messages.slice(0, index), { role: 'user', content }])
  }

  function newChat() {
    messages = []
    prompt = ''
    error = ''
    cancelEdit()
  }
</script>

<svelte:head>
  <title>Saga — AI assistant</title>
  <meta name="description" content="A focused, private AI conversation interface." />
</svelte:head>

<div class="app-shell" class:settings-page={page === 'settings'}>
  <header class="topbar">
    <button class="brand" type="button" aria-label="Back to chat" onclick={() => (page = 'chat')}>
      <span class="brand-mark" aria-hidden="true"></span>
      <span>Saga</span>
    </button>

    {#if page === 'chat'}
      <div class="top-actions">
        <button class="icon-button" type="button" aria-label="New chat" title="New chat" onclick={newChat}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
        </button>
        <button class="icon-button" type="button" aria-label="Open Settings" title="Settings" onclick={() => (page = 'settings')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>
        </button>
      </div>
    {/if}
  </header>

  {#if page === 'chat'}
    <main class="chat" class:has-messages={messages.length > 0}>
      {#if messages.length === 0}
        <section class="welcome" aria-labelledby="welcome-title">
          <h1 id="welcome-title">How can I help?</h1>
          <p>Ask a question, explore an idea, or get something done.</p>
        </section>
      {:else}
        <section class="messages" aria-live="polite">
          {#each messages as message, index}
            <article class:assistant={message.role === 'assistant'} class:user={message.role === 'user'}>
              {#if message.role === 'assistant'}
                <span class="avatar" aria-hidden="true"></span>
              {/if}
              <div class="message-block" class:editing={message.role === 'user' && editingMessage === index}>
                {#if message.role === 'user' && editingMessage === index}
                  <textarea
                    class="message-editor"
                    bind:this={editTextarea}
                    bind:value={editPrompt}
                    aria-label="Edit message"
                    rows="1"
                    oninput={(event) => resizeTextarea(event.currentTarget)}
                  ></textarea>
                  <div class="edit-actions">
                    <button type="button" onclick={cancelEdit}>Cancel</button>
                    <button class="save-edit" type="button" disabled={!editPrompt.trim() || loading} onclick={() => saveEdit(index)}>Save & submit</button>
                  </div>
                {:else}
                  <div class="message-content">
                    {#if message.reasoning}
                      <details class="reasoning" open={loading && message === messages[messages.length - 1]}>
                        <summary>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>Reasoning
                        </summary>
                        <div>{message.reasoning}</div>
                      </details>
                    {/if}
                    {message.content}
                  </div>
                  <div class="message-actions">
                    <button type="button" onclick={() => copyMessage(message.content, index)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>
                      {copiedMessage === index ? 'Copied' : 'Copy'}
                    </button>
                    {#if message.role === 'assistant'}
                      <button type="button" disabled={loading || editingMessage !== null} onclick={() => regenerateMessage(index)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
                        Regenerate
                      </button>
                    {:else}
                      <button type="button" disabled={loading || editingMessage !== null} onclick={() => editMessage(index)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                        Edit
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </article>
          {/each}
          {#if loading && messages[messages.length - 1]?.role !== 'assistant'}
            <article class="assistant">
              <span class="avatar" aria-hidden="true"></span>
              <div class="typing" aria-label="AI is responding"><i></i><i></i><i></i></div>
            </article>
          {/if}
          <div bind:this={messageEnd}></div>
        </section>
      {/if}
    </main>

    <div class="composer-area">
      <form class="composer" bind:this={form} onsubmit={(event) => { event.preventDefault(); sendMessage() }}>
        <textarea bind:this={textarea} bind:value={prompt} rows="1" aria-label="Message" placeholder="Message Saga" oninput={(event) => resizeTextarea(event.currentTarget)} onkeydown={handleKeydown}></textarea>
        <div class="composer-footer">
          <div class="model-picker" aria-label="Current model">
            <span>Model</span>
            <strong title={model.trim() || 'Not selected'}>{model.trim() || 'Not selected'}</strong>
          </div>
          <button class="send-button" type="submit" disabled={!prompt.trim() || loading} aria-label="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 19V5"/><path d="m6 11 6-6 6 6"/></svg>
          </button>
        </div>
      </form>
      {#if error}
        <p class="composer-error" role="alert">{error} {#if !apiKey.trim() || !baseUrl.trim()}<button type="button" onclick={() => (page = 'settings')}>Open Settings</button>{/if}</p>
      {/if}
    </div>
  {:else}
    <main class="settings">
      <button class="back-button" type="button" onclick={() => (page = 'chat')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        Back to chat
      </button>

      <div class="settings-heading">
        <h1>Settings</h1>
        <p>Changes save automatically.</p>
      </div>

      <form class="settings-form" oninput={saveSettings}>
        <section class="settings-card" aria-labelledby="appearance-title">
          <div class="setting-copy">
            <h2 id="appearance-title">Appearance</h2>
            <p>Choose how Saga looks on this device.</p>
          </div>
          <div class="theme-picker" aria-label="Theme">
            <button class:active={theme === 'system'} type="button" onclick={() => chooseTheme('system')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              System
            </button>
            <button class:active={theme === 'light'} type="button" onclick={() => chooseTheme('light')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              Light
            </button>
            <button class:active={theme === 'dark'} type="button" onclick={() => chooseTheme('dark')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 15.3A9 9 0 0 1 8.7 3.2 9 9 0 1 0 20.8 15.3Z"/></svg>
              Dark
            </button>
          </div>
        </section>

        <section class="settings-card connection" aria-labelledby="connection-title">
          <div class="setting-copy">
            <h2 id="connection-title">API connection</h2>
            <p>Credentials stay in your browser and are sent only to your Base URL.</p>
          </div>
          <div class="fields">
            <div class="field">
              <label for="api-key"><span>API Key</span></label>
              <div class="input-with-action">
                <input id="api-key" type={showApiKey ? 'text' : 'password'} bind:value={apiKey} placeholder="sk-••••••••••••••••" autocomplete="off" />
                <button
                  type="button"
                  aria-label={showApiKey ? 'Hide API Key' : 'Show API Key'}
                  aria-pressed={showApiKey}
                  title={showApiKey ? 'Hide API Key' : 'Show API Key'}
                  onclick={() => (showApiKey = !showApiKey)}
                >
                  {#if showApiKey}
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>
                  {:else}
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/><path d="M6.7 6.7C4.3 8.2 2 12 2 12s3.5 6 10 6c1.9 0 3.6-.5 5-1.3"/><path d="M10.7 6.1c.4-.1.8-.1 1.3-.1 6.5 0 10 6 10 6a18 18 0 0 1-2.1 2.8"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/></svg>
                  {/if}
                </button>
              </div>
              <small>Stored locally on this device.</small>
            </div>
            <label>
              <span>Base URL</span>
              <input type="url" bind:value={baseUrl} placeholder="https://api.openai.com/v1" spellcheck="false" />
              <small>Requests are sent to <code>/responses</code>.</small>
            </label>
            <div class="model-field">
              <label for="model-input"><span>Model</span></label>
              <div class="model-input-row">
                <div
                  class="model-select"
                  onfocusout={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) modelsOpen = false
                  }}
                >
                  <input
                    id="model-input"
                    type="text"
                    bind:value={model}
                    placeholder="Model ID"
                    autocomplete="off"
                    spellcheck="false"
                    onkeydown={(event) => {
                      if (event.key === 'Escape') modelsOpen = false
                      if (event.key === 'ArrowDown' && availableModels.length) {
                        event.preventDefault()
                        modelsOpen = true
                      }
                    }}
                  />
                  <button
                    class="model-select-toggle"
                    type="button"
                    disabled={!availableModels.length}
                    aria-label={modelsOpen ? 'Hide model list' : 'Show model list'}
                    aria-expanded={modelsOpen}
                    aria-controls="model-options"
                    onclick={() => (modelsOpen = !modelsOpen)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
                  </button>
                  {#if modelsOpen}
                    <div
                      id="model-options"
                      class="model-options"
                      role="listbox"
                      tabindex="-1"
                      aria-label="Available models"
                      onkeydown={(event) => {
                        if (event.key === 'Escape') modelsOpen = false
                      }}
                    >
                      {#each availableModels as availableModel}
                        <button
                          class:selected={availableModel === model}
                          type="button"
                          role="option"
                          aria-selected={availableModel === model}
                          onclick={() => {
                            model = availableModel
                            modelsOpen = false
                            saveSettings()
                          }}
                        >{availableModel}</button>
                      {/each}
                    </div>
                  {/if}
                </div>
                <button
                  class="refresh-models"
                  class:loading={modelsLoading}
                  type="button"
                  disabled={!apiKey.trim() || !baseUrl.trim() || modelsLoading}
                  aria-label={modelsLoading ? 'Refreshing model list' : 'Refresh model list'}
                  aria-busy={modelsLoading}
                  title="Refresh model list"
                  onclick={refreshModels}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-4"/><path d="M4 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 4"/><path d="M20 20v-6h-6"/></svg>
                </button>
              </div>
              {#if modelsError}
                <small class="field-error" role="alert">{modelsError}</small>
              {:else if availableModels.length}
                <small>{availableModels.length} models available. Choose one or enter a model ID.</small>
              {:else}
                <small>Enter a model ID, or refresh the list after adding an API Key and Base URL.</small>
              {/if}
            </div>
            <label class="reasoning-toggle">
              <input type="checkbox" bind:checked={showReasoning} />
              <span>Show reasoning summaries<small>Available for supported reasoning models.</small></span>
            </label>
          </div>
        </section>

        <section class="settings-card" aria-labelledby="system-prompt-title">
          <div class="setting-copy">
            <h2 id="system-prompt-title">System prompt</h2>
            <p>Set instructions that apply to every response.</p>
          </div>
          <div class="fields">
            <label>
              <span>Instructions</span>
              <textarea bind:value={systemPrompt} rows="6" placeholder="You are a helpful assistant."></textarea>
              <small>Sent as the Responses API <code>instructions</code> parameter.</small>
            </label>
          </div>
        </section>

      </form>
    </main>
  {/if}
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="page-scrollbar"
  class:visible={scrollable}
  bind:this={scrollbar}
  aria-hidden="true"
  onpointerdown={startScrollbarDrag}
  onpointermove={(event) => scrollFromPointer(event.clientY)}
  onpointerup={stopScrollbarDrag}
  onpointercancel={stopScrollbarDrag}
>
  <div
    class="page-scrollbar-thumb"
    style:height={`${scrollThumbHeight}px`}
    style:transform={`translateY(${scrollThumbTop}px)`}
  ></div>
</div>
