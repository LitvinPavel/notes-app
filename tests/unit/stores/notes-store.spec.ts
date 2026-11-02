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

  it('strictly blocks updating and resurrecting a remotely deleted note', () => {
    const store = useNotesStore()
    store.init()

    const note = store.createNote('Active Note', [{ id: '1', text: 'Task', completed: false }])

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

    const note = store.createNote('Original Note', [])

    // Remote deletion happens
    storageService.saveNotes([])
    store.handleStorageEvent({ key: NOTES_STORAGE_KEY } as StorageEvent)

    // Save as new note
    const savedAsNew = store.createNote('Saved Copy of Original Note', [
      { id: 'new-1', text: 'Important uncommitted work', completed: false }
    ])

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
})
