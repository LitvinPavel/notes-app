<script setup lang="ts">
import BaseModal from './BaseModal.vue'
import BaseButton from './BaseButton.vue'

interface Props {
  modelValue: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'primary' | 'danger'
  hideCancel?: boolean
}

withDefaults(defineProps<Props>(), {
  confirmText: 'Подтвердить',
  cancelText: 'Отмена',
  confirmVariant: 'primary',
  hideCancel: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const handleConfirm = () => {
  emit('confirm')
  emit('update:modelValue', false)
}

const handleCancel = () => {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="title"
    @update:model-value="emit('update:modelValue', $event)"
    @close="handleCancel"
  >
    <p class="confirm-message">
      {{ message }}
    </p>

    <template #footer>
      <BaseButton
        v-if="!hideCancel"
        variant="secondary"
        @click="handleCancel"
      >
        {{ cancelText }}
      </BaseButton>
      <BaseButton
        :variant="confirmVariant"
        data-autofocus
        @click="handleConfirm"
      >
        {{ confirmText }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped lang="scss">
.confirm-message {
  margin: 0;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
</style>
