<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { TodoItem } from '~/types/note'
import BaseCheckbox from '~/components/ui/BaseCheckbox.vue'
import BaseButton from '~/components/ui/BaseButton.vue'

interface Props {
  item: TodoItem
  index: number
  autofocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  autofocus: false
})

const emit = defineEmits<{
  (e: 'toggle', completed: boolean): void
  (e: 'text-input', text: string, fallbackInitial?: string): void
  (e: 'text-blur'): void
  (e: 'remove'): void
  (e: 'enter-pressed'): void
}>()

const localText = ref(props.item.text)
const inputRef = ref<HTMLInputElement | null>(null)

// Synchronize if text changes via Undo/Redo
watch(
  () => props.item.text,
  (newText) => {
    if (newText !== localText.value) {
      localText.value = newText
    }
  }
)

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  localText.value = target.value
  emit('text-input', target.value, props.item.text)
}

const handleBlur = () => {
  emit('text-blur')
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('text-blur')
    emit('enter-pressed')
  }
}

const focus = () => {
  nextTick(() => {
    inputRef.value?.focus()
  })
}

defineExpose({
  focus
})
</script>

<template>
  <div :class="['todo-editor-item', { 'is-completed': item.completed }]">
    <div class="todo-editor-item__checkbox">
      <BaseCheckbox
        :model-value="item.completed"
        :aria-label="`Отметить задачу ${index + 1}`"
        @update:model-value="emit('toggle', $event)"
      />
    </div>

    <div class="todo-editor-item__input-box">
      <input
        ref="inputRef"
        type="text"
        :value="localText"
        :placeholder="`Задача #${index + 1}...`"
        class="todo-editor-item__input"
        @input="handleInput"
        @blur="handleBlur"
        @keydown="handleKeydown"
      />
    </div>

    <BaseButton
      variant="ghost"
      size="sm"
      icon-only
      aria-label="Удалить задачу"
      class="todo-editor-item__remove-btn"
      @click="emit('remove')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="remove-icon">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </BaseButton>
  </div>
</template>

<style scoped lang="scss">
@use '~/assets/scss/mixins' as *;

.todo-editor-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  @include surface-hover;

  &:focus-within {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  &.is-completed {
    background-color: var(--color-surface-subtle);

    .todo-editor-item__input {
      text-decoration: line-through;
      color: var(--color-text-muted);
    }
  }
}

.todo-editor-item__checkbox {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.todo-editor-item__input-box {
  flex: 1;
}

.todo-editor-item__input {
  width: 100%;
  height: 36px;
  font-size: 0.9375rem;
  color: var(--color-text-main);
  border: none;
  background: transparent;

  &::placeholder {
    color: var(--color-text-muted);
  }
}

.todo-editor-item__remove-btn {
  color: var(--color-text-muted);
  flex-shrink: 0;

  &:hover {
    color: var(--color-danger);
    background-color: var(--color-danger-light);
  }
}

.remove-icon {
  width: 16px;
  height: 16px;
}
</style>
