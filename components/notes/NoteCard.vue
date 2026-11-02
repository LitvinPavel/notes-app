<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Note } from '~/types/note'
import BaseButton from '~/components/ui/BaseButton.vue'

interface Props {
  note: Note
  maxPreviewItems?: number
}

const props = withDefaults(defineProps<Props>(), {
  maxPreviewItems: 3
})

const emit = defineEmits<{
  (e: 'edit', id: string): void
  (e: 'delete', note: Note): void
}>()

const isExpanded = ref(false)

const displayedTodos = computed(() => {
  if (isExpanded.value) {
    return props.note.todos
  }
  return props.note.todos.slice(0, props.maxPreviewItems)
})

const hiddenTodosCount = computed(() => {
  return Math.max(0, props.note.todos.length - props.maxPreviewItems)
})

const formattedDate = computed(() => {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(props.note.updatedAt))
  } catch {
    return ''
  }
})

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <article class="note-card">
    <div class="note-card__header">
      <h3 class="note-card__title" :title="note.title">
        {{ note.title || 'Безымянная заметка' }}
      </h3>
      <span class="note-card__date">
        {{ formattedDate }}
      </span>
    </div>

    <div class="note-card__body">
      <ul v-if="note.todos.length > 0" class="preview-todo-list">
        <li
          v-for="todo in displayedTodos"
          :key="todo.id"
          :class="['preview-todo-item', { 'is-completed': todo.completed }]"
        >
          <!-- Read-only preview indicator: clicking on main page does not toggle -->
          <span class="preview-todo-item__checkbox" aria-hidden="true">
            <svg
              v-if="todo.completed"
              class="preview-todo-item__check-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span class="preview-todo-item__text" :title="todo.text">
            {{ todo.text || 'Пустая задача' }}
          </span>
        </li>
      </ul>

      <p v-else class="note-card__empty-todos">
        Список задач пуст
      </p>

      <!-- Expand / Collapse toggle button for full preview -->
      <button
        v-if="note.todos.length > maxPreviewItems"
        type="button"
        class="note-card__toggle-btn"
        :aria-expanded="isExpanded"
        @click="toggleExpanded"
      >
        <span v-if="!isExpanded">+{{ hiddenTodosCount }} ещё (показать все)</span>
        <span v-else>Свернуть список</span>
        <svg
          :class="['toggle-icon', { 'is-rotated': isExpanded }]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>

    <div class="note-card__footer">
      <BaseButton
        variant="secondary"
        size="sm"
        @click="emit('edit', note.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Изменить
      </BaseButton>

      <BaseButton
        variant="ghost"
        size="sm"
        aria-label="Удалить заметку"
        class="delete-btn"
        @click="emit('delete', note)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon delete-icon">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Удалить
      </BaseButton>
    </div>
  </article>
</template>

<style scoped lang="scss">
@use '~/assets/scss/mixins' as *;

.note-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  @include surface-hover;

  &:hover {
    border-color: var(--color-border-hover);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }
}

.note-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.note-card__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-main);
  @include line-clamp(2);
  line-height: 1.35;
}

.note-card__date {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 2px;
}

.note-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
}

.preview-todo-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.preview-todo-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: 0.875rem;
  color: var(--color-text-secondary);

  &.is-completed {
    .preview-todo-item__checkbox {
      background-color: var(--color-success);
      border-color: var(--color-success);
    }

    .preview-todo-item__text {
      text-decoration: line-through;
      color: var(--color-text-muted);
    }
  }
}

.preview-todo-item__checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--color-border-hover);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.preview-todo-item__check-icon {
  width: 11px;
  height: 11px;
  color: #ffffff;
}

.preview-todo-item__text {
  @include truncate;
  line-height: 1.4;
}

.note-card__empty-todos {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  font-style: italic;
  margin: var(--spacing-xs) 0;
}

.note-card__toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xxs);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-primary);
  background-color: var(--color-primary-light);
  padding: 4px var(--spacing-sm);
  border-radius: var(--radius-md);
  align-self: flex-start;
  margin-top: var(--spacing-xs);
  cursor: pointer;
  border: 1px solid transparent;
  @include surface-hover;
  @include focus-ring;

  &:hover {
    background-color: #dbeafe;
    color: var(--color-primary-hover);
  }
}

.toggle-icon {
  width: 14px;
  height: 14px;
  transition: transform var(--transition-fast);

  &.is-rotated {
    transform: rotate(180deg);
  }
}

.note-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--color-border);
}

.btn-icon {
  width: 15px;
  height: 15px;
}

.delete-btn {
  color: var(--color-text-muted);

  &:hover {
    color: var(--color-danger);
    background-color: var(--color-danger-light);
  }
}
</style>
