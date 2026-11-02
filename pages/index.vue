<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotesStore } from '~/stores/notes'
import type { Note } from '~/types/note'
import NoteCard from '~/components/notes/NoteCard.vue'
import BaseButton from '~/components/ui/BaseButton.vue'
import ConfirmModal from '~/components/ui/ConfirmModal.vue'

const router = useRouter()
const notesStore = useNotesStore()

onMounted(() => {
  notesStore.init()
})

// Deletion confirmation flow
const noteToDelete = ref<Note | null>(null)
const isDeleteModalOpen = ref(false)

const openDeleteModal = (note: Note) => {
  noteToDelete.value = note
  isDeleteModalOpen.value = true
}

const handleConfirmDelete = () => {
  if (noteToDelete.value) {
    notesStore.deleteNote(noteToDelete.value.id)
    noteToDelete.value = null
  }
}

const handleCancelDelete = () => {
  noteToDelete.value = null
}

const navigateToCreate = () => {
  router.push('/notes/new')
}

const navigateToEdit = (id: string) => {
  router.push(`/notes/${id}`)
}
</script>

<template>
  <div class="notes-page container">
    <header class="notes-page__header">
      <div class="notes-page__header-title-box">
        <h1 class="notes-page__title">
          Мои заметки
        </h1>
        <p class="notes-page__subtitle">
          Всего заметок: {{ notesStore.allNotes.length }}
        </p>
      </div>

      <BaseButton
        variant="primary"
        size="md"
        @click="navigateToCreate"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-icon">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Новая заметка
      </BaseButton>
    </header>

    <main class="notes-page__content">
      <div v-if="notesStore.allNotes.length > 0" class="notes-grid">
        <NoteCard
          v-for="note in notesStore.allNotes"
          :key="note.id"
          :note="note"
          @edit="navigateToEdit"
          @delete="openDeleteModal"
        />
      </div>

      <!-- Empty state -->
      <section v-else class="empty-state">
        <div class="empty-state__icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <h2 class="empty-state__title">
          У вас пока нет заметок
        </h2>
        <p class="empty-state__desc">
          Создавайте заметки со списками задач, отслеживайте прогресс и организуйте свои дела.
        </p>
        <BaseButton
          variant="primary"
          size="lg"
          @click="navigateToCreate"
        >
          Создать первую заметку
        </BaseButton>
      </section>
    </main>

    <!-- Delete Confirmation Modal -->
    <ConfirmModal
      v-model="isDeleteModalOpen"
      title="Удаление заметки"
      :message="`Вы уверены, что хотите удалить заметку «${noteToDelete?.title || 'Без названия'}»? Это действие нельзя будет отменить.`"
      confirm-text="Удалить"
      cancel-text="Отмена"
      confirm-variant="danger"
      @confirm="handleConfirmDelete"
      @cancel="handleCancelDelete"
    />
  </div>
</template>

<style scoped lang="scss">
@use '~/assets/scss/mixins' as *;

.notes-page {
  padding-top: var(--spacing-xl);
  padding-bottom: var(--spacing-2xl);
}

.notes-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
  }
}

.notes-page__title {
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-text-main);
  letter-spacing: -0.02em;
}

.notes-page__subtitle {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.btn-icon {
  width: 18px;
  height: 18px;
}

.notes-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-lg);

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-md);
  background-color: var(--color-surface);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-xl);
  max-width: 540px;
  margin: var(--spacing-xl) auto 0;
}

.empty-state__icon-box {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);

  svg {
    width: 32px;
    height: 32px;
  }
}

.empty-state__title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-main);
  margin-bottom: var(--spacing-xs);
}

.empty-state__desc {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: var(--spacing-lg);
  max-width: 400px;
}
</style>
