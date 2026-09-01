<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { extractResponseText, responsesUrl, responseTextDeltas } from './lib/responses'

  type Theme = 'system' | 'light' | 'dark'
  type Message = { role: 'user' | 'assistant'; content: string }

  const storageKey = 'saga-settings'

  let page: 'chat' | 'settings' = 'chat'
  let theme: Theme = 'system'
  let apiKey = ''
  let baseUrl = ''
  let model = ''
  let prompt = ''
  let messages: Message[] = []
  let loading = false
  let error = ''
  let saved = false
  let form: HTMLFormElement
  let textarea: HTMLTextAreaElement
  let messageEnd: HTMLDivElement

  onMount(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}')
      theme = stored.theme || 'system'
      apiKey = stored.apiKey || ''
      baseUrl = stored.baseUrl || baseUrl
      model = stored.model || ''
    } catch {
      // Ignore malformed local preferences and keep safe defaults.
    }
    applyTheme(theme)
  })

  function applyTheme(value: Theme) {
    if (value === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = value
  }

  function chooseTheme(value: Theme) {
    theme = value
    applyTheme(value)
  }

  function saveSettings() {
    baseUrl = baseUrl.trim().replace(/\/+$/, '')
    model = model.trim()
    localStorage.setItem(storageKey, JSON.stringify({ theme, apiKey: apiKey.trim(), baseUrl, model }))
    saved = true
    setTimeout(() => (saved = false), 1800)
  }

  function resizeComposer() {
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
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

  async function sendMessage() {
    const content = prompt.trim()
    if (!content || loading) return
    if (!apiKey.trim() || !baseUrl.trim()) {
      error = 'Add an API Key and Base URL in Settings first.'
      return
    }
    if (!model.trim()) {
      error = 'Select a model before sending a message.'
      return
    }

    const nextMessages: Message[] = [...messages, { role: 'user', content }]
    prompt = ''
    error = ''
    loading = true
    await showMessages(nextMessages)
    resizeComposer()

    try {
      const response = await fetch(responsesUrl(baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({ model: model.trim(), input: nextMessages, stream: true }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error?.message || `Request failed (${response.status}).`)
      }

      if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        let reply = ''
        for await (const delta of responseTextDeltas(response.body)) {
          reply += delta
          await showMessages([...nextMessages, { role: 'assistant', content: reply }])
        }
        if (!reply) throw new Error('The service returned an empty response.')
      } else {
        const data = await response.json().catch(() => ({}))
        await showMessages([...nextMessages, { role: 'assistant', content: extractResponseText(data) }])
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Request failed. Please try again.'
    } finally {
      loading = false
    }
  }

  function newChat() {
    messages = []
    prompt = ''
    error = ''
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
          {#each messages as message}
            <article class:assistant={message.role === 'assistant'} class:user={message.role === 'user'}>
              {#if message.role === 'assistant'}
                <span class="avatar" aria-hidden="true"></span>
              {/if}
              <div class="message-content">{message.content}</div>
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
        <textarea bind:this={textarea} bind:value={prompt} rows="1" aria-label="Message" placeholder="Message Saga" oninput={resizeComposer} onkeydown={handleKeydown}></textarea>
        <div class="composer-footer">
          {#if apiKey.trim() && baseUrl.trim()}
            <label class="model-picker">
              <span>Model</span>
              <input
                type="text"
                bind:value={model}
                placeholder="Select model"
                aria-label="Model"
                autocomplete="off"
                spellcheck="false"
                onblur={saveSettings}
                onkeydown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }}
              />
            </label>
          {/if}
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
      </div>

      <form class="settings-form" onsubmit={(event) => { event.preventDefault(); saveSettings() }}>
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
            <label>
              <span>API Key</span>
              <input type="password" bind:value={apiKey} placeholder="sk-••••••••••••••••" autocomplete="off" />
              <small>Stored locally on this device.</small>
            </label>
            <label>
              <span>Base URL</span>
              <input type="url" bind:value={baseUrl} placeholder="https://api.openai.com/v1" spellcheck="false" />
              <small>Requests are sent to <code>/responses</code>.</small>
            </label>
            <label>
              <span>Model</span>
              <input type="text" bind:value={model} placeholder="Model ID" autocomplete="off" spellcheck="false" />
              <small>Sent as the Responses API <code>model</code> parameter.</small>
            </label>
          </div>
        </section>

        <div class="save-row">
          <span class:visible={saved} role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
            Settings saved
          </span>
          <button class="primary-button" type="submit">Save changes</button>
        </div>
      </form>
    </main>
  {/if}
</div>
