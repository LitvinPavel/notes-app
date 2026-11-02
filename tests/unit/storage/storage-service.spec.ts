import { describe, it, expect, beforeEach } from 'vitest'
import {
  StorageService,
  CURRENT_SCHEMA_VERSION,
  NOTES_STORAGE_KEY,
  DRAFT_STORAGE_PREFIX,
  getDraftStorageKey
} from '~/services/storage/storage-service'
import type { Note, NoteDraft } from '~/types/note'

describe('StorageService (Versioned storage & migration)', () => {
  let service: StorageService

  beforeEach(() => {
    localStorage.clear()
    service = new StorageService()
  })

  it('loads default sample notes when storage is completely empty', () => {
    const notes = service.loadNotes()
    expect(notes.length).toBeGreaterThan(0)
    expect(notes[0]?.title).toBe('Добро пожаловать в Заметки')
  })

  it('persists notes with current schema version tag', () => {
    const customNotes: Note[] = [
      {
        id: 'test-1',
        title: 'Custom Note',
        createdAt: 1000,
        updatedAt: 2000,
        todos: [{ id: 'td-1', text: 'Item', completed: true }]
      }
    ]

    const success = service.saveNotes(customNotes)
    expect(success).toBe(true)

    const rawInStorage = localStorage.getItem(NOTES_STORAGE_KEY)
    expect(rawInStorage).not.toBeNull()

    const parsed = JSON.parse(rawInStorage!)
    expect(parsed.version).toBe(CURRENT_SCHEMA_VERSION)
    expect(parsed.notes).toHaveLength(1)
    expect(parsed.notes[0].title).toBe('Custom Note')
  })

  it('migrates legacy unversioned raw array to versioned payload', () => {
    const legacyArray = [
      {
        id: 'legacy-1',
        title: 'Legacy Note',
        createdAt: 500,
        updatedAt: 600,
        todos: []
      }
    ]

    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(legacyArray))

    const loaded = service.loadNotes()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.title).toBe('Legacy Note')

    // Verify it was re-saved with version 1
    const stored = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY)!)
    expect(stored.version).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('handles corrupt/malformed JSON in storage gracefully without throwing', () => {
    localStorage.setItem(NOTES_STORAGE_KEY, '{invalid json: corrupted...')

    const notes = service.loadNotes()
    expect(Array.isArray(notes)).toBe(true)
    expect(notes.length).toBeGreaterThan(0)
  })

  it('correctly persists, retrieves, and clears unsaved drafts by note ID', () => {
    expect(DRAFT_STORAGE_PREFIX).toBe('notes_app_draft_')
    expect(service.getDraft('existing-id')).toBeNull()

    const draft: NoteDraft = {
      noteId: 'existing-id',
      title: 'Draft in progress',
      todos: [{ id: 'd-1', text: 'Draft task', completed: false }],
      updatedAt: 5000
    }

    service.saveDraft(draft)
    const retrieved = service.getDraft('existing-id')

    expect(retrieved).not.toBeNull()
    expect(retrieved?.title).toBe('Draft in progress')
    expect(retrieved?.todos[0]?.text).toBe('Draft task')

    service.clearDraft('existing-id')
    expect(service.getDraft('existing-id')).toBeNull()
    expect(localStorage.getItem(getDraftStorageKey('existing-id'))).toBeNull()
  })

  it('isolates drafts across different notes and tabs without overwriting each other', () => {
    const draftNoteA: NoteDraft = {
      noteId: 'note-a',
      title: 'Draft for Note A',
      todos: [{ id: 'da-1', text: 'Task A', completed: false }],
      updatedAt: 1000
    }

    const draftNoteB: NoteDraft = {
      noteId: 'note-b',
      title: 'Draft for Note B',
      todos: [{ id: 'db-1', text: 'Task B', completed: true }],
      updatedAt: 2000
    }

    const draftNewNote: NoteDraft = {
      noteId: null,
      title: 'Draft for Brand New Note',
      todos: [{ id: 'dn-1', text: 'New Task', completed: false }],
      updatedAt: 3000
    }

    // Save all three drafts concurrently
    service.saveDraft(draftNoteA)
    service.saveDraft(draftNoteB)
    service.saveDraft(draftNewNote)

    // Verify each draft is completely independent and correctly retrieved
    const retrievedA = service.getDraft('note-a')
    const retrievedB = service.getDraft('note-b')
    const retrievedNew = service.getDraft(null)

    expect(retrievedA?.title).toBe('Draft for Note A')
    expect(retrievedB?.title).toBe('Draft for Note B')
    expect(retrievedNew?.title).toBe('Draft for Brand New Note')

    // Clearing draft for Note A does not touch Note B or New Note
    service.clearDraft('note-a')
    expect(service.getDraft('note-a')).toBeNull()
    expect(service.getDraft('note-b')).not.toBeNull()
    expect(service.getDraft(null)).not.toBeNull()
  })

  it('isolates drafts for new notes between different browser tab sessions', () => {
    const draftTab1: NoteDraft = {
      noteId: null,
      sessionId: 'tab-session-1',
      title: 'New Note in Tab 1',
      todos: [{ id: 't1', text: 'Task 1', completed: false }],
      updatedAt: 1000
    }
    const draftTab2: NoteDraft = {
      noteId: null,
      sessionId: 'tab-session-2',
      title: 'New Note in Tab 2',
      todos: [{ id: 't2', text: 'Task 2', completed: false }],
      updatedAt: 2000
    }

    service.saveDraft(draftTab1, 'tab-session-1')
    service.saveDraft(draftTab2, 'tab-session-2')

    const retrievedTab1 = service.getDraft(null, 'tab-session-1')
    const retrievedTab2 = service.getDraft(null, 'tab-session-2')

    expect(retrievedTab1?.title).toBe('New Note in Tab 1')
    expect(retrievedTab2?.title).toBe('New Note in Tab 2')

    service.clearDraft(null, 'tab-session-1')
    expect(service.getDraft(null, 'tab-session-1')).toBeNull()
    expect(service.getDraft(null, 'tab-session-2')).not.toBeNull()
  })

  it('protects newer schema versions from being overwritten or downgraded', () => {
    const futurePayload = {
      version: 99,
      notes: [
        {
          id: 'future-note',
          title: 'Future note',
          todos: [],
          createdAt: 1000,
          updatedAt: 1000
        }
      ]
    }
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(futurePayload))

    // Reading notes should succeed in read-only mode
    const notes = service.loadNotes()
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toBe('future-note')

    // Storage should NOT be downgraded
    const rawAfterLoad = localStorage.getItem(NOTES_STORAGE_KEY)
    expect(JSON.parse(rawAfterLoad!).version).toBe(99)

    // Attempting to save notes should be blocked to prevent overwriting newer schema
    const saveResult = service.saveNotes([])
    expect(saveResult).toBe(false)
    expect(JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY)!).version).toBe(99)
  })

  it('correctly falls back to inMemoryStorage when localStorage throws quota error', () => {
    const originalSetItem = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    service.saveDraft({
      noteId: 'in-memory-test',
      title: 'Memory Draft',
      todos: [],
      updatedAt: 1234
    })

    // Should be retrievable from in-memory fallback even though localStorage.getItem returns null
    const retrieved = service.getDraft('in-memory-test')
    expect(retrieved).not.toBeNull()
    expect(retrieved?.title).toBe('Memory Draft')

    // Restore
    localStorage.setItem = originalSetItem
  })
})
