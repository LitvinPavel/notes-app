import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNoteHistory } from '~/composables/useNoteHistory'
import type { TodoItem } from '~/types/note'

describe('useNoteHistory (Continuous text batching & session management)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches continuous typing into a SINGLE command in history after debounce delay', () => {
    const setTitle = vi.fn()

    const { handleTextInput, canUndo, manager, undo } = useNoteHistory({
      setTitle,
      insertTodo: () => {},
      removeTodo: () => {},
      setTodoCompleted: () => {},
      setTodoText: () => {}
    })

    // Simulate typing character by character: 'I', 'n', 'i', 't', 'i', 'a', 'l' -> 'Hello World'
    handleTextInput('title', undefined, 'H', 'Initial')
    vi.advanceTimersByTime(200)

    handleTextInput('title', undefined, 'He')
    vi.advanceTimersByTime(200)

    handleTextInput('title', undefined, 'Hello')
    vi.advanceTimersByTime(200)

    handleTextInput('title', undefined, 'Hello World')

    // At this moment debounce delay hasn't expired yet
    expect(manager.undoCount).toBe(0)

    // Debounce expires (600ms)
    vi.advanceTimersByTime(700)

    // Exactly ONE command was created in history!
    expect(manager.undoCount).toBe(1)
    expect(canUndo.value).toBe(true)

    // Undo restores the initial title before the continuous typing session
    undo()
    expect(setTitle).toHaveBeenCalledWith('Initial')
  })

  it('commits text session immediately on blur without waiting for debounce', () => {
    const setTitle = vi.fn()

    const { handleTextInput, handleTextBlur, manager } = useNoteHistory({
      setTitle,
      insertTodo: () => {},
      removeTodo: () => {},
      setTodoCompleted: () => {},
      setTodoText: () => {}
    })

    handleTextInput('title', undefined, 'Typing fast', 'Start')
    expect(manager.undoCount).toBe(0)

    handleTextBlur()
    expect(manager.undoCount).toBe(1)
  })

  it('flushes pending in-flight text when switching to another field', () => {
    let title = 'Title'
    let todoText = 'Task'

    const { handleTextInput, manager } = useNoteHistory({
      setTitle: (val) => { title = val },
      insertTodo: () => {},
      removeTodo: () => {},
      setTodoCompleted: () => {},
      setTodoText: (_id, val) => { todoText = val }
    })

    // User types in title
    handleTextInput('title', undefined, 'New Title', 'Title')
    expect(manager.undoCount).toBe(0)

    // User starts typing in todo item 1
    handleTextInput('todo', 'item-1', 'New Task Text', 'Task')

    // Previous title session was immediately flushed!
    expect(manager.undoCount).toBe(1)

    // Finish todo session
    vi.advanceTimersByTime(700)
    expect(manager.undoCount).toBe(2)
    expect(title).toBe('Title')
    expect(todoText).toBe('Task')
  })

  it('flushes in-flight typing and undos correctly when undo is invoked while still typing', () => {
    const setTitle = vi.fn()

    const { handleTextInput, undo, manager } = useNoteHistory({
      setTitle,
      insertTodo: () => {},
      removeTodo: () => {},
      setTodoCompleted: () => {},
      setTodoText: () => {}
    })

    handleTextInput('title', undefined, 'User is mid-sentence', 'Clean')
    // No blur, timer hasn't fired, user hits Ctrl+Z
    expect(manager.undoCount).toBe(0)

    undo()

    // Title was reverted to Clean
    expect(setTitle).toHaveBeenCalledWith('Clean')
  })

  it('records atomic actions for checkbox toggle and todo add/remove', () => {
    const list: TodoItem[] = []

    const { recordAddTodo, recordToggleTodo, recordRemoveTodo, manager } = useNoteHistory({
      setTitle: () => {},
      insertTodo: (idx, item) => list.splice(idx, 0, item),
      removeTodo: (idx) => list.splice(idx, 1),
      setTodoCompleted: () => {},
      setTodoText: () => {}
    })

    const todo: TodoItem = { id: 't1', text: 'Task 1', completed: false }

    recordAddTodo(0, todo)
    expect(manager.undoCount).toBe(1)

    recordToggleTodo('t1', false, true)
    expect(manager.undoCount).toBe(2)

    recordRemoveTodo(0, todo)
    expect(manager.undoCount).toBe(3)
  })
})
