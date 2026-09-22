<script lang="ts">
  import Icon from './lib/Icon.svelte';
  import ContextRing from './lib/ContextRing.svelte';
  import { onMount, tick } from 'svelte';
  import { loadChats, saveChat, removeChats, loadBackground, saveBackground, removeBackgrounds, type Chat, type Message } from './lib/chats';
  import Code from './lib/Code.svelte';
  import MessageStats from './lib/MessageStats.svelte';
  import Select from './lib/Select.svelte';
  import { language, languages, parseLanguage, t, type Translator } from './lib/i18n';
  import { configScriptHelp, createConnection, duplicateConnection, evaluateConnection, fieldsScriptHelp, parseConnections, type Connection } from './lib/connections';
  import { createProfile, parseProfiles, type Profile } from './lib/profiles';
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
  } from './lib/responses';

  type Theme = 'system' | 'light' | 'dark'

  const storageKey = 'saga-settings'; // Keep existing users' saved connections and preferences.
  const maxPendingImages = 8;
  const contextRing = 2 * Math.PI * 9;
  const usageLabels: Record<string, string> = {
    cached: 'Cached',
    input: 'Input',
    reasoning: 'Reasoning',
    output: 'Output',
  };
  const reasoningEffortOptions: [ReasoningEffort | '', string][] = [
    ['', 'Default'],
    ['none', 'None'],
    ['minimal', 'Minimal'],
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
    ['xhigh', 'Extra High'],
    ['max', 'Max'],
  ];

  let ready = false;
  let storageError = '';
  let sidebarVisible = true;
  let chats: Chat[] = [];
  let activeChatId = '';
  let controller: AbortController | undefined;
  let requestVersion = 0;
  let requestStartedAt: number | undefined;
  $: visibleChats = chats.filter((chat) => chat.profileId === activeProfileId).sort((a, b) => b.updatedAt - a.updatedAt);
  $: if (ready) persistChat(messages, prompt, pendingImages, tokenUsage, chatUsage, pendingUsage, loading);
  let page: 'chat' | 'settings' = 'chat';
  let theme: Theme = 'system';
  $: document.documentElement.lang = $language;
  let connections: Connection[] = parseConnections({}).connections;
  let activeConnectionId = connections[0].id;
  let connectionName = connections[0].name;
  let apiKey = '';
  let baseUrl = '';
  let model = '';
  let contextLength: number | null = null;
  let currency: Currency = 'CNY';
  let cacheHitPrice: number | null = null;
  let cacheMissPrice: number | null = null;
  let outputPrice: number | null = null;
  let tokenUsage: TokenUsage | undefined = undefined;
  let chatUsage: TokenUsage | undefined = undefined;
  let pendingUsage: TokenUsage | undefined = undefined;
  let availableModels: string[] = [];
  let modelsLoading = false;
  let modelsError = '';
  let profiles: Profile[] = [{ id: 'default', name: 'Default', systemPrompt: '', icon: '', background: '' }];
  let activeProfileId = 'default';
  let profileName = 'Default';
  let profileIcon = '';
  let profileBackground = '';
  let backgroundToken = 0;
  let iconError = '';
  let backgroundError = '';
  let profileMenuOpen = false;
  let systemPrompt = '';
  let showApiKey = false;
  let reasoningEffort: ReasoningEffort | '' = '';
  let fieldsScript = '';
  let configScript = '';
  let selected: Record<string, string> = {};
  $: evaluated = evaluateConnection({
    id: activeConnectionId,
    name: connectionName,
    apiKey,
    baseUrl,
    model,
    contextLength,
    currency,
    cacheHitPrice,
    cacheMissPrice,
    outputPrice,
    availableModels,
    reasoningEffort,
    fieldsScript,
    configScript,
    selected,
  });
  let prompt = '';
  let pendingImages: string[] = [];
  let editImages: string[] = [];
  let imageTarget: 'pending' | 'edit' = 'pending';
  let attaching = false;
  let dragging = false;
  let messages: Message[] = [];
  let loading = false;
  let streamingReasoningOpen = true;
  let error = '';
  let copiedMessage: number | null = null;
  let editingMessage: number | null = null;
  let editPrompt = '';
  let form: HTMLFormElement;
  let fileInput: HTMLInputElement;
  let iconInput: HTMLInputElement;
  let backgroundInput: HTMLInputElement;
  let textarea: HTMLTextAreaElement;
  let editTextarea: HTMLTextAreaElement;
  let messageEnd: HTMLDivElement;
  let scrollbar: HTMLDivElement;
  let scrollable = false;
  let scrollThumbHeight = 0;
  let scrollThumbTop = 0;
  let dragOffset: number | null = null;

  onMount(() => {
    try {
      const stored = parseJson(localStorage.getItem(storageKey) || '{}');
      if (isRecord(stored)) {
        language.set(parseLanguage(stored.language));
        sidebarVisible = stored.sidebarVisible !== false;
        activeChatId = typeof stored.activeChatId === 'string' ? stored.activeChatId : '';
        theme = stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system';
        const parsedProfiles = parseProfiles(stored);
        profiles = parsedProfiles.profiles;
        activeProfileId = parsedProfiles.activeProfileId;
        const legacyBackgrounds = profiles.flatMap((profile) => (
          profile.background.startsWith('data:') ? [{ id: profile.id, data: profile.background }] : []
        ));
        profiles = profiles.map((profile) => (profile.background ? { ...profile, background: '' } : profile));
        loadActiveProfile();
        void migrateLegacyBackgrounds(legacyBackgrounds).then(() => showStoredBackground());
        const parsedConnections = parseConnections(stored);
        connections = parsedConnections.connections;
        activeConnectionId = parsedConnections.activeConnectionId;
        loadActiveConnection();
      }
    } catch {
      // Ignore malformed local preferences and keep safe defaults.
    }
    applyTheme(theme);
    let mounted = true;
    void loadChats().then((saved) => {
      if (!mounted) return;
      chats = saved.filter((chat) => profiles.some((profile) => profile.id === chat.profileId));
    }).catch(() => {
      storageError = 'Could not load local conversations. Reload the page to try again.';
    }).finally(() => {
      if (!mounted) return;
      const previous = chats.find((chat) => chat.id === activeChatId);
      activeChatId = '';
      if (previous) activateChat(previous);
      else createChat();
      ready = true;
      applyRoute();
    });
    window.addEventListener('hashchange', applyRoute);

    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(document.body);
    window.addEventListener('scroll', updateScrollbar, { passive: true });
    window.addEventListener('resize', updateScrollbar);
    updateScrollbar();

    return () => {
      mounted = false;
      stopResponse();
      window.removeEventListener('hashchange', applyRoute);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', updateScrollbar);
      window.removeEventListener('resize', updateScrollbar);
    };
  });

  function readPrice(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  function chooseLanguage(value: string) {
    language.set(parseLanguage(value));
    saveSettings();
  }

  function applyTheme(value: Theme) {
    if (value === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
  }

  function chooseTheme(value: Theme) {
    theme = value;
    applyTheme(value);
    saveSettings();
  }

  function chooseCurrency(value: Currency) {
    currency = value;
    saveSettings();
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
          fieldsScript,
          configScript,
          selected,
        }
      : connection);
  }

  function loadActiveConnection() {
    const active = connections.find((connection) => connection.id === activeConnectionId) ?? connections[0];
    activeConnectionId = active.id;
    connectionName = active.name;
    apiKey = active.apiKey;
    baseUrl = active.baseUrl;
    model = active.model;
    contextLength = active.contextLength;
    currency = active.currency;
    cacheHitPrice = active.cacheHitPrice;
    cacheMissPrice = active.cacheMissPrice;
    outputPrice = active.outputPrice;
    availableModels = active.availableModels;
    reasoningEffort = active.reasoningEffort;
    fieldsScript = active.fieldsScript;
    configScript = active.configScript;
    selected = { ...active.selected };
    modelsLoading = false;
    modelsError = '';
    showApiKey = false;
  }

  function switchConnection(id: string) {
    if (id === activeConnectionId) return;
    persistActiveConnection();
    activeConnectionId = id;
    loadActiveConnection();
    saveSettings();
  }

  function addConnection() {
    persistActiveConnection();
    const connection = createConnection(connections);
    connections = [...connections, connection];
    activeConnectionId = connection.id;
    loadActiveConnection();
    saveSettings();
  }

  function copyConnection() {
    persistActiveConnection();
    const source = connections.find((connection) => connection.id === activeConnectionId) ?? connections[0];
    const connection = duplicateConnection(source, connections);
    connections = [...connections, connection];
    activeConnectionId = connection.id;
    loadActiveConnection();
    saveSettings();
  }

  function deleteConnection() {
    if (connections.length < 2 || !confirm($t('Delete connection "{name}"?', { name: connectionName }))) return;
    const deletedId = activeConnectionId;
    connections = connections.filter((connection) => connection.id !== deletedId);
    loadActiveConnection();
    saveSettings();
  }

  function chooseOption(fieldId: string, optionId: string) {
    selected = { ...selected, [fieldId]: optionId };
    saveSettings();
  }

  function persistActiveProfile() {
    profiles = profiles.map((profile) => profile.id === activeProfileId
      ? { ...profile, name: profileName.trim() || profile.name, systemPrompt: systemPrompt.trim(), icon: profileIcon, background: '' }
      : profile);
  }

  function loadActiveProfile() {
    const active = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
    activeProfileId = active.id;
    profileName = active.name;
    profileIcon = active.icon;
    systemPrompt = active.systemPrompt;
    iconError = '';
    backgroundError = '';
    void showStoredBackground();
  }

  function setBackgroundUrl(url: string) {
    if (profileBackground.startsWith('blob:')) URL.revokeObjectURL(profileBackground);
    profileBackground = url;
  }

  async function showStoredBackground() {
    const profileId = activeProfileId;
    const token = ++backgroundToken;
    try {
      const blob = await loadBackground(profileId);
      if (token !== backgroundToken) return;
      setBackgroundUrl(blob ? URL.createObjectURL(blob) : '');
    } catch {
      if (token !== backgroundToken) return;
      setBackgroundUrl('');
    }
  }

  async function migrateLegacyBackgrounds(leftover: { id: string; data: string }[]) {
    if (!leftover.length) return;
    for (const profile of leftover) {
      try {
        const blob = await (await fetch(profile.data)).blob();
        if (blob.size) await saveBackground(profile.id, blob);
      } catch {
        // Skip a broken data URL; it is already off the profile record.
      }
    }
    saveSettings();
  }

  function switchProfile(id: string) {
    if (id === activeProfileId) return;
    stopResponse();
    persistActiveProfile();
    activeProfileId = id;
    loadActiveProfile();
    selectProfileChat();
    saveSettings();
  }

  function addProfile() {
    stopResponse();
    persistActiveProfile();
    const profile = createProfile(profiles);
    profiles = [...profiles, profile];
    activeProfileId = profile.id;
    loadActiveProfile();
    selectProfileChat();
    saveSettings();
  }

  async function deleteProfile() {
    if (profiles.length < 2 || !confirm($t('Delete profile "{name}" and all its conversations?', { name: profileName }))) return;
    stopResponse();
    const deletedId = activeProfileId;
    try {
      await removeChats(chats.filter((chat) => chat.profileId === deletedId).map((chat) => chat.id));
      await removeBackgrounds([deletedId]);
    } catch {
      storageError = 'Could not delete local conversations. Please try again.';
      return;
    }
    chats = chats.filter((chat) => chat.profileId !== deletedId);
    profiles = profiles.filter((profile) => profile.id !== deletedId);
    loadActiveProfile();
    selectProfileChat();
    saveSettings();
  }

  function saveSettings() {
    persistActiveProfile();
    persistActiveConnection();
    try {
      localStorage.setItem(storageKey, JSON.stringify({
      theme,
      language: $language,
      connections,
      activeConnectionId,
      profiles,
      activeProfileId,
      activeChatId,
      sidebarVisible,
      }));
    } catch {
      storageError = 'Could not save local settings. Check browser storage and try again.';
    }
  }

  function resizeTextarea(element: HTMLTextAreaElement) {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }

  function readImage(file: File) {
    const problem = imageFileError(file);
    if (problem) return Promise.reject(new Error(problem));
    // ponytail: data URLs keep preview and payload as one string; 8×10MB ceiling. Upgrade: POST /files and send file_id.
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read this image.'));
      reader.onerror = () => reject(new Error('Could not read this image.'));
      reader.readAsDataURL(file);
    });
  }

  const profileIconSize = 128;
  const backgroundMaxEdge = 3840;
  const backgroundQuality = 0.92;
  // ponytail: AVIF at 0.92, 3840px cap. Upgrade: store the original file when it's already small enough.

  function readIcon(file: File) {
    return readImage(file).then((src) => new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = profileIconSize;
        canvas.height = profileIconSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(src);
        const scale = Math.max(profileIconSize / image.width, profileIconSize / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.drawImage(image, (profileIconSize - width) / 2, (profileIconSize - height) / 2, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => reject(new Error('Could not read this image.'));
      image.src = src;
    }));
  }

  async function encodeBackground(file: File) {
    const problem = imageFileError(file, Infinity);
    if (problem) throw new Error(problem);
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, backgroundMaxEdge / Math.max(bitmap.width, bitmap.height));
      if (file.type === 'image/avif' && scale === 1) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not encode this image.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/avif', backgroundQuality));
      if (!blob?.size) throw new Error('Could not encode this image.');
      return blob;
    } finally {
      bitmap.close();
    }
  }

  async function setProfileIcon(files: File[]) {
    const file = files[0];
    if (!file) return;
    try {
      profileIcon = await readIcon(file);
      iconError = '';
      saveSettings();
    } catch (cause) {
      iconError = cause instanceof Error ? cause.message : 'Could not add this image.';
    }
  }

  async function setProfileBackground(files: File[]) {
    const file = files[0];
    if (!file) return;
    try {
      const blob = await encodeBackground(file);
      await saveBackground(activeProfileId, blob);
      setBackgroundUrl(URL.createObjectURL(blob));
      backgroundError = '';
      saveSettings();
    } catch (cause) {
      backgroundError = cause instanceof Error ? cause.message : 'Could not add this image.';
    }
  }

  async function addImages(files: File[], into: 'pending' | 'edit' = 'pending') {
    if (!files.length) return;
    const chatId = activeChatId;
    attaching = true;
    try {
      let next = [...(into === 'edit' ? editImages : pendingImages)];
      for (const file of files) {
        if (next.length >= maxPendingImages) {
          error = $t('You can attach up to {count} images.', { count: maxPendingImages });
          break;
        }
        next = [...next, await readImage(file)];
        if (chatId !== activeChatId) return;
        if (into === 'edit') editImages = next;
        else pendingImages = next;
        error = '';
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not add this image.';
    } finally {
      attaching = false;
    }
  }

  function removeImage(index: number, into: 'pending' | 'edit' = 'pending') {
    if (into === 'edit') editImages = editImages.filter((_, imageIndex) => imageIndex !== index);
    else pendingImages = pendingImages.filter((_, imageIndex) => imageIndex !== index);
  }

  function handlePaste(event: ClipboardEvent, into: 'pending' | 'edit' = 'pending') {
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length) return;
    if (!event.clipboardData?.getData('text/plain')) event.preventDefault();
    addImages(files, into);
  }

  function pickImages(into: 'pending' | 'edit') {
    imageTarget = into;
    fileInput.click();
  }

  function updateScrollbar() {
    if (!scrollbar) return;
    const root = document.documentElement;
    const trackHeight = scrollbar.clientHeight;
    scrollable = root.scrollHeight > root.clientHeight;
    scrollThumbHeight = scrollable ? Math.max(36, trackHeight * root.clientHeight / root.scrollHeight) : trackHeight;
    scrollThumbTop = scrollable
      ? (trackHeight - scrollThumbHeight) * root.scrollTop / (root.scrollHeight - root.clientHeight)
      : 0;
  }

  function scrollFromPointer(clientY: number) {
    if (dragOffset === null) return;
    const root = document.documentElement;
    const track = scrollbar.getBoundingClientRect();
    const travel = track.height - scrollThumbHeight;
    const top = Math.max(0, Math.min(travel, clientY - track.top - dragOffset));
    window.scrollTo({ top: top / travel * (root.scrollHeight - root.clientHeight) });
  }

  function startScrollbarDrag(event: PointerEvent) {
    if (!scrollable) return;
    const trackTop = scrollbar.getBoundingClientRect().top;
    const pointerOnThumb = event.clientY >= trackTop + scrollThumbTop
      && event.clientY <= trackTop + scrollThumbTop + scrollThumbHeight;
    dragOffset = pointerOnThumb ? event.clientY - trackTop - scrollThumbTop : scrollThumbHeight / 2;
    scrollbar.setPointerCapture(event.pointerId);
    scrollFromPointer(event.clientY);
    event.preventDefault();
  }

  function stopScrollbarDrag(event: PointerEvent) {
    dragOffset = null;
    if (scrollbar.hasPointerCapture(event.pointerId)) scrollbar.releasePointerCapture(event.pointerId);
  }

  function handleKeydown(event: KeyboardEvent, submit = () => form.requestSubmit()) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  async function showMessages(next: Message[]) {
    const wasAtBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    messages = next;
    await tick();
    if (wasAtBottom) messageEnd?.scrollIntoView();
  }

  function contextLimit() {
    return typeof contextLength === 'number' && contextLength > 0 ? Math.floor(contextLength) : 0;
  }

  function contextMeter(usage: TokenUsage | undefined, connection: Connection) {
    const used = usage?.total ?? 0;
    const limit = typeof connection.contextLength === 'number' && connection.contextLength > 0 ? Math.floor(connection.contextLength) : 0;
    const ratio = limit ? Math.min(1, used / limit) : 0;
    const percent = Math.round(ratio * 100);
    const parts = usageParts(usage);
    const prices = {
      cacheHit: readPrice(connection.cacheHitPrice) ?? 0,
      cacheMiss: readPrice(connection.cacheMissPrice) ?? 0,
      output: readPrice(connection.outputPrice) ?? 0,
    };
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
    };
  }

  function syncStreamingReasoningOpen(index: number, details: HTMLDetailsElement) {
    if (loading && index === messages.length - 1) streamingReasoningOpen = details.open;
  }

  function requestReady() {
    const live = evaluated.effective;
    if (evaluated.configError) {
      error = evaluated.configError;
      return false;
    }
    if (!live.apiKey.trim() || !live.baseUrl.trim()) {
      error = 'Add an API Key and Base URL in Settings first.';
      return false;
    }
    if (!live.model.trim()) {
      error = 'Select a model before sending a message.';
      return false;
    }
    return true;
  }

  async function refreshModels() {
    if (!apiKey.trim() || !baseUrl.trim() || modelsLoading) return;
    const requestedId = activeConnectionId;
    modelsLoading = true;
    modelsError = '';

    try {
      const response = await fetch(modelsUrl(baseUrl), {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      const data = await readResponseJson(response).catch((): unknown => undefined);
      if (!response.ok) throw new Error(responseErrorMessage(data) || $t('Request failed ({status}).', { status: response.status }));
      if (activeConnectionId !== requestedId) return;
      availableModels = extractModelIds(data);
      if (!availableModels.length) throw new Error('The service returned no models.');
      saveSettings();
    } catch (cause) {
      if (activeConnectionId !== requestedId) return;
      availableModels = [];
      modelsError = cause instanceof Error ? cause.message : 'Could not load models.';
    } finally {
      if (activeConnectionId === requestedId) modelsLoading = false;
    }
  }

  async function requestResponse(nextMessages: Message[]) {
    error = '';
    copiedMessage = null;
    streamingReasoningOpen = true;
    const version = ++requestVersion;
    controller = new AbortController();
    const signal = controller.signal;
    const live = evaluated.effective;
    const prices = {
      cacheHit: readPrice(live.cacheHitPrice) ?? 0,
      cacheMiss: readPrice(live.cacheMissPrice) ?? 0,
      output: readPrice(live.outputPrice) ?? 0,
    };
    const messageCost = (usage: TokenUsage | undefined) => usage
      ? { amount: usageCost(usage, prices), currency: live.currency }
      : undefined;
    const instructions = systemPrompt.trim();
    loading = true;
    pendingUsage = undefined;
    await showMessages(nextMessages);
    if (version !== requestVersion) return;
    const requestedAt = performance.now();
    requestStartedAt = requestedAt;

    try {
      const reasoning = reasoningConfig(live.reasoningEffort);
      const response = await fetch(responsesUrl(live.baseUrl), {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${live.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: live.model.trim(),
          input: toResponseInput(nextMessages),
          stream: true,
          ...(instructions ? { instructions } : {}),
          ...(reasoning ? { reasoning } : {}),
        }),
      });
      if (version !== requestVersion) return;
      if (!response.ok) {
        const data = await readResponseJson(response).catch((): unknown => undefined);
        throw new Error(responseErrorMessage(data) || $t('Request failed ({status}).', { status: response.status }));
      }

      if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        let reply = '';
        let reasoning = '';
        let tokens = 0;
        let startedAt = 0;
        let countedFromUsage = false;
        let tokensPerSecond: number | undefined;
        let timeToFirstToken: number | undefined;
        let usage: TokenUsage | undefined;
        const assistant = (): Message => ({
          role: 'assistant', content: reply, reasoning, tokensPerSecond, timeToFirstToken,
          elapsedMs: performance.now() - requestedAt,
          usage,
          cost: messageCost(usage),
        });
        for await (const event of responseDeltas(response.body)) {
          if (version !== requestVersion) return;
          if (event.type === 'usage') {
            usage = event.usage;
            tokenUsage = event.usage;
            pendingUsage = event.usage;
            if (event.usage.output) {
              countedFromUsage = true;
              tokens = event.usage.output;
            }
          } else {
            if (!startedAt) startedAt = performance.now();
            if (!countedFromUsage) tokens += 1;
            if (event.type === 'reasoning') reasoning += event.delta;
            else reply += event.delta;
            if (timeToFirstToken === undefined) timeToFirstToken = performance.now() - requestedAt;
          }
          tokensPerSecond = startedAt ? outputSpeed(tokens, performance.now() - startedAt) : undefined;
          await showMessages([...nextMessages, assistant()]);
        }
        if (version !== requestVersion) return;
        if (!reply) throw new Error('The service returned an empty response.');
      } else {
        const data = await readResponseJson(response).catch((): unknown => undefined);
        if (version !== requestVersion) return;
        tokenUsage = extractUsage(data);
        pendingUsage = tokenUsage;
        await showMessages([...nextMessages, {
          role: 'assistant',
          content: extractResponseText(data),
          reasoning: extractResponseReasoning(data),
          elapsedMs: performance.now() - requestedAt,
          usage: tokenUsage,
          cost: messageCost(tokenUsage),
        }]);
      }
    } catch (cause) {
      if (version === requestVersion) error = cause instanceof Error ? cause.message : 'Request failed. Please try again.';
    } finally {
      if (version === requestVersion) {
        finishResponseTiming();
        if (pendingUsage) chatUsage = addUsage(chatUsage, pendingUsage);
        pendingUsage = undefined;
        loading = false;
        controller = undefined;
      }
    }
  }

  async function sendMessage() {
    const content = prompt.trim();
    if ((!content && !pendingImages.length) || loading || attaching || !requestReady()) return;

    const chatId = activeChatId;
    const nextMessages: Message[] = [...messages, {
      role: 'user',
      content,
      ...(pendingImages.length ? { images: pendingImages } : {}),
    }];
    prompt = '';
    pendingImages = [];
    await tick();
    if (chatId !== activeChatId) return;
    if (textarea) resizeTextarea(textarea);
    await requestResponse(nextMessages);
  }

  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      copiedMessage = index;
      setTimeout(() => {
        if (copiedMessage === index) copiedMessage = null;
      }, 1500);
    } catch {
      error = 'Could not copy this message.';
    }
  }

  async function regenerateMessage(index: number) {
    if (loading || editingMessage !== null || messages[index]?.role !== 'assistant' || messages[index - 1]?.role !== 'user' || !requestReady()) return;
    await requestResponse(messages.slice(0, index));
  }

  async function editMessage(index: number) {
    const message = messages[index];
    if (loading || message?.role !== 'user') return;
    editingMessage = index;
    editPrompt = message.content;
    editImages = [...(message.images ?? [])];
    error = '';
    copiedMessage = null;
    await tick();
    editTextarea.focus();
    resizeTextarea(editTextarea);
  }

  function cancelEdit() {
    editingMessage = null;
    editPrompt = '';
    editImages = [];
  }

  async function saveEdit(index: number) {
    const content = editPrompt.trim();
    const images = [...editImages];
    const previous = messages[index]?.images ?? [];
    if ((!content && !images.length) || loading || attaching || messages[index]?.role !== 'user' || !requestReady()) return;
    if (content === messages[index].content && images.length === previous.length && images.every((src, imageIndex) => src === previous[imageIndex])) {
      cancelEdit();
      return;
    }
    cancelEdit();
    await requestResponse([...messages.slice(0, index), { role: 'user', content, ...(images.length ? { images } : {}) }]);
  }

  function persistChat(
    next: Message[],
    draft: string,
    images: string[],
    usage?: TokenUsage,
    total?: TokenUsage,
    pending?: TokenUsage,
    deferSave = false,
  ) {
    const current = chats.find((chat) => chat.id === activeChatId);
    if (!current) return;
    const first = next.find((message) => message.role === 'user');
    const chat: Chat = {
      ...current,
      title: first ? (first.content.trim() || 'Image conversation').slice(0, 80) : 'New chat',
      updatedAt: next !== current.messages ? Date.now() : current.updatedAt,
      messages: next,
      prompt: draft,
      pendingImages: images,
      tokenUsage: usage,
      chatUsage: pending ? addUsage(total, pending) : total,
    };
    chats = chats.map((item) => item.id === chat.id ? chat : item);
    // Streaming can update once per token. Persisting every update clones the
    // entire conversation, including base64 image attachments, and can exhaust
    // the browser heap. Keep the in-memory chat current, then save once loading
    // finishes (or when stopResponse explicitly flushes it).
    if (deferSave) return;
    void saveChat(chat).catch(() => {
      storageError = 'Could not save this conversation locally. Check browser storage; keep this page open to retain your messages.';
    });
  }

  function finishResponseTiming() {
    if (requestStartedAt === undefined) return;
    const elapsedMs = performance.now() - requestStartedAt;
    messages = messages.map((message, index) => index === messages.length - 1 && message.role === 'assistant'
      ? { ...message, elapsedMs }
      : message);
    requestStartedAt = undefined;
  }

  function stopResponse() {
    finishResponseTiming();
    requestVersion += 1;
    controller?.abort();
    controller = undefined;
    if (pendingUsage) chatUsage = addUsage(chatUsage, pendingUsage);
    pendingUsage = undefined;
    loading = false;
    if (ready) persistChat(messages, prompt, pendingImages, tokenUsage, chatUsage);
  }

  function activateChat(chat: Chat) {
    stopResponse();
    persistActiveProfile();
    activeChatId = chat.id;
    activeProfileId = chat.profileId;
    loadActiveProfile();
    messages = chat.messages;
    prompt = chat.prompt;
    pendingImages = chat.pendingImages;
    tokenUsage = chat.tokenUsage;
    chatUsage = chat.chatUsage;
    error = '';
    copiedMessage = null;
    profileMenuOpen = false;
    cancelEdit();
    saveSettings();
    void tick().then(() => {
      if (textarea) resizeTextarea(textarea);
      updateScrollbar();
    });
  }

  function createChat() {
    const chat: Chat = { id: crypto.randomUUID(), profileId: activeProfileId, title: 'New chat', updatedAt: Date.now(), messages: [], prompt: '', pendingImages: [] };
    chats = [chat, ...chats];
    activateChat(chat);
    return chat;
  }

  function navigate(path: string, replace = false) {
    const hash = `#${path}`;
    if (replace) history.replaceState(null, '', hash);
    else if (location.hash !== hash) history.pushState(null, '', hash);
    applyRoute();
  }

  function applyRoute() {
    if (!ready) return;
    const route = location.hash.slice(1);
    if (route === '/settings') {
      profileMenuOpen = false;
      page = 'settings';
      return;
    }
    const id = route.startsWith('/chat/') ? route.slice(6) : activeChatId;
    let chat = chats.find((item) => item.id === id);
    if (!chat) chat = chats.find((item) => item.profileId === activeProfileId) ?? createChat();
    if (chat.id !== activeChatId || page === 'settings' || messages !== chat.messages) activateChat(chat);
    page = 'chat';
    if (route !== `/chat/${chat.id}`) history.replaceState(null, '', `#/chat/${chat.id}`);
  }

  function selectProfileChat() {
    const chat = chats.filter((item) => item.profileId === activeProfileId).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? createChat();
    activateChat(chat);
    if (page === 'chat') navigate(`/chat/${chat.id}`);
  }

  function newChat() {
    if (attaching) return;
    const chat = createChat();
    navigate(`/chat/${chat.id}`);
  }

  function chatTitle(chat: Chat, translate: Translator) {
    const first = chat.messages.find((message) => message.role === 'user');
    return first?.content.trim() ? chat.title : translate(first ? 'Image conversation' : 'New chat');
  }

  function isEmptyChat(chat: Chat) {
    return !chat.messages.length && !chat.prompt.trim() && !chat.pendingImages.length;
  }

  async function deleteChat(chat: Chat) {
    const empty = isEmptyChat(chat);
    if (empty && chats.filter((item) => item.profileId === chat.profileId).length < 2) return;
    if (!empty && !confirm($t('Delete conversation "{name}"? This cannot be undone.', { name: chatTitle(chat, $t) }))) return;
    if (chat.id === activeChatId) stopResponse();
    try {
      await removeChats([chat.id]);
    } catch {
      storageError = 'Could not delete this conversation. Please try again.';
      return;
    }
    chats = chats.filter((item) => item.id !== chat.id);
    if (chat.id === activeChatId) {
      activeChatId = '';
      selectProfileChat();
      if (page === 'chat') navigate(`/chat/${activeChatId}`, true);
    }
  }

  function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    saveSettings();
    void tick().then(updateScrollbar);
  }

</script>

<svelte:head>
  <title>{$t("MoteChat — AI assistant")}</title>
  <meta name="description" content={$t("A focused, private AI conversation interface.")} />
</svelte:head>

{#snippet profileFace(src: string)}
  <span class="avatar" aria-hidden="true">
    {#if src}<img src={src} alt="" />{:else}<Icon name="user" />{/if}
  </span>
{/snippet}

{#snippet profileAvatar()}
  {@render profileFace(profileIcon)}
{/snippet}

{#if ready}
<div class="app-shell" class:sidebar-visible={sidebarVisible} class:settings-page={page === 'settings'} class:has-chat-bg={page === 'chat' && !!profileBackground}>
    {#if profileBackground}
      <div class="chat-background" aria-hidden="true">
        <img src={profileBackground} alt="" />
      </div>
    {/if}
    <aside class="chat-sidebar" id="chat-sidebar" aria-label={$t("Conversations")} aria-hidden={!sidebarVisible} inert={!sidebarVisible}>
      <label class="sidebar-label" for="sidebar-profile">{$t("Profile")}</label>
      <Select id="sidebar-profile" value={activeProfileId} options={profiles.map((profile): [string, string, string] => [profile.id, profile.name, profile.icon])} listLabel={$t("Profiles")} listName={$t("Profiles")} onchange={switchProfile} />
      <nav class="chat-list" aria-label={$t("{name} conversations", { name: profileName })}>
        {#each visibleChats as chat (chat.id)}
          <div class="chat-list-item" class:active={page === 'chat' && activeChatId === chat.id}>
            <a href={`#/chat/${chat.id}`} aria-current={page === 'chat' && activeChatId === chat.id ? 'page' : undefined} title={chatTitle(chat, $t)}>{chatTitle(chat, $t)}</a>
            <button class="icon-button" type="button" disabled={visibleChats.length < 2 && isEmptyChat(chat)} aria-label={$t("Delete conversation {name}", { name: chatTitle(chat, $t) })} title={$t("Delete conversation")} onclick={() => deleteChat(chat)}><Icon name="trash-simple" /></button>
          </div>
        {:else}
          <p class="sidebar-empty">{$t("No conversations yet.")}</p>
        {/each}
      </nav>
    </aside>
  {#if storageError}<div class="storage-error" role="alert">{$t(storageError)}</div>{/if}
  <header class="topbar">
    <div class="top-actions">
      <button class="icon-button" type="button" aria-label={sidebarVisible ? $t("Hide sidebar") : $t("Show sidebar")} aria-expanded={sidebarVisible} aria-controls="chat-sidebar" title={sidebarVisible ? $t("Hide sidebar") : $t("Show sidebar")} onclick={toggleSidebar}><Icon name="panel-left" /></button>
    <button class="brand" type="button" aria-label={$t("MoteChat — Back to chat")} onclick={() => navigate(`/chat/${activeChatId}`)}>
      <img class="brand-mark" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="28" height="28" />
      <span>MoteChat</span>
    </button>

    </div>
    <div class="top-actions">
      {#if page === 'chat'}
        <button class="icon-button" type="button" aria-label={$t("New chat")} title={$t("New chat")} onclick={newChat}>
          <Icon name="edit" />
        </button>
        <button class="icon-button" type="button" aria-label={$t("Open Settings")} title={$t("Settings")} onclick={() => navigate('/settings')}>
          <Icon name="settings" />
        </button>
      {:else}
        <button class="icon-button" type="button" aria-label={$t("Back to chat")} title={$t("Back to chat")} onclick={() => navigate(`/chat/${activeChatId}`)}>
          <Icon name="chevron-left" />
        </button>
      {/if}
    </div>
  </header>

  {#if page === 'chat'}
    <main class="chat" class:has-messages={messages.length > 0} class:has-attachments={pendingImages.length > 0}>
      {#if messages.length === 0}
        <section class="welcome" aria-label={$t("Profile")}>
          <div
            class="welcome-profile"
            onfocusout={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) profileMenuOpen = false;
            }}
          >
            <button
              type="button"
              disabled={profiles.length < 2}
              aria-label={$t("Profile: {name}", { name: profileName })}
              aria-haspopup="listbox"
              aria-expanded={profileMenuOpen}
              aria-controls="welcome-profile-options"
              onclick={() => (profileMenuOpen = !profileMenuOpen)}
            >
              {@render profileAvatar()}
              {profileName}
              {#if profiles.length > 1}
                <Icon name="chevron-down" class="welcome-profile-chevron" />
              {/if}
            </button>
            {#if profileMenuOpen}
              <div
                id="welcome-profile-options"
                class="welcome-profile-list"
                role="listbox"
                tabindex="-1"
                aria-label={$t("Profiles")}
                onkeydown={(event) => {
                  if (event.key === 'Escape') profileMenuOpen = false;
                }}
              >
                {#each profiles as profile}
                  <button
                    class:selected={profile.id === activeProfileId}
                    type="button"
                    role="option"
                    aria-selected={profile.id === activeProfileId}
                    onclick={() => {
                      profileMenuOpen = false;
                      switchProfile(profile.id);
                    }}
                  >
                    {@render profileFace(profile.icon)}
                    {profile.name}
                  </button>
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
                {@render profileAvatar()}
              {/if}
              <div class="message-block" class:editing={message.role === 'user' && editingMessage === index}>
                {#if message.role === 'user' && editingMessage === index}
                  {#if editImages.length}
                    <div class="composer-attachments">
                      {#each editImages as src, imageIndex}
                        <div class="composer-attachment">
                          <img src={src} alt={$t("Attachment")} />
                          <button type="button" aria-label={$t("Remove image")} onclick={() => removeImage(imageIndex, 'edit')}>
                            <Icon name="close" />
                          </button>
                        </div>
                      {/each}
                    </div>
                  {/if}
                  <textarea
                    class="message-editor"
                    bind:this={editTextarea}
                    bind:value={editPrompt}
                    aria-label={$t("Edit message")}
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
                      aria-label={$t("Add image")}
                      title={$t("Add image")}
                      onclick={() => pickImages('edit')}
                    >
                      <Icon name="image" />
                    </button>
                    <button type="button" onclick={cancelEdit}>{$t("Cancel")}</button>
                    <button class="save-edit" type="button" disabled={(!editPrompt.trim() && !editImages.length) || loading || attaching} onclick={() => saveEdit(index)}>{$t("Save & submit")}</button>
                  </div>
                {:else}
                  <div class="message-content">
                    {#if message.reasoning}
                      <details
                        class="reasoning"
                        open={loading && index === messages.length - 1 && streamingReasoningOpen}
                        ontoggle={(event) => syncStreamingReasoningOpen(index, event.currentTarget)}
                      >
                        <summary>
                          <Icon name="chevron-right" />{$t("Reasoning")}
                        </summary>
                        <div>{message.reasoning}</div>
                      </details>
                    {/if}
                    {#if message.images?.length}
                      <div class="message-images">
                        {#each message.images as src}
                          <img src={src} alt={$t("Attachment")} />
                        {/each}
                      </div>
                    {/if}
                    {#if message.content}<div class="message-text">{message.content}</div>{/if}
                  </div>
                  <div class="message-meta">
                    {#if message.role === 'assistant'}
                      <MessageStats {message} />
                    {/if}
                    <div class="message-actions">
                      <button type="button" onclick={() => copyMessage(message.content, index)}>
                        <Icon name="copy" />
                        {copiedMessage === index ? $t("Copied") : $t("Copy")}
                      </button>
                      {#if message.role === 'assistant'}
                        <button type="button" disabled={loading || editingMessage !== null} onclick={() => regenerateMessage(index)}>
                          <Icon name="regenerate" />
                          {$t("Regenerate")}
                        </button>
                      {:else}
                        <button type="button" disabled={loading || editingMessage !== null} onclick={() => editMessage(index)}>
                          <Icon name="edit" />
                          {$t("Edit")}
                        </button>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            </article>
          {/each}
          {#if loading && messages[messages.length - 1]?.role !== 'assistant'}
            <article class="assistant">
              {@render profileAvatar()}
              <div class="typing" aria-label={$t("AI is responding")}><i></i><i></i><i></i></div>
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
        onsubmit={(event) => { event.preventDefault(); sendMessage(); }}
        ondragover={(event) => { event.preventDefault(); dragging = true; }}
        ondragleave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dragging = false; }}
        ondrop={(event) => { event.preventDefault(); dragging = false; addImages([...(event.dataTransfer?.files ?? [])]); }}
      >
        <input
          bind:this={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onchange={(event) => {
            addImages([...(event.currentTarget.files ?? [])], imageTarget);
            event.currentTarget.value = '';
          }}
        />
        {#if pendingImages.length}
          <div class="composer-attachments">
            {#each pendingImages as src, index}
              <div class="composer-attachment">
                <img src={src} alt={$t("Attachment")} />
                <button type="button" aria-label={$t("Remove image")} onclick={() => removeImage(index)}>
                  <Icon name="close" />
                </button>
              </div>
            {/each}
          </div>
        {/if}
        <textarea bind:this={textarea} bind:value={prompt} rows="1" aria-label={$t("Message")} placeholder={$t("Message MoteChat")} oninput={(event) => resizeTextarea(event.currentTarget)} onkeydown={handleKeydown} onpaste={handlePaste}></textarea>
        <div class="composer-footer">
          <button
            class="attach-button"
            type="button"
            disabled={loading || attaching || pendingImages.length >= maxPendingImages}
            aria-label={$t("Add image")}
            title={$t("Add image")}
            onclick={() => pickImages('pending')}
          >
            <Icon name="image" />
          </button>
          {#each evaluated.fields.filter((field) => field.options.length) as field (field.id)}
            <div class="composer-switch">
              <label for="switch-{field.id}">{field.name}</label>
              <Select
                id="switch-{field.id}"
                value={evaluated.selected[field.id]}
                options={field.options.map((option): [string, string] => [option.id, option.label || $t("Untitled")])}
                listLabel={field.name || $t("Options")}
                listName={field.name || $t("Options")}
                onchange={(optionId) => chooseOption(field.id, optionId)}
              />
            </div>
          {/each}
          <div class="composer-send">
            {#if true}
              {@const meter = contextMeter(tokenUsage, evaluated.effective)}
              <span
                class="context-meter"
                class:warn={meter.ratio >= 0.8}
                class:alert={meter.ratio >= 0.95}
                role="meter"
                aria-label={$t("Context used")}
                aria-valuemin={0}
                aria-valuemax={meter.limit || undefined}
                aria-valuenow={meter.used}
                aria-valuetext={meter.limit ? `${meter.percent}%` : $t("Unlimited")}
              >
                <ContextRing segments={meter.ring} circumference={contextRing} />
                <span class="context-meter-tip">
                  <span class="context-meter-head">
                    <strong>{meter.limit ? `${meter.percent}%` : $t("Unlimited")}</strong>
                    <span>{meter.limit
                      ? `${meter.used.toLocaleString($language)} / ${meter.limit.toLocaleString($language)}`
                      : $t("{count} tokens", { count: meter.used.toLocaleString($language) })}</span>
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
                        {$t(usageLabels[part.key])}
                        <b>{part.tokens.toLocaleString($language)}</b>
                      </span>
                    {/each}
                  </span>
                  <span class="context-meter-cost">
                    <span>{$t("Cost")}<b>{formatMoney(meter.cost, evaluated.effective.currency)}</b></span>
                    <span>{$t("Total")}<b>{formatMoney(meter.total, evaluated.effective.currency)}</b></span>
                  </span>
                </span>
              </span>
            {/if}
            <button class="send-button" type="submit" disabled={(!prompt.trim() && !pendingImages.length) || loading || attaching} aria-label={$t("Send message")}>
              <Icon name="arrow-up" />
            </button>
          </div>
        </div>
      </form>
      {#if error || evaluated.fieldsError || evaluated.configError}
        <p class="composer-error" role="alert">{$t(error || evaluated.fieldsError || evaluated.configError)} {#if evaluated.fieldsError || evaluated.configError || !evaluated.effective.apiKey.trim() || !evaluated.effective.baseUrl.trim()}<button type="button" onclick={() => navigate('/settings')}>{$t("Open Settings")}</button>{/if}</p>
      {/if}
    </div>
  {:else}
    <main class="settings">
      <div class="settings-heading">
        <h1>{$t("Settings")}</h1>
        <p>{$t("Changes save automatically.")}</p>
      </div>

      <form class="settings-form" oninput={saveSettings}>
        <section class="settings-card" aria-labelledby="language-title">
          <div class="setting-copy">
            <h2 id="language-title"><label for="language-input">{$t('Language')}</label></h2>
            <p>{$t('Choose the interface language.')}</p>
          </div>
          <div class="fields">
            <Select
              id="language-input"
              value={$language}
              options={languages}
              listLabel={$t('Language')}
              listName={$t('Language')}
              optionLanguages
              onchange={chooseLanguage}
            />
          </div>
        </section>
        <section class="settings-card" aria-labelledby="appearance-title">
          <div class="setting-copy">
            <h2 id="appearance-title">{$t("Appearance")}</h2>
            <p>{$t("Choose how MoteChat looks on this device.")}</p>
          </div>
          <div class="theme-picker" aria-label={$t("Theme")}>
            <button class:active={theme === 'system'} type="button" onclick={() => chooseTheme('system')}>
              <Icon name="monitor" />
              {$t("System")}
            </button>
            <button class:active={theme === 'light'} type="button" onclick={() => chooseTheme('light')}>
              <Icon name="sun" />
              {$t("Light")}
            </button>
            <button class:active={theme === 'dark'} type="button" onclick={() => chooseTheme('dark')}>
              <Icon name="moon" />
              {$t("Dark")}
            </button>
          </div>
        </section>

        <section class="settings-card connection" aria-labelledby="connection-title">
          <div class="setting-copy">
            <h2 id="connection-title">{$t("API connection")}</h2>
            <p>{$t("Create and switch connections. Credentials stay in your browser and are sent only to your Base URL.")}</p>
          </div>
          <div class="fields">
            <div class="model-field">
              <label for="connection-input"><span>{$t("Current connection")}</span></label>
              <div class="model-input-row">
                <Select
                  id="connection-input"
                  value={activeConnectionId}
                  options={connections.map((connection): [string, string] => [connection.id, connection.name])}
                  listLabel={$t("Connections")}
                  listName={$t("Connections")}
                  onchange={switchConnection}
                />
                <button
                  class="profile-action"
                  type="button"
                  aria-label={$t("New connection")}
                  title={$t("New connection")}
                  onclick={addConnection}
                >
                  <Icon name="plus" />
                </button>
                <button
                  class="profile-action"
                  type="button"
                  aria-label={$t("Duplicate connection")}
                  title={$t("Duplicate connection")}
                  onclick={copyConnection}
                >
                  <Icon name="duplicate" />
                </button>
                <button
                  class="profile-action"
                  type="button"
                  disabled={connections.length < 2}
                  aria-label={$t("Delete connection")}
                  title={$t("Delete connection")}
                  onclick={deleteConnection}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
            <label>
              <span>{$t("Name")}</span>
              <input bind:value={connectionName} placeholder={$t("Connection name")} />
            </label>
            <div class="field">
              <label for="api-key"><span>{$t("API Key")}</span></label>
              <div class="input-with-action">
                <input id="api-key" type={showApiKey ? 'text' : 'password'} bind:value={apiKey} placeholder="sk-••••••••••••••••" autocomplete="off" />
                <button
                  type="button"
                  aria-label={showApiKey ? $t("Hide API Key") : $t("Show API Key")}
                  aria-pressed={showApiKey}
                  title={showApiKey ? $t("Hide API Key") : $t("Show API Key")}
                  onclick={() => (showApiKey = !showApiKey)}
                >
                  {#if showApiKey}
                    <Icon name="eye" />
                  {:else}
                    <Icon name="eye-off" />
                  {/if}
                </button>
              </div>
              <small>{$t("Stored locally on this device.")}</small>
            </div>
            <label>
              <span>{$t("Base URL")}</span>
              <input type="url" bind:value={baseUrl} placeholder="https://api.openai.com/v1" spellcheck="false" />
              <small>{$t("Requests are sent to {endpoint}.", { endpoint: "/responses" })}</small>
            </label>
            <div class="model-field">
              <label for="model-input"><span>{$t("Model")}</span></label>
              <div class="model-input-row">
                <Select
                  id="model-input"
                  bind:value={model}
                  editable
                  placeholder={$t("Model ID")}
                  options={availableModels}
                  listLabel={$t("Available models")}
                  listName={$t("Available models")}
                  onchange={saveSettings}
                />
                <button
                  class="refresh-models"
                  class:loading={modelsLoading}
                  type="button"
                  disabled={!apiKey.trim() || !baseUrl.trim() || modelsLoading}
                  aria-label={modelsLoading ? $t("Refreshing model list") : $t("Refresh model list")}
                  aria-busy={modelsLoading}
                  title={$t("Refresh model list")}
                  onclick={refreshModels}
                >
                  <Icon name="refresh" />
                </button>
              </div>
              {#if modelsError}
                <small class="field-error" role="alert">{$t(modelsError)}</small>
              {:else if availableModels.length}
                <small>{$t("Models available: {count}. Choose one or enter a model ID.", { count: availableModels.length.toLocaleString($language) })}</small>
              {:else}
                <small>{$t("Enter a model ID, or refresh the list after adding an API Key and Base URL.")}</small>
              {/if}
            </div>
            <div class="model-field">
              <label for="effort-input"><span>{$t("Thinking intensity")}</span></label>
              <Select
                id="effort-input"
                bind:value={reasoningEffort}
                options={reasoningEffortOptions.map(([value, label]): [string, string] => [value, $t(label)])}
                listLabel={$t("Thinking intensity")}
                listName={$t("Thinking intensity")}
                onchange={saveSettings}
              />
              <small>{$t("Sent as {parameter}. Supported values vary by model.", { parameter: "reasoning.effort" })}</small>
            </div>
            <label>
              <span>{$t("Context length")}</span>
              <input id="context-length" type="number" min="1" step="1" bind:value={contextLength} placeholder={$t("Unlimited")} />
              <small>{$t("Model context window in tokens. Leave empty for unlimited context.")}</small>
            </label>
            <div class="model-field">
              <span class="field-label" id="currency-label">{$t("Currency")}</span>
              <div class="theme-picker pair" data-currency={currency} role="group" aria-labelledby="currency-label">
                <button class:active={currency === 'CNY'} type="button" onclick={() => chooseCurrency('CNY')}>CNY ¥</button>
                <button class:active={currency === 'USD'} type="button" onclick={() => chooseCurrency('USD')}>USD $</button>
              </div>
              <small>{$t("Used for model prices and the chat cost estimate.")}</small>
            </div>
            <label>
              <span>{$t("Cache hit input")}</span>
              <div class="input-with-action suffix">
                <input id="cache-hit-price" type="number" min="0" step="any" bind:value={cacheHitPrice} placeholder="0" />
                <span class="field-suffix">{$t("{symbol} / 1M tokens", { symbol: currency === "USD" ? "$" : "¥" })}</span>
              </div>
            </label>
            <label>
              <span>{$t("Cache miss input")}</span>
              <div class="input-with-action suffix">
                <input id="cache-miss-price" type="number" min="0" step="any" bind:value={cacheMissPrice} placeholder="0" />
                <span class="field-suffix">{$t("{symbol} / 1M tokens", { symbol: currency === "USD" ? "$" : "¥" })}</span>
              </div>
            </label>
            <label>
              <span>{$t("Output")}</span>
              <div class="input-with-action suffix">
                <input id="output-price" type="number" min="0" step="any" bind:value={outputPrice} placeholder="0" />
                <span class="field-suffix">{$t("{symbol} / 1M tokens", { symbol: currency === "USD" ? "$" : "¥" })}</span>
              </div>
            </label>
            <div class="model-field">
              <span class="field-label">
                <label for="fields-script">{$t("Fields")}</label>
                <span class="info">
                  <button type="button" aria-label={$t("Fields script types")}>
                    <Icon name="info" />
                  </button>
                  <pre class="info-tip" role="tooltip">{fieldsScriptHelp($t)}</pre>
                </span>
              </span>
              <Code
                id="fields-script"
                bind:value={fieldsScript}
                selectedKeys={evaluated.fields.map((field) => field.id)}
                placeholder={"return [\n  { id: 'tier', name: 'Tier', options: [\n    { id: 'fast', label: 'Fast' },\n    { id: 'expert', label: 'Expert' },\n  ]},\n]"}
              />
              {#if evaluated.fieldsError}
                <small class="field-error" role="alert">{$t(evaluated.fieldsError)}</small>
              {:else}
                <small>{$t("Composer switches. Omit id to use name/label; an option may be a string. Leave empty for none.")}</small>
              {/if}
            </div>
            <div class="model-field">
              <span class="field-label">
                <label for="config-script">{$t("Config")}</label>
                <span class="info">
                  <button type="button" aria-label={$t("Config script types")}>
                    <Icon name="info" />
                  </button>
                  <pre class="info-tip" role="tooltip">{configScriptHelp($t)}</pre>
                </span>
              </span>
              <Code
                id="config-script"
                bind:value={configScript}
                selectedKeys={evaluated.fields.map((field) => field.id)}
                placeholder={"return {\n  ...connection,\n  model: selected.tier === 'expert' ? 'gpt-5.6-sol' : 'gpt-5.6-luna',\n}"}
              />
              {#if evaluated.configError}
                <small class="field-error" role="alert">{$t(evaluated.configError)}</small>
              {:else}
                <small>{$t("Returned keys overlay the defaults above for requests. Leave empty to use the defaults.")}</small>
              {/if}
            </div>
          </div>
        </section>

        <section class="settings-card" aria-labelledby="profile-title">
          <div class="setting-copy">
            <h2 id="profile-title">{$t("Profile")}</h2>
            <p>{$t("Create and switch profiles. Each one stores its own icon, background, and instructions.")}</p>
          </div>
          <div class="fields">
            <div class="model-field">
              <label for="profile-input"><span>{$t("Current profile")}</span></label>
              <div class="model-input-row">
                <Select
                  id="profile-input"
                  value={activeProfileId}
                  options={profiles.map((profile): [string, string, string] => [profile.id, profile.name, profile.icon])}
                  listLabel={$t("Profiles")}
                  listName={$t("Profiles")}
                  onchange={switchProfile}
                />
                <button
                  class="profile-action"
                  type="button"
                  aria-label={$t("New profile")}
                  title={$t("New profile")}
                  onclick={addProfile}
                >
                  <Icon name="plus" />
                </button>
                <button
                  class="profile-action"
                  type="button"
                  disabled={profiles.length < 2}
                  aria-label={$t("Delete profile")}
                  title={$t("Delete profile")}
                  onclick={deleteProfile}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
            <label>
              <span>{$t("Name")}</span>
              <input bind:value={profileName} placeholder={$t("Profile name")} />
            </label>
            <div class="model-field">
              <label for="profile-icon-input"><span>{$t("Icon")}</span></label>
              <input
                id="profile-icon-input"
                bind:this={iconInput}
                type="file"
                accept="image/*"
                hidden
                onchange={(event) => {
                  setProfileIcon([...(event.currentTarget.files ?? [])]);
                  event.currentTarget.value = '';
                }}
              />
              <div class="profile-icon-row">
                <button
                  class="profile-icon"
                  type="button"
                  aria-label={profileIcon ? $t("Replace profile icon") : $t("Upload profile icon")}
                  title={profileIcon ? $t("Replace icon") : $t("Upload icon")}
                  onclick={() => iconInput.click()}
                >
                  {#if profileIcon}<img src={profileIcon} alt="" />{/if}
                </button>
                {#if profileIcon}
                  <button
                    class="profile-icon-clear"
                    type="button"
                    aria-label={$t("Remove profile icon")}
                    title={$t("Remove icon")}
                    onclick={() => { profileIcon = ''; saveSettings(); }}
                  >
                    <Icon name="close" />
                  </button>
                {/if}
              </div>
              {#if iconError}
                <small class="field-error" role="alert">{$t(iconError)}</small>
              {:else}
                <small>{$t("Shown next to assistant replies. Optional.")}</small>
              {/if}
            </div>
            <div class="model-field">
              <label for="profile-background-input"><span>{$t("Background")}</span></label>
              <input
                id="profile-background-input"
                bind:this={backgroundInput}
                type="file"
                accept="image/*"
                hidden
                onchange={(event) => {
                  setProfileBackground([...(event.currentTarget.files ?? [])]);
                  event.currentTarget.value = '';
                }}
              />
              <div class="profile-icon-row profile-background-row">
                <button
                  class="profile-background"
                  type="button"
                  aria-label={profileBackground ? $t("Replace profile background") : $t("Upload profile background")}
                  title={profileBackground ? $t("Replace background") : $t("Upload background")}
                  onclick={() => backgroundInput.click()}
                >
                  {#if profileBackground}<img src={profileBackground} alt="" />{/if}
                </button>
                {#if profileBackground}
                  <button
                    class="profile-icon-clear"
                    type="button"
                    aria-label={$t("Remove profile background")}
                    title={$t("Remove background")}
                    onclick={async () => {
                      try {
                        await removeBackgrounds([activeProfileId]);
                        setBackgroundUrl('');
                        backgroundError = '';
                        saveSettings();
                      } catch {
                        backgroundError = 'Could not remove this background.';
                      }
                    }}
                  >
                    <Icon name="close" />
                  </button>
                {/if}
              </div>
              {#if backgroundError}
                <small class="field-error" role="alert">{$t(backgroundError)}</small>
              {:else}
                <small>{$t("Shown behind conversations. Optional.")}</small>
              {/if}
            </div>
            <label>
              <span>{$t("Instructions")}</span>
              <textarea bind:value={systemPrompt} rows="6" placeholder={$t("You are a helpful assistant.")}></textarea>
              <small>{$t("Sent as the Responses API {parameter} parameter.", { parameter: "instructions" })}</small>
            </label>
          </div>
        </section>

      </form>
    </main>
  {/if}
</div>

{:else}
  <p class="loading-conversations">{$t("Loading conversations…")}</p>
{/if}

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
