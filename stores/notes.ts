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
      return (noteId: string | null): NoteDraft | null => {
        const key = noteId || 'new'
        if (key in state.draftsByNoteId) {
          return state.draftsByNoteId[key] ?? null
        }
        return storageService.getDraft(noteId)
      }
    },

    hasDraftFor: (state) => {
      return (noteId: string | null): boolean => {
        const key = noteId || 'new'
        const draft = (key in state.draftsByNoteId)
          ? state.draftsByNoteId[key]
          : storageService.getDraft(noteId)
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
        const targetId = suffix === 'new' ? null : suffix
        this.draftsByNoteId[suffix] = storageService.getDraft(targetId)
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

      this.notes.unshift(newNote)
      storageService.saveNotes(this.notes)
      this.clearDraft(null)

      return newNote
    },

    /**
     * Update an existing note and persist to storage.
     * Prevents modifying or resurrecting a remotely deleted note.
     */
    updateNote(id: string, title: string, todos: TodoItem[]): Note | null {
      const index = this.notes.findIndex(n => n.id === id)
      if (index === -1 || this.isDeletedRemotely(id)) {
        return null
      }

      const existing = this.notes[index]
      if (!existing) return null

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

      this.notes[index] = updated
      storageService.saveNotes(this.notes)
      this.clearDraft(id)

      return updated
    },

    /**
     * Delete a note by ID and persist to storage.
     */
    deleteNote(id: string): boolean {
      const initialLength = this.notes.length
      this.notes = this.notes.filter(n => n.id !== id)

      if (this.notes.length !== initialLength) {
        storageService.saveNotes(this.notes)
        this.clearDraft(id)
        return true
      }

      return false
    },

    /**
     * Save in-progress draft isolated per note ID (survives page refresh).
     */
    saveDraft(draft: NoteDraft): void {
      const key = draft.noteId || 'new'
      this.draftsByNoteId[key] = draft
      storageService.saveDraft(draft)
    },

    /**
     * Clear draft for a specific note from store and storage.
     */
    clearDraft(noteId: string | null = null): void {
      const key = noteId || 'new'
      delete this.draftsByNoteId[key]
      storageService.clearDraft(noteId)
    }
  }
})
