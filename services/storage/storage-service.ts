import type { Note, NoteDraft, StoredNotesPayload, StorageMigration } from '~/types/note'

export const CURRENT_SCHEMA_VERSION = 1
export const NOTES_STORAGE_KEY = 'notes_app_data'
export const DRAFT_STORAGE_PREFIX = 'notes_app_draft_'
export const TAB_SESSION_STORAGE_KEY = 'notes_app_tab_session'

/**
 * Returns or generates a unique session ID for the current browser tab.
 * Survives page reloads within the same tab, but is completely isolated between tabs.
 */
export function getTabSessionId(): string {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return 'default'
  }
  try {
    let id = window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY)
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, id)
    }
    return id
  } catch {
    return 'default'
  }
}

/**
 * Generates storage key for a draft, scoped to noteId and tab session.
 */
export function getDraftStorageKey(noteId: string | null, sessionId?: string): string {
  const sId = sessionId ?? (typeof window !== 'undefined' ? getTabSessionId() : 'default')
  const nId = noteId || 'new'
  return `${DRAFT_STORAGE_PREFIX}${nId}_${sId}`
}

/**
 * Default sample notes for first-time launch.
 */
export const DEFAULT_INITIAL_NOTES: Note[] = [
  {
    id: 'note-welcome',
    title: 'Добро пожаловать в Заметки',
    createdAt: Date.now() - 3600000 * 24,
    updatedAt: Date.now() - 3600000 * 24,
    todos: [
      { id: 'todo-1', text: 'Изучить возможности приложения', completed: true },
      { id: 'todo-2', text: 'Попробовать редактирование и отмену Ctrl+Z', completed: false },
      { id: 'todo-3', text: 'Добавить свои пункты задач', completed: false },
      { id: 'todo-4', text: 'Проверить восстановление черновика', completed: false }
    ]
  },
  {
    id: 'note-groceries',
    title: 'Список покупок к ужину',
    createdAt: Date.now() - 3600000 * 12,
    updatedAt: Date.now() - 3600000 * 12,
    todos: [
      { id: 'todo-g1', text: 'Свежая зелень и томаты черри', completed: true },
      { id: 'todo-g2', text: 'Оливковое масло extra virgin', completed: true },
      { id: 'todo-g3', text: 'Спагетти из твердых сортов', completed: false }
    ]
  }
]

/**
 * Migration registry for future schema evolution.
 */
const MIGRATIONS: StorageMigration[] = [
  // Migration for v0 -> v1 (legacy array format without version)
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: (raw: unknown): StoredNotesPayload => {
      if (Array.isArray(raw)) {
        return {
          version: 1,
          notes: raw as Note[]
        }
      }
      return {
        version: 1,
        notes: []
      }
    }
  }
]

export class StorageService {
  private inMemoryStorage: Map<string, string> = new Map()

  private isLocalStorageAvailable(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false
    }
    try {
      const testKey = '__storage_test__'
      window.localStorage.setItem(testKey, testKey)
      window.localStorage.removeItem(testKey)
      return true
    } catch {
      return false
    }
  }

  private getItem(key: string): string | null {
    if (this.isLocalStorageAvailable()) {
      try {
        const val = window.localStorage.getItem(key)
        if (val !== null) {
          return val
        }
      } catch (err) {
        console.warn(`[StorageService] Failed to read ${key} from localStorage:`, err)
      }
    }
    // Fallback to in-memory storage if localStorage returned null or threw
    return this.inMemoryStorage.get(key) ?? null
  }

  private setItem(key: string, value: string): void {
    if (this.isLocalStorageAvailable()) {
      try {
        window.localStorage.setItem(key, value)
        this.inMemoryStorage.delete(key)
        return
      } catch (err) {
        console.warn(`[StorageService] Failed to write ${key} to localStorage:`, err)
      }
    }
    this.inMemoryStorage.set(key, value)
  }

  private removeItem(key: string): void {
    if (this.isLocalStorageAvailable()) {
      try {
        window.localStorage.removeItem(key)
      } catch (err) {
        console.warn(`[StorageService] Failed to remove ${key} from localStorage:`, err)
      }
    }
    this.inMemoryStorage.delete(key)
  }

  /**
   * Load notes from storage with schema validation & migrations.
   * Protects newer schema versions from being overwritten or downgraded.
   */
  public loadNotes(): Note[] {
    const raw = this.getItem(NOTES_STORAGE_KEY)
    if (!raw) {
      // Initialize with default notes on fresh launch
      this.saveNotes(DEFAULT_INITIAL_NOTES)
      return [...DEFAULT_INITIAL_NOTES]
    }

    try {
      const parsed = JSON.parse(raw) as unknown

      // Check if data matches stored payload structure
      if (this.isStoredPayload(parsed)) {
        if (parsed.version === CURRENT_SCHEMA_VERSION) {
          return this.sanitizeNotes(parsed.notes)
        }

        // Newer schema version detected: read-only mode to prevent data corruption or downgrading
        if (parsed.version > CURRENT_SCHEMA_VERSION) {
          console.warn(
            `[StorageService] Storage schema version ${parsed.version} is newer than current application version ${CURRENT_SCHEMA_VERSION}. Running in read-only mode without overwriting storage.`
          )
          return this.sanitizeNotes(parsed.notes)
        }

        // Older version: execute sequential migrations
        const migrated = this.runMigrations(parsed, parsed.version, CURRENT_SCHEMA_VERSION)
        this.saveNotes(migrated.notes)
        return migrated.notes
      }

      // Legacy format (e.g. raw array without version envelope)
      if (Array.isArray(parsed)) {
        const migrated = this.runMigrations(parsed, 0, CURRENT_SCHEMA_VERSION)
        this.saveNotes(migrated.notes)
        return migrated.notes
      }

      console.warn('[StorageService] Unknown storage structure. Reinitializing with defaults.')
      this.saveNotes(DEFAULT_INITIAL_NOTES)
      return [...DEFAULT_INITIAL_NOTES]
    } catch (err) {
      console.error('[StorageService] Error parsing stored notes:', err)
      return [...DEFAULT_INITIAL_NOTES]
    }
  }

  /**
   * Save notes to persistent storage.
   * Refuses to overwrite if existing storage contains a newer schema version.
   */
  public saveNotes(notes: Note[]): boolean {
    const existingRaw = this.getItem(NOTES_STORAGE_KEY)
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as unknown
        if (this.isStoredPayload(existing) && existing.version > CURRENT_SCHEMA_VERSION) {
          console.warn(
            `[StorageService] Refusing to overwrite storage: existing schema version ${existing.version} is newer than application version ${CURRENT_SCHEMA_VERSION}.`
          )
          return false
        }
      } catch {
        // proceed if unparseable
      }
    }

    const payload: StoredNotesPayload = {
      version: CURRENT_SCHEMA_VERSION,
      notes: this.sanitizeNotes(notes)
    }

    try {
      this.setItem(NOTES_STORAGE_KEY, JSON.stringify(payload))
      return true
    } catch (err) {
      console.error('[StorageService] Failed to persist notes:', err)
      return false
    }
  }

  /**
   * Save an unsaved draft to survive page reload, isolated per note ID and tab session.
   */
  public saveDraft(draft: NoteDraft, sessionId?: string): void {
    const sId = sessionId || draft.sessionId || (typeof window !== 'undefined' ? getTabSessionId() : 'default')
    const key = getDraftStorageKey(draft.noteId, sId)
    const payload: NoteDraft = {
      ...draft,
      sessionId: sId
    }

    try {
      this.setItem(key, JSON.stringify(payload))
    } catch (err) {
      console.error(`[StorageService] Failed to persist draft for ${key}:`, err)
    }
  }

  /**
   * Retrieve active draft for a specific note ID if one exists, matching tab session with fallbacks.
   */
  public getDraft(noteId: string | null = null, sessionId?: string): NoteDraft | null {
    const sId = sessionId ?? (typeof window !== 'undefined' ? getTabSessionId() : 'default')
    const sessionKey = getDraftStorageKey(noteId, sId)
    let raw = this.getItem(sessionKey)

    // Fallback checks for backwards-compatibility
    if (!raw) {
      const legacyKey = `${DRAFT_STORAGE_PREFIX}${noteId || 'new'}`
      raw = this.getItem(legacyKey)
    }

    // If opening an existing note in a new tab without its own draft, discover any uncommitted draft
    if (!raw && noteId && this.isLocalStorageAvailable()) {
      try {
        const prefix = `${DRAFT_STORAGE_PREFIX}${noteId}`
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i)
          if (k && k.startsWith(prefix)) {
            raw = window.localStorage.getItem(k)
            break
          }
        }
      } catch {
        // ignore
      }
    }

    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as NoteDraft
      if (typeof parsed === 'object' && parsed !== null && 'title' in parsed && Array.isArray(parsed.todos)) {
        return {
          noteId: parsed.noteId ?? null,
          sessionId: parsed.sessionId || sId,
          title: typeof parsed.title === 'string' ? parsed.title : '',
          todos: Array.isArray(parsed.todos) ? parsed.todos.map(t => ({
            id: String(t.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `todo-${Date.now()}`)),
            text: String(t.text || ''),
            completed: Boolean(t.completed)
          })) : [],
          updatedAt: Number(parsed.updatedAt) || Date.now()
        }
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Clear active draft for a specific note ID upon save, cancel, or when returning to clean state.
   */
  public clearDraft(noteId: string | null = null, sessionId?: string): void {
    const sId = sessionId ?? (typeof window !== 'undefined' ? getTabSessionId() : 'default')
    this.removeItem(getDraftStorageKey(noteId, sId))
    this.removeItem(`${DRAFT_STORAGE_PREFIX}${noteId || 'new'}`)
  }

  private isStoredPayload(value: unknown): value is StoredNotesPayload {
    return (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      typeof (value as { version: unknown }).version === 'number' &&
      'notes' in value &&
      Array.isArray((value as { notes: unknown }).notes)
    )
  }

  private sanitizeNotes(notes: Note[]): Note[] {
    return notes.map(note => ({
      id: String(note.id),
      title: String(note.title ?? ''),
      todos: Array.isArray(note.todos)
        ? note.todos.map(t => ({
            id: String(t.id),
            text: String(t.text ?? ''),
            completed: Boolean(t.completed)
          }))
        : [],
      createdAt: Number(note.createdAt) || Date.now(),
      updatedAt: Number(note.updatedAt) || Date.now()
    }))
  }

  private runMigrations(data: unknown, fromVersion: number, toVersion: number): StoredNotesPayload {
    if (fromVersion > toVersion) {
      throw new Error(`[StorageService] Cannot downgrade schema version from ${fromVersion} to ${toVersion}`)
    }

    let currentData = data
    let currentVer = fromVersion

    while (currentVer < toVersion) {
      const migration = MIGRATIONS.find(m => m.fromVersion === currentVer)
      if (!migration) {
        console.warn(`[StorageService] No migration found from version ${currentVer}. Fallback to empty.`)
        return { version: toVersion, notes: [] }
      }
      const migrated = migration.migrate(currentData)
      currentData = migrated
      currentVer = migration.toVersion
    }

    return currentData as StoredNotesPayload
  }
}

export const storageService = new StorageService()
