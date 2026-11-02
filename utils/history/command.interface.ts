/**
 * Command interface representing an atomic reversible operation in history.
 */
export interface IHistoryCommand {
  readonly type: string
  readonly description: string
  execute(): void
  undo(): void
}
