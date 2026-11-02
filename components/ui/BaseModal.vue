<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'

interface Props {
  modelValue: boolean
  title?: string
  closeOnEscape?: boolean
  closeOnBackdrop?: boolean
  showCloseButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  closeOnEscape: true,
  closeOnBackdrop: true,
  showCloseButton: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}>()

const modalContentRef = ref<HTMLElement | null>(null)
let previousActiveElement: HTMLElement | null = null

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const closeModal = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleBackdropClick = (event: MouseEvent) => {
  if (props.closeOnBackdrop && event.target === event.currentTarget) {
    closeModal()
  }
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (!props.modelValue) return

  // Close on Escape
  if (props.closeOnEscape && event.key === 'Escape') {
    event.preventDefault()
    closeModal()
    return
  }

  // Focus trap on Tab / Shift+Tab
  if (event.key === 'Tab' && modalContentRef.value) {
    const focusableElements = Array.from(
      modalContentRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(el => el.offsetParent !== null) // only visible elements

    if (focusableElements.length === 0) {
      event.preventDefault()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (event.shiftKey) {
      if (document.activeElement === firstElement || !modalContentRef.value.contains(document.activeElement)) {
        event.preventDefault()
        lastElement?.focus()
      }
    } else {
      if (document.activeElement === lastElement || !modalContentRef.value.contains(document.activeElement)) {
        event.preventDefault()
        firstElement?.focus()
      }
    }
  }
}

const trapFocusOnOpen = async () => {
  if (typeof document === 'undefined') return

  previousActiveElement = document.activeElement as HTMLElement | null
  document.body.classList.add('modal-open')
  window.addEventListener('keydown', handleKeyDown)

  await nextTick()

  if (modalContentRef.value) {
    // Look for explicitly marked autofocus element or first focusable
    const autofocusTarget = modalContentRef.value.querySelector<HTMLElement>('[data-autofocus]')
    if (autofocusTarget) {
      autofocusTarget.focus()
      return
    }

    const firstFocusable = modalContentRef.value.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    firstFocusable?.focus()
  }
}

const cleanupOnClose = () => {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('modal-open')
    window.removeEventListener('keydown', handleKeyDown)

    // Restore focus to original trigger element
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus()
    }
  }
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      trapFocusOnOpen()
    } else {
      cleanupOnClose()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  cleanupOnClose()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="modelValue"
        class="modal-backdrop"
        role="presentation"
        @mousedown="handleBackdropClick"
      >
        <div
          ref="modalContentRef"
          class="modal-content"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? 'modal-title' : undefined"
        >
          <header v-if="title || showCloseButton" class="modal-header">
            <h2 v-if="title" id="modal-title" class="modal-title">
              {{ title }}
            </h2>
            <button
              v-if="showCloseButton"
              type="button"
              class="modal-close-btn"
              aria-label="Закрыть модальное окно"
              @click="closeModal"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div class="modal-body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '~/assets/scss/mixins' as *;

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background-color: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md);
}

.modal-content {
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-modal);
  width: 100%;
  max-width: 480px;
  max-height: calc(100vh - 2 * var(--spacing-lg));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-main);
}

.modal-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  @include surface-hover;
  @include focus-ring;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-main);
  }
}

.modal-body {
  padding: var(--spacing-lg);
  overflow-y: auto;
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  background-color: var(--color-surface-subtle);
}

// Fade transition
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity var(--transition-normal);

  .modal-content {
    transition: transform var(--transition-normal), opacity var(--transition-normal);
  }
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;

  .modal-content {
    opacity: 0;
    transform: scale(0.95) translateY(-8px);
  }
}
</style>
