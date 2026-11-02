import type { IHistoryCommand } from './command.interface'
import type { TodoItem } from '~/types/note'

/**
 * Command for setting the note title.
 * Stores only the previous and new title strings, not the entire note.
 */
export class SetTitleCommand implements IHistoryCommand {
  readonly type = 'SET_TITLE'
  readonly description = 'Изменение заголовка'

  constructor(
    public readonly oldTitle: string,
    public readonly newTitle: string,
    private readonly apply: (title: string) => void
  ) {}

  execute(): void {
    this.apply(this.newTitle)
  }

  undo(): void {
    this.apply(this.oldTitle)
  }
}

/**
 * Command for adding a new todo item at a specific index.
 */
export class AddTodoCommand implements IHistoryCommand {
  readonly type = 'ADD_TODO'
  readonly description = 'Добавление пункта задачи'

  constructor(
    public readonly index: number,
    public readonly item: TodoItem,
    private readonly insert: (index: number, item: TodoItem) => void,
    private readonly remove: (index: number) => void
  ) {}

  execute(): void {
    this.insert(this.index, { ...this.item })
  }

  undo(): void {
    this.remove(this.index)
  }
}

/**
 * Command for removing a todo item at a specific index.
 */
export class RemoveTodoCommand implements IHistoryCommand {
  readonly type = 'REMOVE_TODO'
  readonly description = 'Удаление пункта задачи'

  constructor(
    public readonly index: number,
    public readonly item: TodoItem,
    private readonly insert: (index: number, item: TodoItem) => void,
    private readonly remove: (index: number) => void
  ) {}

  execute(): void {
    this.remove(this.index)
  }

  undo(): void {
    this.insert(this.index, { ...this.item })
  }
}

/**
 * Command for toggling a todo item's completion status.
 */
export class ToggleTodoCommand implements IHistoryCommand {
  readonly type = 'TOGGLE_TODO'
  readonly description = 'Изменение статуса задачи'

  constructor(
    public readonly todoId: string,
    public readonly oldCompleted: boolean,
    public readonly newCompleted: boolean,
    private readonly apply: (completed: boolean) => void
  ) {}

  execute(): void {
    this.apply(this.newCompleted)
  }

  undo(): void {
    this.apply(this.oldCompleted)
  }
}

/**
 * Command for editing a todo item's text.
 */
export class EditTodoTextCommand implements IHistoryCommand {
  readonly type = 'EDIT_TODO_TEXT'
  readonly description = 'Редактирование текста задачи'

  constructor(
    public readonly todoId: string,
    public readonly oldText: string,
    public readonly newText: string,
    private readonly apply: (text: string) => void
  ) {}

  execute(): void {
    this.apply(this.newText)
  }

  undo(): void {
    this.apply(this.oldText)
  }
}
