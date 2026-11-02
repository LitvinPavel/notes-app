import { defineStore } from 'pinia'
import type { Note, TodoItem, NoteDraft } from '~/types/note'
import { storageService, NOTES_STORAGE_KEY, DRAFT_STORAGE_KEY } from '~/services/storage/storage-service'

interface NotesState {
  notes: Note[]
  isInitialized: boolean
  activeDraft: NoteDraft | null
  deletedRemoteIds: string[]
}

export const useNotesStore = defineStore('notes', {
  state: (): NotesState => ({
    notes: [],
    isInitialized: false,
    activeDraft: null,
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

    hasDraftFor: (state) => {
      return (noteId: string | null): boolean => {
        if (!state.activeDraft) return false
        return state.activeDraft.noteId === noteId
      }
    },

    isDeletedRemotely: (state) => {
      return (id: string): boolean => {
        return state.deletedRemoteIds.includes(id)
      }
    },

    deletedInAnotherTabId: (state): string | null => {
      return state.deletedRemoteIds[state.deletedRemoteIds.length - 1] ?? null
    }
  },

  actions: {
    /**
     * Initialize store from persistent storage and attach cross-tab listener.
     */
    init(): void {
      if (this.isInitialized) return

      this.notes = storageService.loadNotes()
      this.activeDraft = storageService.getDraft()
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
      } else if (event.key === DRAFT_STORAGE_KEY) {
        this.activeDraft = storageService.getDraft()
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
      this.clearDraft()

      return newNote
    },

    /**
     * Update an existing note and persist to storage.
     */
    updateNote(id: string, title: string, todos: TodoItem[]): Note | null {
      const index = this.notes.findIndex(n => n.id === id)
      if (index === -1) {
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
      this.clearDraft()

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

        // Clear active draft if it was for the deleted note
        if (this.activeDraft?.noteId === id) {
          this.clearDraft()
        }
        return true
      }

      return false
    },

    /**
     * Save in-progress draft (survives page refresh).
     */
    saveDraft(draft: NoteDraft): void {
      this.activeDraft = draft
      storageService.saveDraft(draft)
    },

    /**
     * Clear draft from store and storage.
     */
    clearDraft(): void {
      this.activeDraft = null
      storageService.clearDraft()
    }
  }
})
