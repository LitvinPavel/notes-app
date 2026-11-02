import { defineStore } from 'pinia'
import type { Note, TodoItem, NoteDraft } from '~/types/note'
import {
  storageService,
  NOTES_STORAGE_KEY,
  DRAFT_STORAGE_PREFIX
} from '~/services/storage/storage-service'

interface NotesState {
  notes: Note[]
  isInitialized: boolean
  draftsByNoteId: Record<string, NoteDraft | null>
  deletedRemoteIds: string[]
}

export const useNotesStore = defineStore('notes', {
  state: (): NotesState => ({
    notes: [],
    isInitialized: false,
    draftsByNoteId: {},
    deletedRemoteIds: []
  }),

  getters: {
    allNotes: (state): Note[] => {
      // Return notes sorted with latest updated first
      return [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt)
    },

    getNoteById: (state) => {
      return (id: string): Note | undefined => {
        return state.notes.find(n => n.id === id)
      }
    },

    getDraftFor: (state) => {
      return (noteId: string | null, sessionId?: string): NoteDraft | null => {
        const key = noteId || 'new'
        if (key in state.draftsByNoteId && state.draftsByNoteId[key]) {
          return state.draftsByNoteId[key]
        }
        return storageService.getDraft(noteId, sessionId)
      }
    },

    hasDraftFor: (state) => {
      return (noteId: string | null, sessionId?: string): boolean => {
        const key = noteId || 'new'
        const draft = (key in state.draftsByNoteId && state.draftsByNoteId[key])
          ? state.draftsByNoteId[key]
          : storageService.getDraft(noteId, sessionId)
        return draft !== null && draft !== undefined
      }
    },

    isDeletedRemotely: (state) => {
      return (id: string): boolean => {
        return state.deletedRemoteIds.includes(id)
      }
    },

    deletedInAnotherTabId: (state): string | null => {
      return state.deletedRemoteIds[state.deletedRemoteIds.length - 1] ?? null
    },

    // Backwards-compatible getter
    activeDraft: (state): NoteDraft | null => {
      for (const draft of Object.values(state.draftsByNoteId)) {
        if (draft !== null) return draft
      }
      return storageService.getDraft(null)
    }
  },

  actions: {
    /**
     * Initialize store from persistent storage and attach cross-tab listener.
     */
    init(): void {
      if (this.isInitialized) return

      this.notes = storageService.loadNotes()
      this.isInitialized = true

      // Multi-tab synchronization via storage event
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', this.handleStorageEvent)
      }
    },

    handleStorageEvent(event: StorageEvent): void {
      if (event.key === NOTES_STORAGE_KEY) {
        const previousIds = new Set(this.notes.map(n => n.id))
        const updatedNotes = storageService.loadNotes()
        const newIds = new Set(updatedNotes.map(n => n.id))

        // Collect newly deleted note IDs
        const newlyDeleted: string[] = []
        for (const id of previousIds) {
          if (!newIds.has(id)) {
            newlyDeleted.push(id)
          }
        }

        if (newlyDeleted.length > 0) {
          this.deletedRemoteIds = [...this.deletedRemoteIds, ...newlyDeleted]
        }

        this.notes = updatedNotes
      } else if (event.key && event.key.startsWith(DRAFT_STORAGE_PREFIX)) {
        const suffix = event.key.replace(DRAFT_STORAGE_PREFIX, '')
        const targetId = suffix.startsWith('new') ? null : suffix.split('_')[0]
        const key = targetId || 'new'
        this.draftsByNoteId[key] = storageService.getDraft(targetId)
      }
    },

    acknowledgeRemoteDeletion(id?: string): void {
      if (id) {
        this.deletedRemoteIds = this.deletedRemoteIds.filter(i => i !== id)
      } else {
        this.deletedRemoteIds = []
      }
    },

    /**
     * Create a brand new note and persist to storage.
     * Re-reads freshest notes from storage first to avoid overwriting concurrent changes.
     */
    createNote(title: string, todos: TodoItem[]): Note {
      const now = Date.now()
      const newNote: Note = {
        id: crypto.randomUUID ? crypto.randomUUID() : `note-${now}-${Math.random().toString(36).substring(2, 9)}`,
        title: title.trim(),
        todos: todos.map(t => ({
          id: t.id || `todo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          text: t.text.trim(),
          completed: Boolean(t.completed)
        })),
        createdAt: now,
        updatedAt: now
      }

      // Re-read latest notes to prevent array-level race condition
      const freshNotes = storageService.loadNotes()
      freshNotes.unshift(newNote)
      this.notes = freshNotes
      storageService.saveNotes(this.notes)
      this.clearDraft(null)

      return newNote
    },

    /**
     * Update an existing note and persist to storage.
     * Prevents modifying or resurrecting a remotely deleted note.
     * Supports optimistic locking via expectedUpdatedAt.
     */
    updateNote(id: string, title: string, todos: TodoItem[], expectedUpdatedAt?: number): Note | null {
      const freshNotes = storageService.loadNotes()
      const index = freshNotes.findIndex(n => n.id === id)
      if (index === -1 || this.isDeletedRemotely(id)) {
        return null
      }

      const existing = freshNotes[index]
      if (!existing) return null

      // Optimistic concurrency check: fail if someone else updated the note concurrently
      if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
        return null
      }

      const updated: Note = {
        id: existing.id,
        createdAt: existing.createdAt,
        title: title.trim(),
        todos: todos.map(t => ({
          id: t.id || `todo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          text: t.text.trim(),
          completed: Boolean(t.completed)
        })),
        updatedAt: Date.now()
      }

      freshNotes[index] = updated
      this.notes = freshNotes
      storageService.saveNotes(this.notes)
      this.clearDraft(id)

      return updated
    },

    /**
     * Delete a note by ID and persist to storage.
     */
    deleteNote(id: string): boolean {
      const freshNotes = storageService.loadNotes()
      const initialLength = freshNotes.length
      this.notes = freshNotes.filter(n => n.id !== id)

      if (this.notes.length !== initialLength) {
        storageService.saveNotes(this.notes)
        this.clearDraft(id)
        return true
      }

      return false
    },

    /**
     * Save in-progress draft isolated per note ID and tab session (survives page refresh).
     */
    saveDraft(draft: NoteDraft, sessionId?: string): void {
      const key = draft.noteId || 'new'
      this.draftsByNoteId[key] = draft
      storageService.saveDraft(draft, sessionId)
    },

    /**
     * Clear draft for a specific note from store and storage.
     */
    clearDraft(noteId: string | null = null, sessionId?: string): void {
      const key = noteId || 'new'
      delete this.draftsByNoteId[key]
      storageService.clearDraft(noteId, sessionId)
    }
  }
})
