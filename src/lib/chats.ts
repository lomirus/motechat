import type { TokenUsage } from './responses'

export type Message = { role: 'user' | 'assistant'; content: string; images?: string[]; reasoning?: string; tokensPerSecond?: number; timeToFirstToken?: number }
export type Chat = {
  id: string
  profileId: string
  title: string
  updatedAt: number
  messages: Message[]
  prompt: string
  pendingImages: string[]
  tokenUsage?: TokenUsage
  chatUsage?: TokenUsage
}

let database: Promise<IDBDatabase> | undefined

function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('motechat')
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = undefined; reject(request.error) }
  })
}

export async function loadChats(): Promise<Chat[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('chats').objectStore('chats').getAll()
    request.onsuccess = () => resolve(request.result as Chat[])
    request.onerror = () => reject(request.error)
  })
}

export async function saveChat(chat: Chat) {
  // Snapshot before awaiting so later streaming updates cannot change this write.
  const snapshot = structuredClone(chat)
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite')
    transaction.objectStore('chats').put(snapshot)
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function removeChats(ids: string[]) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite')
    for (const id of ids) transaction.objectStore('chats').delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}

let backgroundDatabase: Promise<IDBDatabase> | undefined

function openBackgrounds() {
  return backgroundDatabase ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('motechat-backgrounds')
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('backgrounds')) request.result.createObjectStore('backgrounds')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { backgroundDatabase = undefined; reject(request.error) }
  })
}

export async function loadBackground(profileId: string): Promise<Blob | undefined> {
  const db = await openBackgrounds()
  return new Promise((resolve, reject) => {
    const request = db.transaction('backgrounds').objectStore('backgrounds').get(profileId)
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function saveBackground(profileId: string, blob: Blob) {
  const db = await openBackgrounds()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('backgrounds', 'readwrite')
    transaction.objectStore('backgrounds').put(blob, profileId)
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function removeBackgrounds(ids: string[]) {
  if (!ids.length) return
  const db = await openBackgrounds()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('backgrounds', 'readwrite')
    for (const id of ids) transaction.objectStore('backgrounds').delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}
