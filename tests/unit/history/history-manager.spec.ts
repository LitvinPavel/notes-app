import { describe, it, expect, beforeEach } from 'vitest'
import { HistoryManager, MAX_HISTORY_LIMIT } from '~/utils/history/history-manager'
import {
  SetTitleCommand,
  AddTodoCommand,
  RemoveTodoCommand,
  ToggleTodoCommand,
  EditTodoTextCommand
} from '~/utils/history/commands'
import type { TodoItem } from '~/types/note'

describe('HistoryManager (Command Pattern & Undo/Redo Engine)', () => {
  let manager: HistoryManager

  beforeEach(() => {
    manager = new HistoryManager(50)
  })

  it('initializes with empty undo and redo stacks', () => {
    expect(manager.canUndo).toBe(false)
    expect(manager.canRedo).toBe(false)
    expect(manager.undoCount).toBe(0)
    expect(manager.redoCount).toBe(0)
  })

  it('records an executed command and enables undo', () => {
    let title = 'Initial'
    const cmd = new SetTitleCommand('Initial', 'Updated', (val) => { title = val })
    manager.execute(cmd)

    expect(title).toBe('Updated')
    expect(manager.canUndo).toBe(true)
    expect(manager.canRedo).toBe(false)
    expect(manager.undoCount).toBe(1)
  })

  it('performs undo and restores previous state', () => {
    let title = 'Initial'
    const cmd = new SetTitleCommand('Initial', 'Updated', (val) => { title = val })
    manager.execute(cmd)

    const undone = manager.undo()
    expect(undone).toBe(true)
    expect(title).toBe('Initial')
    expect(manager.canUndo).toBe(false)
    expect(manager.canRedo).toBe(true)
    expect(manager.redoCount).toBe(1)
  })

  it('performs redo and re-applies changes', () => {
    let title = 'Initial'
    const cmd = new SetTitleCommand('Initial', 'Updated', (val) => { title = val })
    manager.execute(cmd)
    manager.undo()

    const redone = manager.redo()
    expect(redone).toBe(true)
    expect(title).toBe('Updated')
    expect(manager.canUndo).toBe(true)
    expect(manager.canRedo).toBe(false)
  })

  it('clears redo stack when a new command is recorded after undo', () => {
    let title = 'Initial'
    const cmd1 = new SetTitleCommand('Initial', 'Step 1', (val) => { title = val })
    const cmd2 = new SetTitleCommand('Step 1', 'Step 2', (val) => { title = val })

    manager.execute(cmd1)
    manager.undo()
    expect(manager.canRedo).toBe(true)

    // Execute new command in the past branch
    manager.execute(cmd2)
    expect(title).toBe('Step 2')
    expect(manager.canRedo).toBe(false)
    expect(manager.redoCount).toBe(0)
  })

  it('strictly enforces the 50-step capacity limit (FIFO)', () => {
    let counter = 0
    const commandsTotal = 65

    for (let i = 1; i <= commandsTotal; i++) {
      const prev = counter
      const next = i
      const cmd = new SetTitleCommand(`Title ${prev}`, `Title ${next}`, (val) => {
        counter = Number(val.replace('Title ', ''))
      })
      manager.execute(cmd)
    }

    expect(manager.undoCount).toBe(MAX_HISTORY_LIMIT)
    expect(manager.undoCount).toBe(50)

    // Undo all 50 steps
    let stepsUndone = 0
    while (manager.canUndo) {
      manager.undo()
      stepsUndone++
    }

    expect(stepsUndone).toBe(50)
    // Oldest 15 steps were dropped, counter should be rolled back to step 15
    expect(counter).toBe(15)
  })

  it('resets all history stacks on clear()', () => {
    const cmd = new SetTitleCommand('A', 'B', () => {})
    manager.execute(cmd)
    manager.undo()

    expect(manager.canRedo).toBe(true)
    manager.clear()

    expect(manager.canUndo).toBe(false)
    expect(manager.canRedo).toBe(false)
    expect(manager.undoCount).toBe(0)
    expect(manager.redoCount).toBe(0)
  })

  describe('Atomic Command Types (Delta Verification)', () => {
    it('AddTodoCommand inserts at index and removes on undo', () => {
      const list: TodoItem[] = []
      const item: TodoItem = { id: 't1', text: 'Task 1', completed: false }

      const cmd = new AddTodoCommand(
        0,
        item,
        (idx, it) => list.splice(idx, 0, it),
        (idx) => list.splice(idx, 1)
      )

      manager.execute(cmd)
      expect(list).toHaveLength(1)
      expect(list[0]?.text).toBe('Task 1')

      manager.undo()
      expect(list).toHaveLength(0)

      manager.redo()
      expect(list).toHaveLength(1)
      expect(list[0]?.id).toBe('t1')
    })

    it('RemoveTodoCommand removes at index and restores on undo', () => {
      const item: TodoItem = { id: 't1', text: 'Task to delete', completed: false }
      const list: TodoItem[] = [item]

      const cmd = new RemoveTodoCommand(
        0,
        item,
        (idx, it) => list.splice(idx, 0, it),
        (idx) => list.splice(idx, 1)
      )

      manager.execute(cmd)
      expect(list).toHaveLength(0)

      manager.undo()
      expect(list).toHaveLength(1)
      expect(list[0]?.text).toBe('Task to delete')
    })

    it('ToggleTodoCommand toggles completed and restores previous state on undo', () => {
      const item: TodoItem = { id: 't1', text: 'Task', completed: false }

      const cmd = new ToggleTodoCommand(
        't1',
        false,
        true,
        (completed) => { item.completed = completed }
      )

      manager.execute(cmd)
      expect(item.completed).toBe(true)

      manager.undo()
      expect(item.completed).toBe(false)
    })

    it('EditTodoTextCommand modifies text and restores old text on undo', () => {
      const item: TodoItem = { id: 't1', text: 'Original', completed: false }

      const cmd = new EditTodoTextCommand(
        't1',
        'Original',
        'Edited',
        (text) => { item.text = text }
      )

      manager.execute(cmd)
      expect(item.text).toBe('Edited')

      manager.undo()
      expect(item.text).toBe('Original')
    })
  })
})
