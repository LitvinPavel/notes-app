import { ref, computed } from 'vue'
import { HistoryManager } from '~/utils/history/history-manager'
import {
  SetTitleCommand,
  AddTodoCommand,
  RemoveTodoCommand,
  ToggleTodoCommand,
  EditTodoTextCommand
} from '~/utils/history/commands'
import type { TodoItem } from '~/types/note'

interface ActiveTextSession {
  field: 'title' | 'todo'
  id?: string
  initialText: string
  currentText: string
}

export function useNoteHistory(callbacks: {
  setTitle: (title: string) => void
  insertTodo: (index: number, item: TodoItem) => void
  removeTodo: (index: number) => void
  setTodoCompleted: (id: string, completed: boolean) => void
  setTodoText: (id: string, text: string) => void
}) {
  const manager = new HistoryManager(50)
  const historyVersion = ref(0) // reactive bump on any history change

  const canUndo = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    historyVersion.value
    return manager.canUndo
  })

  const canRedo = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    historyVersion.value
    return manager.canRedo
  })

  let activeSession: ActiveTextSession | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const DEBOUNCE_DELAY_MS = 600

  const commitTextSession = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    if (!activeSession) return

    const { field, id, initialText, currentText } = activeSession
    activeSession = null

    if (initialText === currentText) return

    if (field === 'title') {
      const command = new SetTitleCommand(
        initialText,
        currentText,
        callbacks.setTitle
      )
      manager.record(command)
      historyVersion.value++
    } else if (field === 'todo' && id) {
      const command = new EditTodoTextCommand(
        id,
        initialText,
        currentText,
        (text: string) => callbacks.setTodoText(id, text)
      )
      manager.record(command)
      historyVersion.value++
    }
  }

  const handleTextInput = (
    field: 'title' | 'todo',
    id: string | undefined,
    currentText: string,
    fallbackInitialText?: string
  ): void => {
    // If switching field while previous session is open, commit previous first
    if (activeSession && (activeSession.field !== field || activeSession.id !== id)) {
      commitTextSession()
    }

    if (!activeSession) {
      activeSession = {
        field,
        id,
        initialText: fallbackInitialText ?? currentText,
        currentText
      }
    } else {
      activeSession.currentText = currentText
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      commitTextSession()
    }, DEBOUNCE_DELAY_MS)
  }

  const handleTextBlur = (): void => {
    commitTextSession()
  }

  const recordAddTodo = (index: number, item: TodoItem): void => {
    commitTextSession()
    const command = new AddTodoCommand(
      index,
      item,
      callbacks.insertTodo,
      callbacks.removeTodo
    )
    manager.record(command)
    historyVersion.value++
  }

  const recordRemoveTodo = (index: number, item: TodoItem): void => {
    commitTextSession()
    const command = new RemoveTodoCommand(
      index,
      item,
      callbacks.insertTodo,
      callbacks.removeTodo
    )
    manager.record(command)
    historyVersion.value++
  }

  const recordToggleTodo = (id: string, oldCompleted: boolean, newCompleted: boolean): void => {
    commitTextSession()
    const command = new ToggleTodoCommand(
      id,
      oldCompleted,
      newCompleted,
      (completed: boolean) => callbacks.setTodoCompleted(id, completed)
    )
    manager.record(command)
    historyVersion.value++
  }

  const undo = (): boolean => {
    // Flush any pending uncommitted typing before undoing
    commitTextSession()
    const success = manager.undo()
    if (success) {
      historyVersion.value++
    }
    return success
  }

  const redo = (): boolean => {
    commitTextSession()
    const success = manager.redo()
    if (success) {
      historyVersion.value++
    }
    return success
  }

  const clearHistory = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    activeSession = null
    manager.clear()
    historyVersion.value++
  }

  return {
    manager,
    canUndo,
    canRedo,
    handleTextInput,
    handleTextBlur,
    commitTextSession,
    recordAddTodo,
    recordRemoveTodo,
    recordToggleTodo,
    undo,
    redo,
    clearHistory
  }
}
