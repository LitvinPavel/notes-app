import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNotesStore } from '~/stores/notes'
import { storageService, NOTES_STORAGE_KEY, DRAFT_STORAGE_PREFIX } from '~/services/storage/storage-service'
import type { TodoItem, NoteDraft } from '~/types/note'

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

    const created = store.createNote('New Note', todos)!

    expect(created.id).toBeDefined()
    expect(created.title).toBe('New Note')
    expect(created.todos).toHaveLength(1)
    expect(store.notes.length).toBe(initialCount + 1)
    expect(store.getNoteById(created.id)).toBeDefined()
  })

  it('updates an existing note and updates timestamp', () => {
    const store = useNotesStore()
    store.init()

    const created = store.createNote('Old Title', [])!
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

    const created = store.createNote('To be deleted', [])!
    const deleted = store.deleteNote(created.id)

    expect(deleted).toBe(true)
    expect(store.getNoteById(created.id)).toBeUndefined()
  })

  it('detects remote note deletion across browser tabs via storage event', () => {
    const store = useNotesStore()
    store.init()

    const note1 = store.createNote('Tab Note 1', [])!
    const note2 = store.createNote('Tab Note 2', [])!

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

  it('strictly blocks updating and resurrecting a remotely deleted note', () => {
    const store = useNotesStore()
    store.init()

    const note = store.createNote('Active Note', [{ id: '1', text: 'Task', completed: false }])!

    // Simulate remote tab deleting the note
    storageService.saveNotes([])
    store.handleStorageEvent({ key: NOTES_STORAGE_KEY } as StorageEvent)

    expect(store.isDeletedRemotely(note.id)).toBe(true)

    // User attempts to save / update the deleted note
    const updateResult = store.updateNote(note.id, 'Resurrected Note', [])

    // Update must be denied (returns null) and store notes must not be corrupted
    expect(updateResult).toBeNull()
    expect(store.getNoteById(note.id)).toBeUndefined()
    expect(store.notes).toHaveLength(0)
  })

  it('allows saving unsaved work as a new note when remote deletion occurs', () => {
    const store = useNotesStore()
    store.init()

    const note = store.createNote('Original Note', [])!

    // Remote deletion happens
    storageService.saveNotes([])
    store.handleStorageEvent({ key: NOTES_STORAGE_KEY } as StorageEvent)

    // Save as new note
    const savedAsNew = store.createNote('Saved Copy of Original Note', [
      { id: 'new-1', text: 'Important uncommitted work', completed: false }
    ])!

    store.acknowledgeRemoteDeletion(note.id)

    expect(savedAsNew.id).not.toBe(note.id)
    expect(savedAsNew.title).toBe('Saved Copy of Original Note')
    expect(store.notes).toHaveLength(1)
    expect(store.getNoteById(savedAsNew.id)).toBeDefined()
    expect(store.isDeletedRemotely(note.id)).toBe(false)
  })

  it('manages drafts isolated per note ID and handles cross-tab draft updates', () => {
    const store = useNotesStore()
    store.init()

    const draft1: NoteDraft = {
      noteId: 'note-1',
      title: 'Draft for Note 1',
      todos: [],
      updatedAt: 1000
    }

    const draft2: NoteDraft = {
      noteId: 'note-2',
      title: 'Draft for Note 2',
      todos: [],
      updatedAt: 2000
    }

    store.saveDraft(draft1)
    store.saveDraft(draft2)

    expect(store.hasDraftFor('note-1')).toBe(true)
    expect(store.hasDraftFor('note-2')).toBe(true)
    expect(store.getDraftFor('note-1')?.title).toBe('Draft for Note 1')
    expect(store.getDraftFor('note-2')?.title).toBe('Draft for Note 2')

    // Clearing draft for note-1 preserves draft for note-2
    store.clearDraft('note-1')
    expect(store.hasDraftFor('note-1')).toBe(false)
    expect(store.hasDraftFor('note-2')).toBe(true)

    // Cross-tab storage event for draft update
    const remoteDraft: NoteDraft = {
      noteId: 'note-remote',
      title: 'Remote Tab Draft',
      todos: [],
      updatedAt: 3000
    }
    storageService.saveDraft(remoteDraft)

    store.handleStorageEvent({
      key: `${DRAFT_STORAGE_PREFIX}note-remote`
    } as StorageEvent)

    expect(store.hasDraftFor('note-remote')).toBe(true)
    expect(store.getDraftFor('note-remote')?.title).toBe('Remote Tab Draft')
  })

  it('detects concurrent modification conflict via expectedUpdatedAt', () => {
    const store = useNotesStore()
    store.init()

    const note = store.createNote('Original Note', [])!
    const initialUpdatedAt = note.updatedAt

    // Simulate another tab modifying the note in storage
    const freshInStorage = storageService.loadNotes()
    freshInStorage[0] = {
      ...freshInStorage[0]!,
      title: 'Modified in Tab A',
      updatedAt: initialUpdatedAt + 5000
    }
    storageService.saveNotes(freshInStorage)

    // Tab B attempts to update with the stale expectedUpdatedAt
    const result = store.updateNote(note.id, 'Stale Update from Tab B', [], initialUpdatedAt)

    // Must return null (conflict detected!)
    expect(result).toBeNull()

    // Storage must still retain Tab A's modifications
    const current = storageService.loadNotes().find(n => n.id === note.id)
    expect(current?.title).toBe('Modified in Tab A')
  })

  it('mitigates array-level clobbering by reloading latest storage before write, while acknowledging client-side concurrency boundaries', () => {
    // Note: Pure client-side localStorage does not provide ACID multi-process transactions.
    // Re-reading localStorage before applying mutations significantly reduces the race window,
    // but in high-concurrency production systems Web Locks API or IndexedDB transactions are required.
    const store = useNotesStore()
    store.init()

    const note1 = store.createNote('Note 1', [])
    const note2 = store.createNote('Note 2', [])
    expect(note1).not.toBeNull()
    expect(note2).not.toBeNull()

    // Simulate Tab A modifying note1 in storage directly
    const storageNotes = storageService.loadNotes()
    const n1 = storageNotes.find(n => n.id === note1!.id)!
    n1.title = 'Note 1 updated by Tab A'
    storageService.saveNotes(storageNotes)

    // Tab B (current store instance) modifies note2
    store.updateNote(note2!.id, 'Note 2 updated by Tab B', [])

    // Re-check storage: both Note 1 and Note 2 updates must be present!
    const finalNotes = storageService.loadNotes()
    const savedN1 = finalNotes.find(n => n.id === note1!.id)
    const savedN2 = finalNotes.find(n => n.id === note2!.id)

    expect(savedN1?.title).toBe('Note 1 updated by Tab A')
    expect(savedN2?.title).toBe('Note 2 updated by Tab B')
  })

  it('fails gracefully and preserves draft when storageService.saveNotes returns false (e.g. read-only schema mode)', () => {
    const store = useNotesStore()
    store.init()

    // Mock saveNotes to simulate write refusal
    const originalSaveNotes = storageService.saveNotes.bind(storageService)
    storageService.saveNotes = () => false

    store.saveDraft({
      noteId: null,
      title: 'Unsaved New Draft',
      todos: [],
      updatedAt: 1000
    })

    const created = store.createNote('Failing Note', [])
    expect(created).toBeNull()
    // Draft must be preserved!
    expect(store.hasDraftFor(null)).toBe(true)

    // Restore saveNotes
    storageService.saveNotes = originalSaveNotes
  })

  it('fails gracefully and preserves draft on updateNote when storage write fails', () => {
    const store = useNotesStore()
    store.init()

    const note = store.createNote('Active Note', [])
    expect(note).not.toBeNull()

    store.saveDraft({
      noteId: note!.id,
      title: 'Draft for Active Note',
      todos: [],
      updatedAt: 2000
    })

    // Simulate storage failure
    const originalSaveNotes = storageService.saveNotes.bind(storageService)
    storageService.saveNotes = () => false

    const updated = store.updateNote(note!.id, 'New Title That Fails', [])
    expect(updated).toBeNull()
    // Draft must NOT be cleared!
    expect(store.hasDraftFor(note!.id)).toBe(true)

    storageService.saveNotes = originalSaveNotes
  })

  it('fails gracefully and preserves note when deleteNote storage write fails', () => {
    const store = useNotesStore()
    store.init()

    const note = store.createNote('Note To Keep', [])
    expect(note).not.toBeNull()

    const originalSaveNotes = storageService.saveNotes.bind(storageService)
    storageService.saveNotes = () => false

    const deleted = store.deleteNote(note!.id)
    expect(deleted).toBe(false)
    expect(store.getNoteById(note!.id)).toBeDefined()

    storageService.saveNotes = originalSaveNotes
  })

  it('propagates quota_exceeded error from storageService to store.storageFailureReason', () => {
    const store = useNotesStore()
    store.init()

    const orig = localStorage.setItem
    Object.defineProperty(localStorage, 'setItem', {
      value: () => {
        throw new DOMException('Disk quota exceeded', 'QuotaExceededError')
      },
      configurable: true
    })

    const created = store.createNote('Failing Quota Note', [])
    expect(created).toBeNull()
    expect(store.storageFailureReason).toBe('quota_exceeded')

    Object.defineProperty(localStorage, 'setItem', { value: orig, configurable: true })
  })
})
