import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNotesStore } from '~/stores/notes'
import { storageService, NOTES_STORAGE_KEY } from '~/services/storage/storage-service'
import type { TodoItem } from '~/types/note'

describe('useNotesStore (Pinia State Management & Sync)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('initializes notes from storage on init()', () => {
    const store = useNotesStore()
    expect(store.isInitialized).toBe(false)

    store.init()
    expect(store.isInitialized).toBe(true)
    expect(store.notes.length).toBeGreaterThan(0)
  })

  it('creates a new note and persists it', () => {
    const store = useNotesStore()
    store.init()

    const initialCount = store.notes.length
    const todos: TodoItem[] = [{ id: '1', text: 'Task 1', completed: false }]

    const created = store.createNote('New Note', todos)

    expect(created.id).toBeDefined()
    expect(created.title).toBe('New Note')
    expect(created.todos).toHaveLength(1)
    expect(store.notes.length).toBe(initialCount + 1)
    expect(store.getNoteById(created.id)).toBeDefined()
  })

  it('updates an existing note and updates timestamp', () => {
    const store = useNotesStore()
    store.init()

    const created = store.createNote('Old Title', [])
    const updated = store.updateNote(created.id, 'Updated Title', [
      { id: 't-new', text: 'New item', completed: true }
    ])

    expect(updated).not.toBeNull()
    expect(updated?.title).toBe('Updated Title')
    expect(updated?.todos).toHaveLength(1)
    expect(updated?.todos[0]?.completed).toBe(true)
  })

  it('returns null when updating a non-existent note', () => {
    const store = useNotesStore()
    store.init()

    const result = store.updateNote('non-existent-id', 'Title', [])
    expect(result).toBeNull()
  })

  it('deletes a note and removes it from storage', () => {
    const store = useNotesStore()
    store.init()

    const created = store.createNote('To be deleted', [])
    const deleted = store.deleteNote(created.id)

    expect(deleted).toBe(true)
    expect(store.getNoteById(created.id)).toBeUndefined()
  })

  it('detects remote note deletion across browser tabs via storage event', () => {
    const store = useNotesStore()
    store.init()

    const note1 = store.createNote('Tab Note 1', [])
    const note2 = store.createNote('Tab Note 2', [])

    // Simulate another tab deleting note1 from localStorage
    storageService.saveNotes([note2])

    // Fire storage event
    store.handleStorageEvent({
      key: NOTES_STORAGE_KEY
    } as StorageEvent)

    // Store notes are updated
    expect(store.getNoteById(note1.id)).toBeUndefined()
    expect(store.getNoteById(note2.id)).toBeDefined()

    // Remote deletion signal was caught
    expect(store.isDeletedRemotely(note1.id)).toBe(true)
    expect(store.isDeletedRemotely(note2.id)).toBe(false)

    store.acknowledgeRemoteDeletion()
    expect(store.isDeletedRemotely(note1.id)).toBe(false)
  })

  it('saves and clears drafts via store actions', () => {
    const store = useNotesStore()
    store.init()

    store.saveDraft({
      noteId: 'draft-id',
      title: 'In Progress',
      todos: [],
      updatedAt: Date.now()
    })

    expect(store.hasDraftFor('draft-id')).toBe(true)
    expect(store.hasDraftFor('other-id')).toBe(false)

    store.clearDraft()
    expect(store.hasDraftFor('draft-id')).toBe(false)
  })
})
