import { describe, it, expect, beforeEach } from 'vitest'
import {
  StorageService,
  CURRENT_SCHEMA_VERSION,
  NOTES_STORAGE_KEY,
  DRAFT_STORAGE_KEY
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

  it('correctly persists, retrieves, and clears unsaved drafts', () => {
    expect(service.getDraft()).toBeNull()

    const draft: NoteDraft = {
      noteId: 'existing-id',
      title: 'Draft in progress',
      todos: [{ id: 'd-1', text: 'Draft task', completed: false }],
      updatedAt: 5000
    }

    service.saveDraft(draft)
    const retrieved = service.getDraft()

    expect(retrieved).not.toBeNull()
    expect(retrieved?.title).toBe('Draft in progress')
    expect(retrieved?.todos[0]?.text).toBe('Draft task')

    service.clearDraft()
    expect(service.getDraft()).toBeNull()
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })
})
