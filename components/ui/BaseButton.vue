<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  iconOnly?: boolean
  ariaLabel?: string
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  type: 'button',
  iconOnly: false,
  ariaLabel: undefined
})

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const handleClick = (event: MouseEvent) => {
  emit('click', event)
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :class="[
      'base-button',
      `base-button--${variant}`,
      `base-button--${size}`,
      { 'base-button--icon-only': iconOnly }
    ]"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
@use '~/assets/scss/mixins' as *;

.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  font-weight: 500;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  @include surface-hover;
  @include focus-ring;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    pointer-events: none;
  }

  // Sizes
  &--sm {
    height: 32px;
    padding: 0 var(--spacing-sm);
    font-size: 0.8125rem;

    &.base-button--icon-only {
      width: 32px;
      padding: 0;
    }
  }

  &--md {
    height: 40px;
    padding: 0 var(--spacing-md);
    font-size: 0.875rem;

    &.base-button--icon-only {
      width: 40px;
      padding: 0;
    }
  }

  &--lg {
    height: 48px;
    padding: 0 var(--spacing-lg);
    font-size: 1rem;

    &.base-button--icon-only {
      width: 48px;
      padding: 0;
    }
  }

  // Variants
  &--primary {
    background-color: var(--color-primary);
    color: var(--color-text-on-primary);

    &:hover:not(:disabled) {
      background-color: var(--color-primary-hover);
    }

    &:active:not(:disabled) {
      background-color: var(--color-primary-active);
    }
  }

  &--secondary {
    background-color: var(--color-surface);
    color: var(--color-text-main);
    border-color: var(--color-border);

    &:hover:not(:disabled) {
      background-color: var(--color-surface-hover);
      border-color: var(--color-border-hover);
    }

    &:active:not(:disabled) {
      background-color: var(--color-surface-subtle);
    }
  }

  &--outline {
    background-color: transparent;
    color: var(--color-primary);
    border-color: var(--color-primary);

    &:hover:not(:disabled) {
      background-color: var(--color-primary-light);
    }
  }

  &--danger {
    background-color: var(--color-danger);
    color: #ffffff;

    &:hover:not(:disabled) {
      background-color: var(--color-danger-hover);
    }

    &:active:not(:disabled) {
      background-color: var(--color-danger-active);
    }
  }

  &--ghost {
    background-color: transparent;
    color: var(--color-text-secondary);

    &:hover:not(:disabled) {
      background-color: var(--color-surface-hover);
      color: var(--color-text-main);
    }
  }
}
</style>
