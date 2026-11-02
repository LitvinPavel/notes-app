/**
 * Domain types for Notes and Todos.
 */

export interface TodoItem {
  readonly id: string
  text: string
  completed: boolean
}

export interface Note {
  readonly id: string
  title: string
  todos: TodoItem[]
  readonly createdAt: number
  updatedAt: number
}

export interface StoredNotesPayload {
  readonly version: number
  readonly notes: Note[]
}

export interface NoteDraft {
  readonly noteId: string | null // null indicates draft for a brand new note
  readonly sessionId?: string // tab-specific editor session id
  readonly title: string
  readonly todos: TodoItem[]
  readonly updatedAt: number
}

export interface StorageMigration {
  readonly fromVersion: number
  readonly toVersion: number
  migrate: (raw: unknown) => StoredNotesPayload
}
