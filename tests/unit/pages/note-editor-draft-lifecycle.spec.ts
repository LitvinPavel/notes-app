import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import NoteEditorPage from '~/pages/notes/[id].vue'
import { useNotesStore } from '~/stores/notes'
import { storageService } from '~/services/storage/storage-service'

const mockPush = vi.fn()
const routeParams = reactive({ id: 'new' })

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: routeParams
  }),
  useRouter: () => ({
    push: mockPush
  })
}))

describe('NoteEditorPage Draft Lifecycle & Unmount Safety ([P1])', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    mockPush.mockClear()
    routeParams.id = 'new'
  })

  it('does NOT re-save draft on unmount after successful save of a new note', async () => {
    routeParams.id = 'new'
    const store = useNotesStore()
    store.init()

    const wrapper = mount(NoteEditorPage, {
      attachTo: document.body
    })

    // Find and update title input
    const titleInput = wrapper.find('input[type="text"]')
    expect(titleInput.exists()).toBe(true)
    await titleInput.setValue('Brand New Note')

    // Click "Сохранить" in main actions
    const saveButton = wrapper.find('.main-actions .base-button--primary')
    expect(saveButton.exists()).toBe(true)
    await saveButton.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/')

    // Unmount component (simulating navigation away to '/')
    wrapper.unmount()

    // Assert that draft is completely absent from store and storage
    expect(store.hasDraftFor(null)).toBe(false)
    expect(storageService.getDraft(null)).toBeNull()
  })

  it('does NOT re-save draft on unmount after cancelling edits of an existing note', async () => {
    const store = useNotesStore()
    store.init()
    const note = store.createNote('Original Note Title', [])!
    routeParams.id = note.id

    const wrapper = mount(NoteEditorPage, {
      attachTo: document.body
    })

    // Modify title
    const titleInput = wrapper.find('input[type="text"]')
    await titleInput.setValue('Changed Title Unsaved')

    // Click "Отменить" in main actions
    const mainActionButtons = wrapper.findAll('.main-actions button')
    const cancelButton = mainActionButtons.find(b => b.text().trim() === 'Отменить')
    expect(cancelButton?.exists()).toBe(true)
    await cancelButton!.trigger('click')
    await nextTick()

    // Confirm cancel in modal dialog (teleported to document.body)
    const modalButtons = Array.from(document.body.querySelectorAll('button'))
    const confirmButton = modalButtons.find(b => b.textContent?.includes('Сбросить изменения'))
    expect(confirmButton).toBeDefined()
    confirmButton?.click()

    expect(mockPush).toHaveBeenCalledWith('/')

    // Unmount editor component
    wrapper.unmount()

    // Assert draft is cleared and not re-created on unmount
    expect(store.hasDraftFor(note.id)).toBe(false)
    expect(storageService.getDraft(note.id)).toBeNull()
  })

  it('does NOT re-save draft on unmount after deleting an existing note', async () => {
    const store = useNotesStore()
    store.init()
    const note = store.createNote('Note to Delete', [])!
    routeParams.id = note.id

    const wrapper = mount(NoteEditorPage, {
      attachTo: document.body
    })

    // Modify title before deleting
    const titleInput = wrapper.find('input[type="text"]')
    await titleInput.setValue('Modified before deleting')

    // Click "Удалить" in main actions
    const deleteButton = wrapper.find('.main-actions .danger-btn')
    expect(deleteButton.exists()).toBe(true)
    await deleteButton.trigger('click')
    await nextTick()

    // Confirm delete in modal dialog (teleported to document.body)
    const modalButtons = Array.from(document.body.querySelectorAll('button'))
    const confirmButton = modalButtons.find(b => b.textContent?.trim() === 'Удалить' && b.classList.contains('base-button--danger'))
    expect(confirmButton).toBeDefined()
    confirmButton?.click()

    expect(mockPush).toHaveBeenCalledWith('/')

    // Unmount editor component
    wrapper.unmount()

    // Assert draft is null
    expect(store.hasDraftFor(note.id)).toBe(false)
    expect(storageService.getDraft(note.id)).toBeNull()
  })

  it('preserves draft and does NOT navigate away when deletion from editor fails', async () => {
    mockPush.mockClear()
    const store = useNotesStore()
    store.init()
    const note = store.createNote('Note That Fails To Delete', [])!
    routeParams.id = note.id

    const wrapper = mount(NoteEditorPage, {
      attachTo: document.body
    })

    // Modify title
    const titleInput = wrapper.find('input[type="text"]')
    await titleInput.setValue('Draft content that must not be lost')

    // Mock deleteNote to fail
    const originalDeleteNote = store.deleteNote.bind(store)
    store.deleteNote = () => false

    // Click "Удалить" in main actions
    const deleteButton = wrapper.find('.main-actions .danger-btn')
    expect(deleteButton.exists()).toBe(true)
    await deleteButton.trigger('click')
    await nextTick()

    // Confirm delete in modal dialog
    const modalButtons = Array.from(document.body.querySelectorAll('button'))
    const confirmButton = modalButtons.find(b => b.textContent?.trim() === 'Удалить' && b.classList.contains('base-button--danger'))
    expect(confirmButton).toBeDefined()
    confirmButton?.click()
    await nextTick()

    // Must NOT navigate to '/'!
    expect(mockPush).not.toHaveBeenCalledWith('/')

    // Unmount editor component: draft must be preserved on unmount!
    wrapper.unmount()
    expect(store.hasDraftFor(note.id)).toBe(true)

    // Restore
    store.deleteNote = originalDeleteNote
  })
})
