import { openDB, type DBSchema } from 'idb'

export type Note = {
  id: string
  title: string
  content: string
  format?: 'json' | 'markdown'
  createdAt: number
  updatedAt: number
}

interface MarginDatabase extends DBSchema {
  notes: {
    key: string
    value: Note
    indexes: { 'by-updated': number }
  }
}

const database = openDB<MarginDatabase>('margin-local-docs', 1, {
  upgrade(db) {
    const store = db.createObjectStore('notes', { keyPath: 'id' })
    store.createIndex('by-updated', 'updatedAt')
  },
})

export async function listNotes() {
  const db = await database
  return db.getAllFromIndex('notes', 'by-updated').then((notes) => notes.reverse())
}

export async function saveNote(note: Note) {
  const db = await database
  await db.put('notes', note)
}

export async function deleteNote(id: string) {
  const db = await database
  await db.delete('notes', id)
}

export async function replaceNotes(notes: Note[]) {
  const db = await database
  const transaction = db.transaction('notes', 'readwrite')
  await transaction.store.clear()
  await Promise.all(notes.map((note) => transaction.store.put(note)))
  await transaction.done
}

export async function clearNotes() {
  const db = await database
  await db.clear('notes')
}

export async function createNote() {
  const now = Date.now()
  const note: Note = {
    id: crypto.randomUUID(),
    title: 'Untitled note',
    content: '',
    createdAt: now,
    updatedAt: now,
  }
  await saveNote(note)
  return note
}
