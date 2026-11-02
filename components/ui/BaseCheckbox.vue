<script setup lang="ts">
interface Props {
  modelValue: boolean
  label?: string
  disabled?: boolean
  id?: string
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  disabled: false,
  id: undefined
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const checkboxId = props.id || `checkbox-${Math.random().toString(36).substring(2, 9)}`

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.checked)
}
</script>

<template>
  <label
    :for="checkboxId"
    :class="[
      'base-checkbox',
      { 'base-checkbox--checked': modelValue, 'base-checkbox--disabled': disabled }
    ]"
  >
    <input
      :id="checkboxId"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      class="base-checkbox__input"
      @change="handleChange"
    />

    <span class="base-checkbox__box" aria-hidden="true">
      <svg
        v-if="modelValue"
        class="base-checkbox__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>

    <span v-if="label || $slots.default" class="base-checkbox__label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<style scoped lang="scss">
@use '~/assets/scss/mixins' as *;

.base-checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  user-select: none;
  font-size: 0.9375rem;
  color: var(--color-text-main);

  &--disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.base-checkbox__input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  margin: 0;

  &:focus-visible + .base-checkbox__box {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

.base-checkbox__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  border: 2px solid var(--color-border-hover);
  background-color: var(--color-surface);
  transition: all var(--transition-fast);

  .base-checkbox:hover:not(.base-checkbox--disabled) & {
    border-color: var(--color-primary);
  }

  .base-checkbox--checked & {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
  }
}

.base-checkbox__icon {
  width: 14px;
  height: 14px;
  color: #ffffff;
}

.base-checkbox__label {
  line-height: 1.4;
  word-break: break-word;
}
</style>
