<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch, isRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNotesStore } from '~/stores/notes'
import { useNoteHistory } from '~/composables/useNoteHistory'
import type { TodoItem, NoteDraft } from '~/types/note'
import BaseButton from '~/components/ui/BaseButton.vue'
import BaseInput from '~/components/ui/BaseInput.vue'
import BaseModal from '~/components/ui/BaseModal.vue'
import ConfirmModal from '~/components/ui/ConfirmModal.vue'
import TodoEditorItem from '~/components/notes/TodoEditorItem.vue'

const route = useRoute()
const router = useRouter()
const notesStore = useNotesStore()

const noteIdParam = computed(() => String(route.params.id))
const isNew = computed(() => noteIdParam.value === 'new')

// Note reactive state
const title = ref('')
const todos = ref<TodoItem[]>([])
const isNotFound = ref(false)
const titleError = ref<string | null>(null)
const initialLoadedState = ref<{ title: string; todosJson: string }>({ title: '', todosJson: '[]' })
const initialUpdatedAt = ref<number | null>(null)

// Modals state
const isCancelModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const isDraftModalOpen = ref(false)
const isRemoteDeletedModalOpen = ref(false)
const isConflictModalOpen = ref(false)
const isSaveErrorModalOpen = ref(false)
const saveErrorMessage = ref('')
const pendingDraft = ref<NoteDraft | null>(null)

// References to child components for auto-focus
const titleInputRef = ref<InstanceType<typeof BaseInput> | null>(null)
const todoItemRefs = ref<(InstanceType<typeof TodoEditorItem> | null)[]>([])

// Lifecycle guard: false when unmounting after an intentional save, cancel, or delete
let shouldPersistDraftOnUnmount = true

// Draft debounced autosave timer
let draftTimer: ReturnType<typeof setTimeout> | null = null

// Initialize Note History
const {
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
} = useNoteHistory({
  setTitle: (newTitle: string) => {
    title.value = newTitle
  },
  insertTodo: (index: number, item: TodoItem) => {
    todos.value.splice(index, 0, { ...item })
  },
  removeTodo: (index: number) => {
    todos.value.splice(index, 1)
  },
  setTodoCompleted: (id: string, completed: boolean) => {
    const item = todos.value.find(t => t.id === id)
    if (item) {
      item.completed = completed
    }
  },
  setTodoText: (id: string, text: string) => {
    const item = todos.value.find(t => t.id === id)
    if (item) {
      item.text = text
    }
  }
})

// Check if there are unsaved modifications
const isDirty = computed(() => {
  if (isNew.value) {
    return title.value.trim().length > 0 || todos.value.length > 0
  }
  return (
    title.value !== initialLoadedState.value.title ||
    JSON.stringify(todos.value) !== initialLoadedState.value.todosJson
  )
})

// Flush and persist or clear draft immediately (e.g. before unload / pagehide / unmount)
const flushDraftNow = () => {
  if (!shouldPersistDraftOnUnmount) return

  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  commitTextSession()
  const targetId = isNew.value ? null : noteIdParam.value
  if (isDirty.value) {
    notesStore.saveDraft({
      noteId: targetId,
      title: title.value,
      todos: todos.value,
      updatedAt: Date.now()
    })
  } else {
    // If user returned to original state (e.g. through Undo), clean up the draft
    notesStore.clearDraft(targetId)
  }
}

// Schedule draft save or clean state clearance
const scheduleDraftSave = () => {
  if (!shouldPersistDraftOnUnmount) return
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    if (!shouldPersistDraftOnUnmount) return
    const targetId = isNew.value ? null : noteIdParam.value
    if (isDirty.value) {
      notesStore.saveDraft({
        noteId: targetId,
        title: title.value,
        todos: todos.value,
        updatedAt: Date.now()
      })
    } else {
      // Clear draft when changes are completely reverted back to original
      notesStore.clearDraft(targetId)
    }
  }, 800)
}

watch([title, todos], () => {
  scheduleDraftSave()
}, { deep: true })

// Check whether an editable text field is currently focused
const isTextInputActive = (): boolean => {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (!active) return false

  const tagName = active.tagName.toLowerCase()
  if (tagName === 'textarea') return true
  if (tagName === 'input') {
    const inputType = (active as HTMLInputElement).type?.toLowerCase() || 'text'
    return inputType !== 'checkbox' && inputType !== 'button' && inputType !== 'submit' && inputType !== 'reset'
  }
  return (active as HTMLElement).isContentEditable
}

// Global Hotkeys: Ctrl+Z / Cmd+Z, Shift+Ctrl+Z / Cmd+Shift+Z, Ctrl+Y
// Only intercepts when focus is NOT inside an editable text input and NO modal dialog is open
const handleGlobalKeydown = (event: KeyboardEvent) => {
  const isModifier = event.ctrlKey || event.metaKey
  if (!isModifier) return

  // Do not intercept hotkeys when any modal dialog is currently open
  if (typeof document !== 'undefined' && document.querySelector('[role="dialog"][aria-modal="true"]')) {
    return
  }

  // Ensure global shortcuts only intercept when focus is not inside an active text input
  if (isTextInputActive()) {
    return
  }

  const key = event.key.toLowerCase()

  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) {
      redo()
    } else {
      undo()
    }
  } else if (key === 'y') {
    event.preventDefault()
    redo()
  }
}

// Focus title input and set cursor position to the end of the text
function focusTitleInput() {
  nextTick(() => {
    const target = titleInputRef.value?.input
    const inputEl = isRef(target) ? target.value : target

    if (inputEl instanceof HTMLInputElement) {
      inputEl.focus()
      const len = inputEl.value.length
      inputEl.setSelectionRange(len, len)
    } else {
      titleInputRef.value?.focus()
    }
  })
}

// Lifecycle
onMounted(() => {
  notesStore.init()

  const targetId = isNew.value ? null : noteIdParam.value

  if (!isNew.value) {
    const existing = notesStore.getNoteById(noteIdParam.value)
    if (!existing) {
      isNotFound.value = true
      return
    }

    title.value = existing.title
    todos.value = existing.todos.map(t => ({ ...t }))
    initialLoadedState.value = {
      title: existing.title,
      todosJson: JSON.stringify(existing.todos)
    }
    initialUpdatedAt.value = existing.updatedAt
  } else {
    title.value = ''
    todos.value = []
    initialLoadedState.value = {
      title: '',
      todosJson: '[]'
    }
    initialUpdatedAt.value = null
  }

  // Check for unsaved draft for this specific note
  const draft = notesStore.getDraftFor(targetId)
  if (draft && draft.noteId === targetId) {
    // Only prompt if draft actually has different content
    const differs =
      draft.title !== title.value ||
      JSON.stringify(draft.todos) !== JSON.stringify(todos.value)

    if (differs) {
      pendingDraft.value = draft
      isDraftModalOpen.value = true
    } else {
      notesStore.clearDraft(targetId)
    }
  }

  // Attach global keyboard shortcuts and lifecycle listeners
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('pagehide', flushDraftNow)
  window.addEventListener('beforeunload', flushDraftNow)

  // Focus title input and place caret at the end
  focusTitleInput()
})

onBeforeUnmount(() => {
  flushDraftNow()
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('pagehide', flushDraftNow)
  window.removeEventListener('beforeunload', flushDraftNow)
})

// Cross-tab deletion watcher
watch(
  () => notesStore.isDeletedRemotely(noteIdParam.value),
  (isDeleted) => {
    if (isDeleted && !isNew.value) {
      isRemoteDeletedModalOpen.value = true
    }
  }
)

// Actions
const handleTitleInput = (value: string) => {
  titleError.value = null
  const prevTitle = title.value
  title.value = value
  handleTextInput('title', undefined, value, prevTitle)
}

const handleTitleBlur = () => {
  handleTextBlur()
}

const handleAddTodo = () => {
  const newTodo: TodoItem = {
    id: `todo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    text: '',
    completed: false
  }

  const insertIndex = todos.value.length
  todos.value.push(newTodo)
  recordAddTodo(insertIndex, newTodo)

  nextTick(() => {
    const lastRef = todoItemRefs.value[insertIndex]
    lastRef?.focus()
  })
}

const handleRemoveTodo = (index: number) => {
  const item = todos.value[index]
  if (!item) return

  todos.value.splice(index, 1)
  recordRemoveTodo(index, item)
}

const handleToggleTodo = (id: string, completed: boolean) => {
  const item = todos.value.find(t => t.id === id)
  if (!item) return

  const oldCompleted = item.completed
  item.completed = completed
  recordToggleTodo(id, oldCompleted, completed)
}

const handleTodoTextInput = (id: string, text: string, fallbackInitial?: string) => {
  const item = todos.value.find(t => t.id === id)
  if (item) {
    item.text = text
  }
  handleTextInput('todo', id, text, fallbackInitial)
}

const handleSave = () => {
  commitTextSession()

  const targetId = isNew.value ? null : noteIdParam.value

  // Prevent saving as or resurrecting a remotely deleted note
  if (!isNew.value && notesStore.isDeletedRemotely(noteIdParam.value)) {
    isRemoteDeletedModalOpen.value = true
    return
  }

  // Optimistic concurrency check: note modified in another tab
  if (!isNew.value) {
    const currentNote = notesStore.getNoteById(noteIdParam.value)
    if (currentNote && initialUpdatedAt.value !== null && currentNote.updatedAt !== initialUpdatedAt.value) {
      isConflictModalOpen.value = true
      return
    }
  }

  const trimmedTitle = title.value.trim()
  if (!trimmedTitle) {
    titleError.value = 'Название заметки не может быть пустым'
    focusTitleInput()
    return
  }

  // Filter out completely empty tasks or trim them
  const cleanedTodos = todos.value.map(t => ({
    ...t,
    text: t.text.trim()
  }))

  if (isNew.value) {
    const created = notesStore.createNote(trimmedTitle, cleanedTodos)
    if (!created) {
      saveErrorMessage.value = 'Не удалось сохранить заметку: хранилище недоступно для записи (режим только для чтения или превышена дисковая квота).'
      isSaveErrorModalOpen.value = true
      return
    }
  } else {
    const updated = notesStore.updateNote(
      noteIdParam.value,
      trimmedTitle,
      cleanedTodos,
      initialUpdatedAt.value ?? undefined
    )
    if (!updated) {
      if (notesStore.isDeletedRemotely(noteIdParam.value) || !notesStore.getNoteById(noteIdParam.value)) {
        isRemoteDeletedModalOpen.value = true
      } else {
        const currentInStore = notesStore.getNoteById(noteIdParam.value)
        if (currentInStore && initialUpdatedAt.value !== null && currentInStore.updatedAt !== initialUpdatedAt.value) {
          isConflictModalOpen.value = true
        } else {
          saveErrorMessage.value = 'Не удалось обновить заметку: хранилище недоступно для записи.'
          isSaveErrorModalOpen.value = true
        }
      }
      return
    }
  }

  // Mark completion to prevent onBeforeUnmount from recreating draft
  shouldPersistDraftOnUnmount = false
  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  clearHistory()
  notesStore.clearDraft(targetId)
  initialLoadedState.value = {
    title: trimmedTitle,
    todosJson: JSON.stringify(cleanedTodos)
  }
  router.push('/')
}

const handleCancelClick = () => {
  commitTextSession()
  const targetId = isNew.value ? null : noteIdParam.value
  if (isDirty.value) {
    isCancelModalOpen.value = true
  } else {
    shouldPersistDraftOnUnmount = false
    if (draftTimer) {
      clearTimeout(draftTimer)
      draftTimer = null
    }
    clearHistory()
    notesStore.clearDraft(targetId)
    router.push('/')
  }
}

const handleConfirmCancel = () => {
  shouldPersistDraftOnUnmount = false
  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  const targetId = isNew.value ? null : noteIdParam.value
  clearHistory()
  notesStore.clearDraft(targetId)
  router.push('/')
}

const handleDeleteClick = () => {
  const targetId = isNew.value ? null : noteIdParam.value
  if (isNew.value) {
    shouldPersistDraftOnUnmount = false
    if (draftTimer) {
      clearTimeout(draftTimer)
      draftTimer = null
    }
    clearHistory()
    notesStore.clearDraft(targetId)
    router.push('/')
  } else {
    isDeleteModalOpen.value = true
  }
}

const handleConfirmDelete = () => {
  shouldPersistDraftOnUnmount = false
  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  const targetId = isNew.value ? null : noteIdParam.value
  if (!isNew.value) {
    notesStore.deleteNote(noteIdParam.value)
  }
  clearHistory()
  notesStore.clearDraft(targetId)
  router.push('/')
}

// Draft restoration actions
const handleRestoreDraft = () => {
  if (pendingDraft.value) {
    title.value = pendingDraft.value.title
    todos.value = pendingDraft.value.todos.map(t => ({ ...t }))
    pendingDraft.value = null
  }
  isDraftModalOpen.value = false
}

const handleDiscardDraft = () => {
  const targetId = isNew.value ? null : noteIdParam.value
  notesStore.clearDraft(targetId)
  pendingDraft.value = null
  isDraftModalOpen.value = false
}

// Remote deletion resolution: save as new note to preserve user's typed changes
const handleSaveAsNewNote = () => {
  commitTextSession()
  const trimmedTitle = title.value.trim() || 'Копия удаленной заметки'
  const cleanedTodos = todos.value.map(t => ({
    ...t,
    text: t.text.trim()
  }))

  const created = notesStore.createNote(trimmedTitle, cleanedTodos)
  if (!created) {
    saveErrorMessage.value = 'Не удалось сохранить заметку: хранилище недоступно для записи.'
    isSaveErrorModalOpen.value = true
    return
  }

  shouldPersistDraftOnUnmount = false
  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  notesStore.acknowledgeRemoteDeletion(noteIdParam.value)
  notesStore.clearDraft(noteIdParam.value)
  clearHistory()
  isRemoteDeletedModalOpen.value = false
  router.push('/')
}

// Remote deletion resolution: acknowledge and discard
const handleRemoteDeletedConfirm = () => {
  shouldPersistDraftOnUnmount = false
  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  notesStore.acknowledgeRemoteDeletion(noteIdParam.value)
  clearHistory()
  notesStore.clearDraft(noteIdParam.value)
  isRemoteDeletedModalOpen.value = false
  router.push('/')
}

// Concurrent editing conflict resolution: overwrite remote changes
const handleOverwriteConflict = () => {
  commitTextSession()
  const trimmedTitle = title.value.trim() || 'Без названия'
  const cleanedTodos = todos.value.map(t => ({
    ...t,
    text: t.text.trim()
  }))

  const updated = notesStore.updateNote(noteIdParam.value, trimmedTitle, cleanedTodos)
  if (!updated) {
    if (!notesStore.getNoteById(noteIdParam.value) || notesStore.isDeletedRemotely(noteIdParam.value)) {
      isConflictModalOpen.value = false
      isRemoteDeletedModalOpen.value = true
    } else {
      isConflictModalOpen.value = false
      saveErrorMessage.value = 'Не удалось принудительно перезаписать заметку: хранилище недоступно для записи.'
      isSaveErrorModalOpen.value = true
    }
    return
  }

  shouldPersistDraftOnUnmount = false
  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  clearHistory()
  notesStore.clearDraft(noteIdParam.value)
  isConflictModalOpen.value = false
  router.push('/')
}

// Concurrent editing conflict resolution: save local version as a new note
const handleSaveConflictAsNew = () => {
  commitTextSession()
  const trimmedTitle = title.value.trim() || 'Копия заметки'
  const cleanedTodos = todos.value.map(t => ({
    ...t,
    text: t.text.trim()
  }))

  const created = notesStore.createNote(trimmedTitle, cleanedTodos)
  if (!created) {
    saveErrorMessage.value = 'Не удалось сохранить заметку как новую: хранилище недоступно для записи.'
    isSaveErrorModalOpen.value = true
    return
  }

  shouldPersistDraftOnUnmount = false
  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  clearHistory()
  notesStore.clearDraft(noteIdParam.value)
  isConflictModalOpen.value = false
  router.push('/')
}

// Concurrent editing conflict resolution: discard local edits and reload remote version
const handleReloadLatestRemote = () => {
  const fresh = notesStore.getNoteById(noteIdParam.value)
  if (fresh) {
    title.value = fresh.title
    todos.value = fresh.todos.map(t => ({ ...t }))
    initialLoadedState.value = {
      title: fresh.title,
      todosJson: JSON.stringify(fresh.todos)
    }
    initialUpdatedAt.value = fresh.updatedAt
    clearHistory()
    notesStore.clearDraft(noteIdParam.value)
  }
  isConflictModalOpen.value = false
}
</script>

<template>
  <div class="note-edit-page container">
    <!-- 404 Not Found Edge Case -->
    <div v-if="isNotFound" class="not-found-state">
      <div class="not-found-state__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 class="not-found-state__title">
        Заметка не найдена
      </h1>
      <p class="not-found-state__desc">
        Запрашиваемая заметка не существует или была удалена.
      </p>
      <BaseButton variant="primary" @click="router.push('/')">
        Вернуться к списку заметок
      </BaseButton>
    </div>

    <!-- Active Editor View -->
    <template v-else>
      <!-- Top Navigation & Action Toolbar -->
      <header class="editor-header">
        <div class="editor-header__nav">
          <BaseButton
            variant="ghost"
            size="sm"
            @click="handleCancelClick"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Назад к заметкам
          </BaseButton>
        </div>

        <div class="editor-header__actions">
          <!-- Undo / Redo buttons with shortcut indicator -->
          <div class="history-controls">
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="!canUndo"
              aria-label="Отменить действие (Ctrl+Z)"
              title="Отменить действие (Ctrl+Z)"
              @click="undo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span class="history-label">Отменить</span>
            </BaseButton>

            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="!canRedo"
              aria-label="Повторить действие (Shift+Ctrl+Z)"
              title="Повторить действие (Shift+Ctrl+Z)"
              @click="redo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span class="history-label">Повторить</span>
            </BaseButton>
          </div>

          <div class="main-actions">
            <BaseButton
              v-if="!isNew"
              variant="ghost"
              size="sm"
              class="danger-btn"
              @click="handleDeleteClick"
            >
              Удалить
            </BaseButton>

            <BaseButton
              variant="secondary"
              size="sm"
              @click="handleCancelClick"
            >
              Отменить
            </BaseButton>

            <BaseButton
              variant="primary"
              size="sm"
              @click="handleSave"
            >
              Сохранить
            </BaseButton>
          </div>
        </div>
      </header>

      <!-- Main Editor Container -->
      <main class="editor-content">
        <!-- Title Input -->
        <div class="editor-section">
          <BaseInput
            ref="titleInputRef"
            :model-value="title"
            variant="title"
            placeholder="Название заметки..."
            :error="titleError ?? undefined"
            aria-label="Название заметки"
            @update:model-value="handleTitleInput"
            @blur="handleTitleBlur"
          />
        </div>

        <!-- Todo List -->
        <div class="editor-section">
          <div class="todos-header">
            <h2 class="todos-header__title">
              Задачи ({{ todos.filter(t => t.completed).length }}/{{ todos.length }})
            </h2>
            <BaseButton
              variant="secondary"
              size="sm"
              @click="handleAddTodo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-icon">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Добавить пункт
            </BaseButton>
          </div>

          <div v-if="todos.length > 0" class="todos-list">
            <TodoEditorItem
              v-for="(item, index) in todos"
              :key="item.id"
              :ref="(el) => { todoItemRefs[index] = el as InstanceType<typeof TodoEditorItem> }"
              :item="item"
              :index="index"
              @toggle="handleToggleTodo(item.id, $event)"
              @text-input="(text, fallback) => handleTodoTextInput(item.id, text, fallback)"
              @text-blur="handleTextBlur"
              @remove="handleRemoveTodo(index)"
              @enter-pressed="handleAddTodo"
            />
          </div>

          <div v-else class="todos-empty">
            <p>В этой заметке пока нет пунктов задач.</p>
            <BaseButton
              variant="outline"
              size="sm"
              @click="handleAddTodo"
            >
              + Добавить первую задачу
            </BaseButton>
          </div>
        </div>
      </main>

      <!-- Cancel Confirmation Modal -->
      <ConfirmModal
        v-model="isCancelModalOpen"
        title="Отмена редактирования"
        message="Вы уверены, что хотите отменить редактирование? Все несохранённые изменения будут сброшены."
        confirm-text="Сбросить изменения"
        cancel-text="Продолжить"
        confirm-variant="danger"
        @confirm="handleConfirmCancel"
      />

      <!-- Delete Confirmation Modal -->
      <ConfirmModal
        v-model="isDeleteModalOpen"
        title="Удаление заметки"
        :message="`Вы уверены, что хотите удалить заметку «${title || 'Без названия'}»?`"
        confirm-text="Удалить"
        cancel-text="Отмена"
        confirm-variant="danger"
        @confirm="handleConfirmDelete"
      />

      <!-- Restore Draft Confirmation Modal -->
      <ConfirmModal
        v-model="isDraftModalOpen"
        title="Восстановление черновика"
        message="Обнаружен несохранённый черновик этой заметки, оставшийся после предыдущей сессии. Хотите восстановить его?"
        confirm-text="Восстановить черновик"
        cancel-text="Отклонить"
        confirm-variant="primary"
        @confirm="handleRestoreDraft"
        @cancel="handleDiscardDraft"
      />

      <!-- Remote Deletion in Another Tab Warning Modal -->
      <ConfirmModal
        v-model="isRemoteDeletedModalOpen"
        title="Заметка удалена в другой вкладке"
        message="Эта заметка была удалена в другой вкладке браузера. Вы можете сохранить ваши изменения как новую заметку или вернуться к списку заметок."
        confirm-text="Сохранить как новую"
        cancel-text="Вернуться к списку"
        confirm-variant="primary"
        @confirm="handleSaveAsNewNote"
        @cancel="handleRemoteDeletedConfirm"
      />

      <!-- Concurrent Edit Conflict Modal -->
      <BaseModal
        v-model="isConflictModalOpen"
        title="Конфликт одновременного редактирования"
        :close-on-escape="false"
        :close-on-backdrop="false"
        :show-close-button="false"
      >
        <div class="conflict-dialog">
          <p class="conflict-dialog__message">
            Заметка была изменена в другой вкладке браузера во время вашего редактирования.
            Выберите, как поступить с текущими изменениями:
          </p>
          <div class="conflict-dialog__actions">
            <BaseButton variant="primary" size="sm" @click="handleSaveConflictAsNew">
              Сохранить как новую
            </BaseButton>
            <BaseButton variant="danger" size="sm" @click="handleOverwriteConflict">
              Перезаписать чужие правки
            </BaseButton>
            <BaseButton variant="secondary" size="sm" @click="handleReloadLatestRemote">
              Загрузить актуальную версию
            </BaseButton>
          </div>
        </div>
      </BaseModal>

      <!-- Storage Error Alert Modal -->
      <ConfirmModal
        v-model="isSaveErrorModalOpen"
        title="Ошибка сохранения"
        :message="saveErrorMessage"
        confirm-text="Понятно"
        :hide-cancel="true"
        confirm-variant="primary"
        @confirm="isSaveErrorModalOpen = false"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '~/assets/scss/mixins' as *;

.note-edit-page {
  padding-top: var(--spacing-xl);
  padding-bottom: var(--spacing-2xl);
  max-width: 800px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;

  @include mobile {
    flex-direction: column;
    align-items: stretch;
  }
}

.editor-header__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;

  @include mobile {
    justify-content: space-between;
    width: 100%;
  }
}

.history-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.history-label {
  @include mobile {
    display: none;
  }
}

.main-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.danger-btn {
  color: var(--color-danger);

  &:hover {
    background-color: var(--color-danger-light);
  }
}

.editor-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

.editor-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.todos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--spacing-xs);
}

.todos-header__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-main);
}

.todos-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.todos-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl);
  background-color: var(--color-surface);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.not-found-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-md);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  margin-top: var(--spacing-2xl);
}

.not-found-state__icon {
  width: 60px;
  height: 60px;
  border-radius: var(--radius-full);
  background-color: var(--color-danger-light);
  color: var(--color-danger);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);

  svg {
    width: 32px;
    height: 32px;
  }
}

.not-found-state__title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-main);
  margin-bottom: var(--spacing-xs);
}

.not-found-state__desc {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

.conflict-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);

  &__message {
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);

    @include tablet {
      flex-direction: row;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
  }
}
</style>
