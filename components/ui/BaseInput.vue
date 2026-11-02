<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Props {
  modelValue: string
  label?: string
  placeholder?: string
  error?: string
  id?: string
  disabled?: boolean
  autofocus?: boolean
  variant?: 'default' | 'title'
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  placeholder: '',
  error: undefined,
  id: undefined,
  disabled: false,
  autofocus: false,
  variant: 'default'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const inputId = props.id || `input-${Math.random().toString(36).substring(2, 9)}`

onMounted(() => {
  if (props.autofocus && inputRef.value) {
    inputRef.value.focus()
  }
})

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  select: () => inputRef.value?.select(),
  setSelectionRange: (start: number, end: number, direction?: 'forward' | 'backward' | 'none') => {
    inputRef.value?.focus()
    inputRef.value?.setSelectionRange(start, end, direction)
  },
  input: inputRef
})
</script>

<template>
  <div :class="['base-input-wrapper', `base-input-wrapper--${variant}`, { 'has-error': Boolean(error) }]">
    <label v-if="label" :for="inputId" class="base-input__label">
      {{ label }}
    </label>

    <div class="base-input__control">
      <input
        :id="inputId"
        ref="inputRef"
        type="text"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="error ? `${inputId}-error` : undefined"
        class="base-input__field"
        @input="handleInput"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
        @keydown="emit('keydown', $event)"
      />
    </div>

    <span v-if="error" :id="`${inputId}-error`" class="base-input__error" role="alert">
      {{ error }}
    </span>
  </div>
</template>

<style scoped lang="scss">
@use '~/assets/scss/mixins' as *;

.base-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xxs);
  width: 100%;

  &.has-error {
    .base-input__field {
      border-color: var(--color-danger);

      &:focus {
        border-color: var(--color-danger);
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
      }
    }
  }

  &--title {
    .base-input__field {
      font-size: 1.5rem;
      font-weight: 700;
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-lg);

      @media (min-width: 768px) {
        font-size: 1.75rem;
      }
    }
  }
}

.base-input__label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.base-input__control {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.base-input__field {
  width: 100%;
  height: 42px;
  padding: 0 var(--spacing-md);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.9375rem;
  color: var(--color-text-main);
  @include surface-hover;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:hover:not(:disabled) {
    border-color: var(--color-border-hover);
  }

  &:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  &:disabled {
    background-color: var(--color-bg);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}

.base-input__error {
  font-size: 0.8125rem;
  color: var(--color-danger);
  margin-top: 2px;
}
</style>
