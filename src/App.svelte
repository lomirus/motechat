<script lang="ts">
  import { onMount, tick } from 'svelte'
  import Select from './lib/Select.svelte'
  import { createConnection, parseConnections, type Connection } from './lib/connections'
  import {
    activeFields,
    comboKey,
    combos,
    createCollection,
    createField,
    createOption,
    parseCollections,
    resolveConnectionId,
    selectedOptionIds,
    type Collection,
    type CollectionField,
  } from './lib/collections'
  import { createProfile, parseProfiles, type Profile } from './lib/profiles'
  import {
    extractModelIds,
    extractResponseReasoning,
    extractResponseText,
    extractUsage,
    formatMoney,
    addUsage,
    usageCost,
    usageParts,
    usageRing,
    isRecord,
    modelsUrl,
    outputSpeed,
    parseJson,
    readResponseJson,
    responseErrorMessage,
    responsesUrl,
    responseDeltas,
    toResponseInput,
    imageFileError,
    reasoningConfig,
    type Currency,
    type ReasoningEffort,
    type TokenUsage,
  } from './lib/responses'

  type Theme = 'system' | 'light' | 'dark'
  type Message = { role: 'user' | 'assistant'; content: string; images?: string[]; reasoning?: string; tokensPerSecond?: number; timeToFirstToken?: number }

  const storageKey = 'saga-settings'
  const maxPendingImages = 8
  const contextRing = 2 * Math.PI * 9
  const usageLabels: Record<string, string> = {
    cached: 'Cached',
    input: 'Input',
    reasoning: 'Reasoning',
    output: 'Output',
  }
  const reasoningEffortOptions: [ReasoningEffort | '', string][] = [
    ['', 'Default'],
    ['none', 'None'],
    ['minimal', 'Minimal'],
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
    ['xhigh', 'Extra High'],
    ['max', 'Max'],
  ]

  let page: 'chat' | 'settings' = 'chat'
  let theme: Theme = 'system'
  let connections: Connection[] = parseConnections({}).connections
  let activeConnectionId = connections[0].id
  let connectionName = connections[0].name
  let apiKey = ''
  let baseUrl = ''
  let model = ''
  let contextLength: number | null = null
  let currency: Currency = 'CNY'
  let cacheHitPrice: number | null = null
  let cacheMissPrice: number | null = null
  let outputPrice: number | null = null
  let collections: Collection[] = parseCollections({}, connections.map((connection) => connection.id)).collections
  let activeCollectionId = collections[0].id
  $: activeCollection = collections.find((collection) => collection.id === activeCollectionId)
  let tokenUsage: TokenUsage | undefined = undefined
  let chatUsage: TokenUsage | undefined = undefined
  let pendingUsage: TokenUsage | undefined = undefined
  let availableModels: string[] = []
  let modelsLoading = false
  let modelsError = ''
  let profiles: Profile[] = [{ id: 'default', name: 'Default', systemPrompt: '', icon: '' }]
  let activeProfileId = 'default'
  let profileName = 'Default'
  let profileIcon = ''
  let iconError = ''
  let profileMenuOpen = false
  let systemPrompt = ''
  let showApiKey = false
  let reasoningEffort: ReasoningEffort | '' = ''
  let prompt = ''
  let pendingImages: string[] = []
  let editImages: string[] = []
  let imageTarget: 'pending' | 'edit' = 'pending'
  let attaching = false
  let dragging = false
  let messages: Message[] = []
  let loading = false
  let error = ''
  let copiedMessage: number | null = null
  let editingMessage: number | null = null
  let editPrompt = ''
  let form: HTMLFormElement
  let fileInput: HTMLInputElement
  let iconInput: HTMLInputElement
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
        const parsedProfiles = parseProfiles(stored)
        profiles = parsedProfiles.profiles
        activeProfileId = parsedProfiles.activeProfileId
        loadActiveProfile()
        const parsedConnections = parseConnections(stored)
        connections = parsedConnections.connections
        activeConnectionId = parsedConnections.activeConnectionId
        loadActiveConnection()
        const parsedCollections = parseCollections(stored, [activeConnectionId, ...connections.map((connection) => connection.id)])
        collections = parsedCollections.collections
        activeCollectionId = parsedCollections.activeCollectionId
        applyCollection()
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

  function readPrice(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  }

  function modelPrices() {
    return {
      cacheHit: readPrice(cacheHitPrice) ?? 0,
      cacheMiss: readPrice(cacheMissPrice) ?? 0,
      output: readPrice(outputPrice) ?? 0,
    }
  }

  function priceUnit() {
    return currency === 'USD' ? '$ / 1M tokens' : '¥ / 1M tokens'
  }

  function applyTheme(value: Theme) {
    if (value === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = value
  }

  function chooseTheme(value: Theme) {
    theme = value
    applyTheme(value)
    saveSettings()
  }

  function chooseCurrency(value: Currency) {
    currency = value
    saveSettings()
  }

  function persistActiveConnection() {
    connections = connections.map((connection) => connection.id === activeConnectionId
      ? {
          ...connection,
          name: connectionName.trim() || connection.name,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim().replace(/\/+$/, ''),
          model: model.trim(),
          contextLength: typeof contextLength === 'number' && contextLength > 0 ? Math.floor(contextLength) : null,
          currency,
          cacheHitPrice: readPrice(cacheHitPrice),
          cacheMissPrice: readPrice(cacheMissPrice),
          outputPrice: readPrice(outputPrice),
          availableModels,
          reasoningEffort,
        }
      : connection)
  }

  function loadActiveConnection() {
    const active = connections.find((connection) => connection.id === activeConnectionId) ?? connections[0]
    activeConnectionId = active.id
    connectionName = active.name
    apiKey = active.apiKey
    baseUrl = active.baseUrl
    model = active.model
    contextLength = active.contextLength
    currency = active.currency
    cacheHitPrice = active.cacheHitPrice
    cacheMissPrice = active.cacheMissPrice
    outputPrice = active.outputPrice
    availableModels = active.availableModels
    reasoningEffort = active.reasoningEffort
    modelsLoading = false
    modelsError = ''
    showApiKey = false
  }

  function switchConnection(id: string) {
    if (id === activeConnectionId) return
    persistActiveConnection()
    activeConnectionId = id
    loadActiveConnection()
    saveSettings()
  }

  function addConnection() {
    persistActiveConnection()
    const connection = createConnection(connections)
    connections = [...connections, connection]
    activeConnectionId = connection.id
    loadActiveConnection()
    saveSettings()
  }

  function deleteConnection() {
    if (connections.length < 2 || !confirm(`Delete connection "${connectionName}"?`)) return
    const deletedId = activeConnectionId
    connections = connections.filter((connection) => connection.id !== deletedId)
    collections = collections.map((collection) => ({
      ...collection,
      mapping: Object.fromEntries(Object.entries(collection.mapping).filter(([, id]) => id !== deletedId)),
    }))
    loadActiveConnection()
    saveSettings()
  }

  function switchCollection(id: string) {
    if (id === activeCollectionId) return
    activeCollectionId = id
    applyCollection()
    saveSettings()
  }

  function addCollection() {
    const collection = createCollection(collections)
    collections = [...collections, collection]
    activeCollectionId = collection.id
    saveSettings()
  }

  function deleteCollection() {
    if (collections.length < 2 || !activeCollection || !confirm(`Delete collection "${activeCollection.name}"?`)) return
    collections = collections.filter((collection) => collection.id !== activeCollectionId)
    activeCollectionId = collections[0].id
    applyCollection()
    saveSettings()
  }

  function editCollection(change: (collection: Collection) => Collection) {
    collections = collections.map((collection) => collection.id === activeCollectionId ? change(collection) : collection)
  }

  function editField(fieldId: string, change: (field: CollectionField) => CollectionField) {
    editCollection((collection) => ({
      ...collection,
      fields: collection.fields.map((field) => field.id === fieldId ? change(field) : field),
    }))
  }

  function mapCombo(key: string, connectionId: string) {
    editCollection((collection) => {
      const mapping = { ...collection.mapping }
      if (connectionId) mapping[key] = connectionId
      else delete mapping[key]
      return { ...collection, mapping }
    })
    applyCollection()
    saveSettings()
  }

  function chooseOption(fieldId: string, optionId: string) {
    editCollection((collection) => ({ ...collection, selected: { ...collection.selected, [fieldId]: optionId } }))
    applyCollection()
    saveSettings()
  }

  /** Switches the active connection to whatever the collection's current choices map to. */
  function applyCollection() {
    // `$: activeCollection` only refreshes after this handler returns, so look it up directly.
    const collection = collections.find((collection) => collection.id === activeCollectionId)
    if (!collection) return
    const connectionId = resolveConnectionId(collection)
    if (!connectionId || !connections.some((connection) => connection.id === connectionId)) {
      error = 'No connection is mapped to this combination yet. Set one in Settings.'
      return
    }
    error = ''
    switchConnection(connectionId)
  }

  function persistActiveProfile() {
    profiles = profiles.map((profile) => profile.id === activeProfileId
      ? { ...profile, name: profileName.trim() || profile.name, systemPrompt: systemPrompt.trim(), icon: profileIcon }
      : profile)
  }

  function loadActiveProfile() {
    const active = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0]
    activeProfileId = active.id
    profileName = active.name
    profileIcon = active.icon
    systemPrompt = active.systemPrompt
    iconError = ''
  }

  function switchProfile(id: string) {
    if (id === activeProfileId) return
    persistActiveProfile()
    activeProfileId = id
    loadActiveProfile()
    saveSettings()
  }

  function addProfile() {
    persistActiveProfile()
    const profile = createProfile(profiles)
    profiles = [...profiles, profile]
    activeProfileId = profile.id
    loadActiveProfile()
    saveSettings()
  }

  function deleteProfile() {
    if (profiles.length < 2 || !confirm(`Delete profile "${profileName}"?`)) return
    profiles = profiles.filter((profile) => profile.id !== activeProfileId)
    loadActiveProfile()
    saveSettings()
  }

  function saveSettings() {
    persistActiveProfile()
    persistActiveConnection()
    localStorage.setItem(storageKey, JSON.stringify({
      theme,
      connections,
      activeConnectionId,
      collections,
      activeCollectionId,
      profiles,
      activeProfileId,
    }))
  }

  function resizeTextarea(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`
  }

  function readImage(file: File) {
    const problem = imageFileError(file)
    if (problem) return Promise.reject(new Error(problem))
    // ponytail: data URLs keep preview and payload as one string; 8×10MB ceiling. Upgrade: POST /files and send file_id.
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read this image.'))
      reader.onerror = () => reject(new Error('Could not read this image.'))
      reader.readAsDataURL(file)
    })
  }

  const profileIconSize = 128

  function readIcon(file: File) {
    return readImage(file).then((src) => new Promise<string>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = profileIconSize
        canvas.height = profileIconSize
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(src)
        const scale = Math.max(profileIconSize / image.width, profileIconSize / image.height)
        const width = image.width * scale
        const height = image.height * scale
        ctx.drawImage(image, (profileIconSize - width) / 2, (profileIconSize - height) / 2, width, height)
        resolve(canvas.toDataURL('image/png'))
      }
      image.onerror = () => reject(new Error('Could not read this image.'))
      image.src = src
    }))
  }

  async function setProfileIcon(files: File[]) {
    const file = files[0]
    if (!file) return
    try {
      profileIcon = await readIcon(file)
      iconError = ''
      saveSettings()
    } catch (cause) {
      iconError = cause instanceof Error ? cause.message : 'Could not add this image.'
    }
  }

  async function addImages(files: File[], into: 'pending' | 'edit' = 'pending') {
    if (!files.length) return
    attaching = true
    try {
      let next = [...(into === 'edit' ? editImages : pendingImages)]
      for (const file of files) {
        if (next.length >= maxPendingImages) {
          error = `You can attach up to ${maxPendingImages} images.`
          break
        }
        next = [...next, await readImage(file)]
        if (into === 'edit') editImages = next
        else pendingImages = next
        error = ''
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not add this image.'
    } finally {
      attaching = false
    }
  }

  function removeImage(index: number, into: 'pending' | 'edit' = 'pending') {
    if (into === 'edit') editImages = editImages.filter((_, imageIndex) => imageIndex !== index)
    else pendingImages = pendingImages.filter((_, imageIndex) => imageIndex !== index)
  }

  function handlePaste(event: ClipboardEvent, into: 'pending' | 'edit' = 'pending') {
    const files = [...(event.clipboardData?.files ?? [])]
    if (!files.length) return
    if (!event.clipboardData?.getData('text/plain')) event.preventDefault()
    addImages(files, into)
  }

  function pickImages(into: 'pending' | 'edit') {
    imageTarget = into
    fileInput.click()
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

  function handleKeydown(event: KeyboardEvent, submit = () => form.requestSubmit()) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  async function showMessages(next: Message[]) {
    const wasAtBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
    messages = next
    await tick()
    if (wasAtBottom) messageEnd?.scrollIntoView()
  }

  function contextLimit() {
    return typeof contextLength === 'number' && contextLength > 0 ? Math.floor(contextLength) : 0
  }

  function contextMeter(usage: TokenUsage | undefined, length: number | null) {
    const used = usage?.total ?? 0
    const limit = typeof length === 'number' && length > 0 ? Math.floor(length) : 0
    const ratio = limit ? Math.min(1, used / limit) : 0
    const percent = Math.round(ratio * 100)
    const parts = usageParts(usage)
    const prices = modelPrices()
    return {
      used,
      limit,
      ratio,
      percent,
      parts,
      ring: usageRing(parts, limit, contextRing),
      barFill: limit ? percent : used ? 100 : 0,
      cost: usageCost(usage, prices),
      total: usageCost(addUsage(chatUsage, pendingUsage), prices),
    }
  }

  function messageTiming({ tokensPerSecond, timeToFirstToken }: Message) {
    const parts = []
    if (tokensPerSecond) parts.push(`${tokensPerSecond.toFixed(1)} tokens/s`)
    if (timeToFirstToken != null) {
      parts.push(`${timeToFirstToken >= 1000 ? `${(timeToFirstToken / 1000).toFixed(1)}s` : `${Math.round(timeToFirstToken)}ms`} to first token`)
    }
    return parts.join(' · ')
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
    const requestedId = activeConnectionId
    modelsLoading = true
    modelsError = ''

    try {
      const response = await fetch(modelsUrl(baseUrl), {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      })
      const data = await readResponseJson(response).catch((): unknown => undefined)
      if (!response.ok) throw new Error(responseErrorMessage(data) || `Request failed (${response.status}).`)
      if (activeConnectionId !== requestedId) return
      availableModels = extractModelIds(data)
      if (!availableModels.length) throw new Error('The service returned no models.')
      saveSettings()
    } catch (cause) {
      if (activeConnectionId !== requestedId) return
      availableModels = []
      modelsError = cause instanceof Error ? cause.message : 'Could not load models.'
    } finally {
      if (activeConnectionId === requestedId) modelsLoading = false
    }
  }

  async function requestResponse(nextMessages: Message[]) {
    error = ''
    copiedMessage = null
    loading = true
    pendingUsage = undefined
    await showMessages(nextMessages)
    const requestedAt = performance.now()

    try {
      const reasoning = reasoningConfig(reasoningEffort)
      const response = await fetch(responsesUrl(baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim(),
          input: toResponseInput(nextMessages),
          stream: true,
          ...(systemPrompt.trim() ? { instructions: systemPrompt.trim() } : {}),
          ...(reasoning ? { reasoning } : {}),
        }),
      })
      if (!response.ok) {
        const data = await readResponseJson(response).catch((): unknown => undefined)
        throw new Error(responseErrorMessage(data) || `Request failed (${response.status}).`)
      }

      if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        let reply = ''
        let reasoning = ''
        let tokens = 0
        let startedAt = 0
        let countedFromUsage = false
        let tokensPerSecond: number | undefined
        let timeToFirstToken: number | undefined
        const assistant = () => ({ role: 'assistant' as const, content: reply, reasoning, tokensPerSecond, timeToFirstToken })
        for await (const event of responseDeltas(response.body)) {
          if (event.type === 'usage') {
            tokenUsage = event.usage
            pendingUsage = event.usage
            if (event.usage.output) {
              countedFromUsage = true
              tokens = event.usage.output
            }
          } else {
            if (!startedAt) startedAt = performance.now()
            if (!countedFromUsage) tokens += 1
            if (event.type === 'reasoning') reasoning += event.delta
            else reply += event.delta
            if (timeToFirstToken === undefined) timeToFirstToken = performance.now() - requestedAt
          }
          tokensPerSecond = startedAt ? outputSpeed(tokens, performance.now() - startedAt) : undefined
          await showMessages([...nextMessages, assistant()])
        }
        if (!reply) throw new Error('The service returned an empty response.')
      } else {
        const data = await readResponseJson(response).catch((): unknown => undefined)
        tokenUsage = extractUsage(data)
        pendingUsage = tokenUsage
        await showMessages([...nextMessages, {
          role: 'assistant',
          content: extractResponseText(data),
          reasoning: extractResponseReasoning(data),
        }])
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Request failed. Please try again.'
    } finally {
      if (pendingUsage) chatUsage = addUsage(chatUsage, pendingUsage)
      pendingUsage = undefined
      loading = false
    }
  }

  async function sendMessage() {
    const content = prompt.trim()
    if ((!content && !pendingImages.length) || loading || attaching || !requestReady()) return

    const nextMessages: Message[] = [...messages, {
      role: 'user',
      content,
      ...(pendingImages.length ? { images: pendingImages } : {}),
    }]
    prompt = ''
    pendingImages = []
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
    editImages = [...(message.images ?? [])]
    error = ''
    copiedMessage = null
    await tick()
    editTextarea.focus()
    resizeTextarea(editTextarea)
  }

  function cancelEdit() {
    editingMessage = null
    editPrompt = ''
    editImages = []
  }

  async function saveEdit(index: number) {
    const content = editPrompt.trim()
    const images = [...editImages]
    const previous = messages[index]?.images ?? []
    if ((!content && !images.length) || loading || attaching || messages[index]?.role !== 'user' || !requestReady()) return
    if (content === messages[index].content && images.length === previous.length && images.every((src, imageIndex) => src === previous[imageIndex])) {
      cancelEdit()
      return
    }
    cancelEdit()
    await requestResponse([...messages.slice(0, index), { role: 'user', content, ...(images.length ? { images } : {}) }])
  }

  function newChat() {
    messages = []
    prompt = ''
    pendingImages = []
    error = ''
    tokenUsage = undefined
    chatUsage = undefined
    pendingUsage = undefined
    profileMenuOpen = false
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
        <button class="icon-button" type="button" aria-label="Open Settings" title="Settings" onclick={() => { profileMenuOpen = false; page = 'settings' }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>
        </button>
      </div>
    {/if}
  </header>

  {#if page === 'chat'}
    <main class="chat" class:has-messages={messages.length > 0} class:has-attachments={pendingImages.length > 0}>
      {#if messages.length === 0}
        <section class="welcome" aria-labelledby="welcome-title">
          <h1 id="welcome-title">How can I help?</h1>
          <p>Ask a question, explore an idea, or get something done.</p>
          <div
            class="welcome-profile"
            onfocusout={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) profileMenuOpen = false
            }}
          >
            <button
              type="button"
              disabled={profiles.length < 2}
              aria-label="Profile: {profileName}"
              aria-haspopup="listbox"
              aria-expanded={profileMenuOpen}
              aria-controls="welcome-profile-options"
              onclick={() => (profileMenuOpen = !profileMenuOpen)}
            >
              {profileName}
              {#if profiles.length > 1}
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
              {/if}
            </button>
            {#if profileMenuOpen}
              <div
                id="welcome-profile-options"
                class="welcome-profile-list"
                role="listbox"
                tabindex="-1"
                aria-label="Profiles"
                onkeydown={(event) => {
                  if (event.key === 'Escape') profileMenuOpen = false
                }}
              >
                {#each profiles as profile}
                  <button
                    class:selected={profile.id === activeProfileId}
                    type="button"
                    role="option"
                    aria-selected={profile.id === activeProfileId}
                    onclick={() => {
                      profileMenuOpen = false
                      switchProfile(profile.id)
                    }}
                  >{profile.name}</button>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      {:else}
        <section class="messages" aria-live="polite">
          {#each messages as message, index}
            <article class:assistant={message.role === 'assistant'} class:user={message.role === 'user'}>
              {#if message.role === 'assistant'}
                <span class="avatar" aria-hidden="true">
                  {#if profileIcon}<img src={profileIcon} alt="" />{/if}
                </span>
              {/if}
              <div class="message-block" class:editing={message.role === 'user' && editingMessage === index}>
                {#if message.role === 'user' && editingMessage === index}
                  {#if editImages.length}
                    <div class="composer-attachments">
                      {#each editImages as src, imageIndex}
                        <div class="composer-attachment">
                          <img src={src} alt="Attachment" />
                          <button type="button" aria-label="Remove image" onclick={() => removeImage(imageIndex, 'edit')}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      {/each}
                    </div>
                  {/if}
                  <textarea
                    class="message-editor"
                    bind:this={editTextarea}
                    bind:value={editPrompt}
                    aria-label="Edit message"
                    rows="1"
                    oninput={(event) => resizeTextarea(event.currentTarget)}
                    onkeydown={(event) => handleKeydown(event, () => saveEdit(index))}
                    onpaste={(event) => handlePaste(event, 'edit')}
                  ></textarea>
                  <div class="edit-actions">
                    <button
                      class="edit-attach"
                      type="button"
                      disabled={loading || attaching || editImages.length >= maxPendingImages}
                      aria-label="Add image"
                      title="Add image"
                      onclick={() => pickImages('edit')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>
                    </button>
                    <button type="button" onclick={cancelEdit}>Cancel</button>
                    <button class="save-edit" type="button" disabled={(!editPrompt.trim() && !editImages.length) || loading || attaching} onclick={() => saveEdit(index)}>Save & submit</button>
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
                    {#if message.images?.length}
                      <div class="message-images">
                        {#each message.images as src}
                          <img src={src} alt="Attachment" />
                        {/each}
                      </div>
                    {/if}
                    {#if message.content}<div class="message-text">{message.content}</div>{/if}
                  </div>
                  {#if message.role === 'assistant'}
                    {@const timing = messageTiming(message)}
                    {#if timing}
                      <p class="message-speed">{timing}</p>
                    {/if}
                  {/if}
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
              <span class="avatar" aria-hidden="true">
                {#if profileIcon}<img src={profileIcon} alt="" />{/if}
              </span>
              <div class="typing" aria-label="AI is responding"><i></i><i></i><i></i></div>
            </article>
          {/if}
          <div bind:this={messageEnd}></div>
        </section>
      {/if}
    </main>

    <div class="composer-area">
      <form
        class="composer"
        class:dragging
        bind:this={form}
        onsubmit={(event) => { event.preventDefault(); sendMessage() }}
        ondragover={(event) => { event.preventDefault(); dragging = true }}
        ondragleave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dragging = false }}
        ondrop={(event) => { event.preventDefault(); dragging = false; addImages([...(event.dataTransfer?.files ?? [])]) }}
      >
        <input
          bind:this={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onchange={(event) => {
            addImages([...(event.currentTarget.files ?? [])], imageTarget)
            event.currentTarget.value = ''
          }}
        />
        {#if pendingImages.length}
          <div class="composer-attachments">
            {#each pendingImages as src, index}
              <div class="composer-attachment">
                <img src={src} alt="Attachment" />
                <button type="button" aria-label="Remove image" onclick={() => removeImage(index)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
        <textarea bind:this={textarea} bind:value={prompt} rows="1" aria-label="Message" placeholder="Message Saga" oninput={(event) => resizeTextarea(event.currentTarget)} onkeydown={handleKeydown} onpaste={handlePaste}></textarea>
        <div class="composer-footer">
          <button
            class="attach-button"
            type="button"
            disabled={loading || attaching || pendingImages.length >= maxPendingImages}
            aria-label="Add image"
            title="Add image"
            onclick={() => pickImages('pending')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>
          </button>
          <div class="collection-switch">
            <label for="switch-collection">Collection</label>
            <Select
              id="switch-collection"
              value={activeCollectionId}
              options={collections.map((collection): [string, string] => [collection.id, collection.name || 'Untitled'])}
              listLabel="Collections"
              listName="collection list"
              onchange={switchCollection}
            />
          </div>
          {#if activeCollection}
            {@const chosen = selectedOptionIds(activeCollection)}
            {#each activeFields(activeCollection.fields) as field, index (field.id)}
              <div class="collection-switch">
                <label for="switch-{field.id}">{field.name}</label>
                <Select
                  id="switch-{field.id}"
                  value={chosen[index]}
                  options={field.options.map((option): [string, string] => [option.id, option.label || 'Untitled'])}
                  listLabel={field.name || 'Options'}
                  listName="{field.name || 'option'} list"
                  onchange={(optionId) => chooseOption(field.id, optionId)}
                />
              </div>
            {/each}
          {/if}
          <div class="composer-send">
            {#if true}
              {@const meter = contextMeter(tokenUsage, contextLength)}
              <span
                class="context-meter"
                class:warn={meter.ratio >= 0.8}
                class:alert={meter.ratio >= 0.95}
                role="meter"
                aria-label="Context used"
                aria-valuemin={0}
                aria-valuemax={meter.limit || undefined}
                aria-valuenow={meter.used}
                aria-valuetext={meter.limit ? `${meter.percent}%` : 'Unlimited'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle class="track" cx="12" cy="12" r="9"></circle>
                  {#each meter.ring as seg}
                    <circle
                      class="seg {seg.key}"
                      cx="12"
                      cy="12"
                      r="9"
                      stroke-dasharray="{seg.dash} {contextRing}"
                      stroke-dashoffset={-seg.offset}
                    ></circle>
                  {/each}
                </svg>
                <span class="context-meter-tip">
                  <span class="context-meter-head">
                    <strong>{meter.limit ? `${meter.percent}%` : 'Unlimited'}</strong>
                    <span>{meter.limit
                      ? `${meter.used.toLocaleString()} / ${meter.limit.toLocaleString()}`
                      : `${meter.used.toLocaleString()} tokens`}</span>
                  </span>
                  <span class="context-meter-bar" style="--fill: {meter.barFill}%">
                    <span class="context-meter-fill">
                      {#each meter.parts as part}
                        {#if part.tokens}
                          <span class={part.key} style="flex: {part.tokens}"></span>
                        {/if}
                      {/each}
                    </span>
                  </span>
                  <span class="context-meter-legend">
                    {#each meter.parts as part}
                      <span>
                        <i class={part.key}></i>
                        {usageLabels[part.key]}
                        <b>{part.tokens.toLocaleString()}</b>
                      </span>
                    {/each}
                  </span>
                  <span class="context-meter-cost">
                    <span>Cost<b>{formatMoney(meter.cost, currency)}</b></span>
                    <span>Total<b>{formatMoney(meter.total, currency)}</b></span>
                  </span>
                </span>
              </span>
            {/if}
            <button class="send-button" type="submit" disabled={(!prompt.trim() && !pendingImages.length) || loading || attaching} aria-label="Send message">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 19V5"/><path d="m6 11 6-6 6 6"/></svg>
            </button>
          </div>
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
            <p>Create and switch connections. Credentials stay in your browser and are sent only to your Base URL.</p>
          </div>
          <div class="fields">
            <div class="model-field">
              <label for="connection-input"><span>Current connection</span></label>
              <div class="model-input-row">
                <Select
                  id="connection-input"
                  value={activeConnectionId}
                  options={connections.map((connection): [string, string] => [connection.id, connection.name])}
                  listLabel="Connections"
                  listName="connection list"
                  onchange={switchConnection}
                />
                <button
                  class="profile-action"
                  type="button"
                  aria-label="New connection"
                  title="New connection"
                  onclick={addConnection}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button
                  class="profile-action"
                  type="button"
                  disabled={connections.length < 2}
                  aria-label="Delete connection"
                  title="Delete connection"
                  onclick={deleteConnection}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>
            <label>
              <span>Name</span>
              <input bind:value={connectionName} placeholder="Connection name" />
            </label>
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
                <Select
                  id="model-input"
                  bind:value={model}
                  editable
                  placeholder="Model ID"
                  options={availableModels}
                  listLabel="Available models"
                  listName="model list"
                  onchange={saveSettings}
                />
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
            <div class="model-field">
              <label for="effort-input"><span>Thinking intensity</span></label>
              <Select
                id="effort-input"
                bind:value={reasoningEffort}
                options={reasoningEffortOptions}
                listLabel="Thinking intensity"
                listName="thinking intensity list"
                onchange={saveSettings}
              />
              <small>Sent as <code>reasoning.effort</code>. Supported values vary by model.</small>
            </div>
            <label>
              <span>Context length</span>
              <input id="context-length" type="number" min="1" step="1" bind:value={contextLength} placeholder="Unlimited" />
              <small>Model context window in tokens. Leave empty for unlimited context.</small>
            </label>
            <div class="model-field">
              <span class="field-label" id="currency-label">Currency</span>
              <div class="theme-picker pair" data-currency={currency} role="group" aria-labelledby="currency-label">
                <button class:active={currency === 'CNY'} type="button" onclick={() => chooseCurrency('CNY')}>CNY ¥</button>
                <button class:active={currency === 'USD'} type="button" onclick={() => chooseCurrency('USD')}>USD $</button>
              </div>
              <small>Used for model prices and the chat cost estimate.</small>
            </div>
            <label>
              <span>Cache hit input</span>
              <div class="input-with-action suffix">
                <input id="cache-hit-price" type="number" min="0" step="any" bind:value={cacheHitPrice} placeholder="0" />
                <span class="field-suffix">{priceUnit()}</span>
              </div>
            </label>
            <label>
              <span>Cache miss input</span>
              <div class="input-with-action suffix">
                <input id="cache-miss-price" type="number" min="0" step="any" bind:value={cacheMissPrice} placeholder="0" />
                <span class="field-suffix">{priceUnit()}</span>
              </div>
            </label>
            <label>
              <span>Output</span>
              <div class="input-with-action suffix">
                <input id="output-price" type="number" min="0" step="any" bind:value={outputPrice} placeholder="0" />
                <span class="field-suffix">{priceUnit()}</span>
              </div>
            </label>
          </div>
        </section>

        <section class="settings-card connection" aria-labelledby="collection-title">
          <div class="setting-copy">
            <h2 id="collection-title">Collections</h2>
            <p>A collection is always active. Map each combination of field options to a connection; with no fields, the collection still maps to one.</p>
          </div>
          <div class="fields">
            <div class="model-field">
              <label for="collection-input"><span>Current collection</span></label>
              <div class="model-input-row">
                <Select
                  id="collection-input"
                  value={activeCollectionId}
                  options={collections.map((collection): [string, string] => [collection.id, collection.name])}
                  listLabel="Collections"
                  listName="collection list"
                  onchange={switchCollection}
                />
                <button
                  class="profile-action"
                  type="button"
                  aria-label="New collection"
                  title="New collection"
                  onclick={addCollection}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button
                  class="profile-action"
                  type="button"
                  disabled={collections.length < 2}
                  aria-label="Delete collection"
                  title="Delete collection"
                  onclick={deleteCollection}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>
            {#if activeCollection}
              <label>
                <span>Name</span>
                <input
                  value={activeCollection.name}
                  placeholder="Collection name"
                  oninput={(event) => editCollection((collection) => ({ ...collection, name: event.currentTarget.value }))}
                />
              </label>
              <div class="model-field">
                <span class="field-label">Fields</span>
                {#if activeCollection.fields.length}
                  <div class="collection-fields">
                    {#each activeCollection.fields as field (field.id)}
                      <div class="collection-field">
                        <div class="model-input-row">
                          <input
                            value={field.name}
                            placeholder="Field name"
                            aria-label="Field name"
                            oninput={(event) => editField(field.id, (current) => ({ ...current, name: event.currentTarget.value }))}
                          />
                          <button
                            class="profile-action"
                            type="button"
                            aria-label="Delete field"
                            title="Delete field"
                            onclick={() => {
                              editCollection((collection) => ({ ...collection, fields: collection.fields.filter((current) => current.id !== field.id) }))
                              saveSettings()
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6M14 11v6"/></svg>
                          </button>
                        </div>
                        <div class="collection-options">
                          {#each field.options as option (option.id)}
                            <div class="input-with-action">
                              <input
                                value={option.label}
                                placeholder="Option"
                                aria-label="Option"
                                oninput={(event) => editField(field.id, (current) => ({
                                  ...current,
                                  options: current.options.map((item) => item.id === option.id ? { ...item, label: event.currentTarget.value } : item),
                                }))}
                              />
                              <button
                                type="button"
                                aria-label="Remove option"
                                title="Remove option"
                                onclick={() => {
                                  editField(field.id, (current) => ({ ...current, options: current.options.filter((item) => item.id !== option.id) }))
                                  saveSettings()
                                }}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          {/each}
                          <button
                            class="profile-action"
                            type="button"
                            aria-label="Add option"
                            title="Add option"
                            onclick={() => {
                              editField(field.id, (current) => ({ ...current, options: [...current.options, createOption()] }))
                              saveSettings()
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                          </button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
                <button
                  class="add-field"
                  type="button"
                  onclick={() => {
                    editCollection((collection) => ({ ...collection, fields: [...collection.fields, createField()] }))
                    saveSettings()
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                  Add field
                </button>
                <small>Each field becomes a switch in the composer; its options are the choices.</small>
              </div>
              <div class="model-field">
                <span class="field-label">Mapping</span>
                <div class="collection-mapping">
                  {#each combos(activeCollection.fields) as combo (comboKey(combo.map((option) => option.id)))}
                    {@const key = comboKey(combo.map((option) => option.id))}
                    <div class="collection-combo">
                      <label for="combo-{key}">{combo.length ? combo.map((option) => option.label || 'Untitled').join(' · ') : 'Connection'}</label>
                      <Select
                        id="combo-{key}"
                        value={activeCollection.mapping[key] ?? ''}
                        options={[['', 'Not mapped'], ...connections.map((connection): [string, string] => [connection.id, connection.name])]}
                        listLabel="Connections"
                        listName="connection list"
                        onchange={(connectionId) => mapCombo(key, connectionId)}
                      />
                    </div>
                  {/each}
                </div>
                <small>Pick the connection each combination should use.</small>
              </div>
            {/if}
          </div>
        </section>

        <section class="settings-card" aria-labelledby="profile-title">
          <div class="setting-copy">
            <h2 id="profile-title">Profile</h2>
            <p>Create and switch profiles. Each one stores its own icon and instructions.</p>
          </div>
          <div class="fields">
            <div class="model-field">
              <label for="profile-input"><span>Current profile</span></label>
              <div class="model-input-row">
                <Select
                  id="profile-input"
                  value={activeProfileId}
                  options={profiles.map((profile): [string, string] => [profile.id, profile.name])}
                  listLabel="Profiles"
                  listName="profile list"
                  onchange={switchProfile}
                />
                <button
                  class="profile-action"
                  type="button"
                  aria-label="New profile"
                  title="New profile"
                  onclick={addProfile}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button
                  class="profile-action"
                  type="button"
                  disabled={profiles.length < 2}
                  aria-label="Delete profile"
                  title="Delete profile"
                  onclick={deleteProfile}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>
            <label>
              <span>Name</span>
              <input bind:value={profileName} placeholder="Profile name" />
            </label>
            <div class="model-field">
              <label for="profile-icon-input"><span>Icon</span></label>
              <input
                id="profile-icon-input"
                bind:this={iconInput}
                type="file"
                accept="image/*"
                hidden
                onchange={(event) => {
                  setProfileIcon([...(event.currentTarget.files ?? [])])
                  event.currentTarget.value = ''
                }}
              />
              <div class="profile-icon-row">
                <button
                  class="profile-icon"
                  type="button"
                  aria-label={profileIcon ? 'Replace profile icon' : 'Upload profile icon'}
                  title={profileIcon ? 'Replace icon' : 'Upload icon'}
                  onclick={() => iconInput.click()}
                >
                  {#if profileIcon}<img src={profileIcon} alt="" />{/if}
                </button>
                {#if profileIcon}
                  <button
                    class="profile-icon-clear"
                    type="button"
                    aria-label="Remove profile icon"
                    title="Remove icon"
                    onclick={() => { profileIcon = ''; saveSettings() }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                {/if}
              </div>
              {#if iconError}
                <small class="field-error" role="alert">{iconError}</small>
              {:else}
                <small>Shown next to assistant replies. Optional.</small>
              {/if}
            </div>
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
