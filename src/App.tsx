import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import { ArrowUUpLeftIcon, ArrowUUpRightIcon, CaretDownIcon, CheckIcon, CodeBlockIcon, CodeIcon, ColumnsPlusRightIcon, DownloadSimpleIcon, DotsThreeVerticalIcon, GearIcon, LinkIcon, ListIcon, ListBulletsIcon, ListChecksIcon, ListNumbersIcon, MagnifyingGlassIcon, NoteIcon, PlusIcon, QuotesIcon, RowsPlusBottomIcon, TableIcon, TextBIcon, TextItalicIcon, TrashIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react'
import { clearNotes, createNote, deleteNote, listNotes, replaceNotes, saveNote, type Note } from './db'

type IconName = 'search' | 'plus' | 'chevron' | 'note' | 'settings' | 'close' | 'undo' | 'redo'

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const props = { size, weight: 'regular' as const, 'aria-hidden': true }
  if (name === 'search') return <MagnifyingGlassIcon {...props} />
  if (name === 'plus') return <PlusIcon {...props} />
  if (name === 'chevron') return <CaretDownIcon {...props} />
  if (name === 'close') return <XIcon {...props} />
  if (name === 'undo') return <ArrowUUpLeftIcon {...props} />
  if (name === 'redo') return <ArrowUUpRightIcon {...props} />
  if (name === 'settings') return <GearIcon {...props} />
  return <NoteIcon {...props} />
}

function editorContent(content: string, format: Note['format'] = 'json') {
  if (format === 'markdown') return content
  try {
    if (content.trim().startsWith('{')) return JSON.parse(content)
  } catch { /* Legacy plain-text notes fall through to the paragraph conversion. */ }
  return content ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] } : { type: 'doc', content: [{ type: 'paragraph' }] }
}

type Command = { label: string; keywords: string; run: (editor: Editor) => void }
const slashCommands: Command[] = [
  { label: 'Text', keywords: 'text paragraph', run: (editor) => editor.chain().focus().setParagraph().run() },
  { label: 'Heading 1', keywords: 'heading h1 title', run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', keywords: 'heading h2', run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', keywords: 'heading h3', run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Heading 4', keywords: 'heading h4', run: (editor) => editor.chain().focus().toggleHeading({ level: 4 }).run() },
  { label: 'Heading 5', keywords: 'heading h5', run: (editor) => editor.chain().focus().toggleHeading({ level: 5 }).run() },
  { label: 'Bullet list', keywords: 'bullet list', run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', keywords: 'ordered numbered list', run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { label: 'Checklist', keywords: 'task checklist todo', run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { label: 'Quote', keywords: 'quote blockquote', run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { label: 'Code block', keywords: 'code block', run: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { label: 'Table', keywords: 'table grid rows columns', run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
]

function ToolbarGlyph({ label, active }: { label: string; active?: boolean }) {
  const props = { size: 19, weight: active ? 'bold' as const : 'regular' as const, 'aria-hidden': true }
  if (label === 'Bold') return <TextBIcon {...props} />
  if (label === 'Italic') return <TextItalicIcon {...props} />
  if (label === 'Inline code') return <CodeIcon {...props} />
  if (label === 'Link') return <LinkIcon {...props} />
  if (label === 'Bullet list') return <ListBulletsIcon {...props} />
  if (label === 'Ordered list') return <ListNumbersIcon {...props} />
  if (label === 'Checklist') return <ListChecksIcon {...props} />
  if (label === 'Quote') return <QuotesIcon {...props} />
  if (label === 'Code block') return <CodeBlockIcon {...props} />
  if (label === 'Table') return <TableIcon {...props} />
  if (label === 'Add row') return <RowsPlusBottomIcon {...props} />
  if (label === 'Add column') return <ColumnsPlusRightIcon {...props} />
  if (label === 'Undo') return <ArrowUUpLeftIcon {...props} />
  return <ArrowUUpRightIcon {...props} />
}

function ToolbarButton({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className={`toolbar-button ${active ? 'active' : ''}`} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} aria-label={label} title={label}><span className="toolbar-label">{label}</span><ToolbarGlyph label={label} active={active} /></button>
}

function EditorToolbar({ editor }: { editor: Editor }) {
  const [formatOpen, setFormatOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [, refreshToolbar] = useState(0)
  const formatMenuRef = useRef<HTMLDivElement>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)
  const linkSelectionRef = useRef<{ from: number; to: number } | null>(null)
  useEffect(() => {
    const refresh = () => refreshToolbar((value) => value + 1)
    editor.on('selectionUpdate', refresh)
    editor.on('transaction', refresh)
    return () => {
      editor.off('selectionUpdate', refresh)
      editor.off('transaction', refresh)
    }
  }, [editor])
  const activeHeading = [1, 2, 3, 4, 5].find((level) => editor.isActive('heading', { level }))
  const activeFormat = activeHeading ? `Heading ${activeHeading}` : 'Text'
  const formats = ['Text', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5']
  useEffect(() => {
    if (!formatOpen) return undefined
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (formatMenuRef.current && !formatMenuRef.current.contains(event.target as Node)) setFormatOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFormatOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [formatOpen])
  useEffect(() => {
    if (!linkOpen) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLinkOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [linkOpen])
  const applyFormat = (format: string) => {
    if (format === 'Text') editor.chain().focus().setParagraph().run()
    else editor.chain().focus().toggleHeading({ level: Number(format.slice(-1)) as 1 | 2 | 3 | 4 | 5 }).run()
    setFormatOpen(false)
  }
  const openLinkEditor = () => {
    linkSelectionRef.current = { from: editor.state.selection.from, to: editor.state.selection.to }
    setLinkUrl(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
    window.requestAnimationFrame(() => linkInputRef.current?.focus())
  }
  const applyLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const href = linkUrl.trim()
    const selection = linkSelectionRef.current
    if (!href || !selection) return
    editor.chain().focus().setTextSelection(selection).setLink({ href }).run()
    setLinkOpen(false)
  }
  return <div className="editor-toolbar" role="toolbar" aria-label="Formatting toolbar">
    <div ref={formatMenuRef} className={`format-menu ${formatOpen ? 'open' : ''}`}>
      <button type="button" className="format-trigger" aria-label="Text style" aria-haspopup="listbox" aria-expanded={formatOpen} onMouseDown={(event) => event.preventDefault()} onClick={() => setFormatOpen((open) => !open)}><span>{activeFormat}</span><CaretDownIcon size={16} weight="regular" aria-hidden /></button>
      {formatOpen && <div className="format-dropdown menu-panel" role="listbox" aria-label="Text style options">{formats.map((format) => <button type="button" role="option" aria-selected={activeFormat === format} className={`menu-option ${activeFormat === format ? 'selected' : ''}`} key={format} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat(format)}>{activeFormat === format && <CheckIcon size={18} weight="bold" aria-hidden />}{format}</button>)}</div>}
    </div>
    <span className="toolbar-divider" />
    <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
    <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
    <ToolbarButton label="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
    <div className="link-control"><ToolbarButton label="Link" active={editor.isActive('link')} onClick={openLinkEditor} />{linkOpen && <form className="link-popover menu-panel" onSubmit={applyLink}><input ref={linkInputRef} value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" aria-label="Link URL" /><button type="submit" className="link-submit" aria-label="Apply link"><CheckIcon size={16} weight="bold" aria-hidden /></button></form>}</div>
    <span className="toolbar-divider" />
    <ToolbarButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
    <ToolbarButton label="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
    <ToolbarButton label="Checklist" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
    <ToolbarButton label="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
    <ToolbarButton label="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
    <ToolbarButton label="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
    {editor.isActive('table') && <><span className="toolbar-divider" /><ToolbarButton label="Add row" onClick={() => editor.chain().focus().addRowAfter().run()} /><ToolbarButton label="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()} /></>}
    <span className="toolbar-spacer" />
    <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
    <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
  </div>
}

export type NoteEditorHandle = { getMarkdown: () => string }

const NoteEditor = forwardRef<NoteEditorHandle, { note: Note; mode: 'visual' | 'markdown'; onChange: (content: string, format?: Note['format']) => void; onTitleChange: (title: string) => void }>(function NoteEditor({ note, mode, onChange, onTitleChange }, ref) {
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashPosition, setSlashPosition] = useState({ top: 48, left: 0 })
  const [markdownText, setMarkdownText] = useState('')
  const hydrating = useRef(false)
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } } }), TaskList, TaskItem.configure({ nested: true }), TableKit.configure({ table: { resizable: true } }), Markdown.configure({ markedOptions: { gfm: true } })],
    content: editorContent(note.content, note.format),
    editorProps: { attributes: { class: 'tiptap-content' } },
    onUpdate: ({ editor: currentEditor }) => {
      if (!hydrating.current) {
        onChange(JSON.stringify(currentEditor.getJSON()), 'json')
        setMarkdownText(currentEditor.getMarkdown())
      }
      const { from } = currentEditor.state.selection
      const beforeCursor = currentEditor.state.doc.textBetween(Math.max(0, from - 40), from, '\n', '\0')
      const match = beforeCursor.match(/\/([a-z0-9]*)$/i)
      const onMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
      setSlashQuery(match && !onMobile ? match[1].toLowerCase() : null)
      if (match) {
        const editorRect = currentEditor.view.dom.closest('.tiptap-editor-wrap')?.getBoundingClientRect()
        const cursorRect = currentEditor.view.coordsAtPos(from)
        if (editorRect) setSlashPosition({ top: cursorRect.bottom - editorRect.top + 8, left: Math.max(0, cursorRect.left - editorRect.left) })
      }
    },
  })

  useImperativeHandle(ref, () => ({ getMarkdown: () => editor?.getMarkdown() ?? '' }), [editor])

  useEffect(() => {
    if (!editor) return
    hydrating.current = true
    if (note.format === 'markdown') editor.commands.setContent(note.content, { contentType: 'markdown' })
    else editor.commands.setContent(editorContent(note.content, note.format))
    setMarkdownText(editor.getMarkdown())
    hydrating.current = false
    setSlashQuery(null)
  }, [editor, note.id])

  useEffect(() => {
    if (slashQuery === null) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSlashQuery(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [slashQuery])

  if (!editor) return null
  const filteredCommands = slashCommands.filter((command) => command.keywords.includes(slashQuery ?? ''))
  const runSlashCommand = (command: Command) => {
    const { from } = editor.state.selection
    const beforeCursor = editor.state.doc.textBetween(Math.max(0, from - 40), from, '\n', '\0')
    const match = beforeCursor.match(/\/([a-z0-9]*)$/i)
    if (match) editor.chain().focus().deleteRange({ from: from - match[0].length, to: from }).run()
    command.run(editor)
    setSlashQuery(null)
  }

  const updateMarkdown = (value: string) => {
    setMarkdownText(value)
    hydrating.current = true
    editor.commands.setContent(value, { contentType: 'markdown' })
    hydrating.current = false
    onChange(JSON.stringify(editor.getJSON()), 'json')
  }

  return <div className="tiptap-editor-wrap">
    {mode === 'visual' ? <><EditorToolbar editor={editor} /><input className="title-input" value={note.title} onChange={(event) => onTitleChange(event.target.value)} aria-label="Note title" /><EditorContent editor={editor} /></> : <><input className="title-input" value={note.title} onChange={(event) => onTitleChange(event.target.value)} aria-label="Note title" /><textarea className="markdown-source" value={markdownText} onChange={(event) => updateMarkdown(event.target.value)} aria-label="Markdown source" spellCheck={false} /></>}
    {mode === 'visual' && slashQuery !== null && filteredCommands.length > 0 && <div className="slash-menu menu-panel" style={{ top: slashPosition.top, left: slashPosition.left }} role="menu" aria-label="Insert block">
      <span className="slash-menu-label">Insert block</span>
      {filteredCommands.map((command) => <button className="menu-option" type="button" role="menuitem" key={command.label} onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(command)}><strong>/</strong>{command.label}</button>)}
    </div>}
  </div>
})

function SettingsPanel({ mode, notes, onModeChange, onBackup, onRestore, onReset, onClose }: { mode: 'visual' | 'markdown'; notes: Note[]; onModeChange: (mode: 'visual' | 'markdown') => void; onBackup: () => void; onRestore: () => void; onReset: () => void; onClose: () => void }) {
  return <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-header"><div><span className="document-kicker">WORKSPACE</span><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><Icon name="close" /></button></div>
      <div className="settings-section"><span className="settings-label">EDITOR MODE</span><div className="mode-options"><button className={mode === 'visual' ? 'selected' : ''} onClick={() => onModeChange('visual')}><strong>Visual</strong><span>Rich editor with formatting controls</span></button><button className={mode === 'markdown' ? 'selected' : ''} onClick={() => onModeChange('markdown')}><strong>Markdown</strong><span>Edit the source directly</span></button></div></div>
      <div className="settings-section"><span className="settings-label">WORKSPACE DATA</span><p className="settings-copy">Your notes stay in this browser using IndexedDB. Nothing is uploaded.</p><div className="settings-actions"><button onClick={onBackup}><DownloadSimpleIcon size={15} weight="regular" aria-hidden />Download backup</button><button onClick={onRestore}><UploadSimpleIcon size={15} weight="regular" aria-hidden />Restore backup</button></div><div className="local-info"><span>Notes stored locally</span><strong>{notes.length}</strong><span>Storage</span><strong>IndexedDB</strong></div></div>
      <div className="settings-section danger-section"><span className="settings-label">DANGER ZONE</span><p className="settings-copy">Remove every note and reset the local workspace. This cannot be undone without a backup.</p><button className="reset-button" onClick={onReset}>Reset workspace</button></div>
      <div className="settings-footer">Notes.md · v0.1</div>
    </section>
  </div>
}

export function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editorMode, setEditorMode] = useState<'visual' | 'markdown'>(() => localStorage.getItem('margin-editor-mode') === 'markdown' ? 'markdown' : 'visual')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saveState, setSaveState] = useState<'loading' | 'unsaved' | 'saving' | 'saved'>('loading')
  const saveTimer = useRef<number | undefined>(undefined)
  const editorRef = useRef<NoteEditorHandle>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    listNotes().then(async (storedNotes) => {
      if (storedNotes.length === 0) {
        const firstNote = await createNote()
        setNotes([firstNote])
        setSelectedNote(firstNote)
      } else {
        setNotes(storedNotes)
        setSelectedNote(storedNotes[0])
      }
      setSaveState('saved')
    }).catch(() => setSaveState('saved'))
    return () => window.clearTimeout(saveTimer.current)
  }, [])

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return notes
    return notes.filter((note) => `${note.title} ${note.content}`.toLocaleLowerCase().includes(normalizedQuery))
  }, [notes, query])

  const handleDeleteNote = async (note: Note) => {
    if (!window.confirm(`Delete “${note.title || 'Untitled note'}”?`)) return
    await deleteNote(note.id)
    setNotes((current) => {
      const remaining = current.filter((item) => item.id !== note.id)
      if (selectedNote?.id === note.id) setSelectedNote(remaining[0] ?? null)
      return remaining
    })
    setSaveState('saved')
  }

  const updateNote = (changes: Partial<Note>) => {
    if (!selectedNote) return
    const updated = { ...selectedNote, ...changes, updatedAt: Date.now() }
    setSelectedNote(updated)
    setNotes((current) => current.map((note) => note.id === updated.id ? updated : note).sort((a, b) => b.updatedAt - a.updatedAt))
    setSaveState('unsaved')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      setSaveState('saving')
      saveNote(updated).then(() => setSaveState('saved')).catch(() => setSaveState('unsaved'))
    }, 350)
  }

  const handleCreateNote = async () => {
    const note = await createNote()
    setNotes((current) => [note, ...current])
    setSelectedNote(note)
    setQuery('')
    setSearchOpen(false)
    setSaveState('saved')
    setSidebarOpen(false)
  }

  const handleExport = () => {
    if (!selectedNote) return
    const markdown = editorRef.current?.getMarkdown() ?? ''
    const safeTitle = (selectedNote.title || 'untitled-note').trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'untitled-note'
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeTitle}.md`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const importMarkdownFile = async (file: File) => {
    const markdown = await file.text()
    const note = await createNote()
    const imported = { ...note, title: file.name.replace(/\.(md|markdown|mdown|txt)$/i, '') || 'Imported note', content: markdown, format: 'markdown' as const, updatedAt: Date.now() }
    await saveNote(imported)
    setNotes((current) => [imported, ...current])
    setSelectedNote(imported)
    changeEditorMode('visual')
    setSaveState('saved')
    setSidebarOpen(false)
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await importMarkdownFile(file)
  }

  const isMarkdownFile = (file: File) => /\.(md|markdown|mdown|txt)$/i.test(file.name) || file.type === 'text/markdown'
  const dragHasFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    const files = Array.from(event.dataTransfer?.files ?? []).filter(isMarkdownFile)
    for (const file of files) await importMarkdownFile(file)
  }

  const changeEditorMode = (mode: 'visual' | 'markdown') => {
    setEditorMode(mode)
    localStorage.setItem('margin-editor-mode', mode)
  }

  const handleBackup = () => {
    const payload = JSON.stringify({ version: 1, app: 'Notes.md', exportedAt: new Date().toISOString(), preferences: { editorMode }, notes }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `notes-md-workspace-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const handleRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as { notes?: Note[]; preferences?: { editorMode?: 'visual' | 'markdown' } }
      if (!Array.isArray(parsed.notes) || parsed.notes.some((note) => !note.id || typeof note.title !== 'string' || typeof note.content !== 'string')) throw new Error('Invalid backup')
      await replaceNotes(parsed.notes)
      const restoredNotes = [...parsed.notes].sort((a, b) => b.updatedAt - a.updatedAt)
      setNotes(restoredNotes)
      setSelectedNote(restoredNotes[0] ?? null)
      if (parsed.preferences?.editorMode === 'markdown' || parsed.preferences?.editorMode === 'visual') changeEditorMode(parsed.preferences.editorMode)
      setSettingsOpen(false)
      setSaveState('saved')
    } catch {
      window.alert('This backup file is not valid Margin data.')
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Reset Notes.md workspace? All local notes will be removed.')) return
    await clearNotes()
    setNotes([])
    setSelectedNote(null)
    changeEditorMode('visual')
    setSettingsOpen(false)
    setSaveState('saved')
  }

  const saveLabel = saveState === 'loading' ? 'Loading workspace' : saveState === 'unsaved' ? 'Unsaved changes' : saveState === 'saving' ? 'Saving…' : 'All changes saved'
  const saveDotClass = saveState === 'saved' ? 'saved-dot' : saveState === 'unsaved' ? 'unsaved-dot' : 'saving-dot'

  return <div className={`app-shell ${isDragging ? 'is-dragging' : ''}`} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand-row"><span className="brand-mark">md</span><span className="brand-name">Notes.md</span><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><Icon name="close" /></button></div>
      <div className="sidebar-heading"><span>NOTES</span><div className="sidebar-actions"><button className={`icon-button ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen((open) => !open)} aria-label="Search notes"><Icon name="search" /></button><button className="icon-button" onClick={handleCreateNote} aria-label="Create new note"><Icon name="plus" /></button></div></div>
      {searchOpen && <div className="search-box"><Icon name="search" size={14} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes" /><button className="search-clear" onClick={() => { setQuery(''); setSearchOpen(false) }} aria-label="Close search"><Icon name="close" size={13} /></button></div>}
      <div className="notes-list" aria-label="Notes list">{visibleNotes.length === 0 ? <div className="notes-empty"><div className="empty-note-icon"><Icon name="note" size={18} /></div><p>{notes.length === 0 ? 'No notes yet' : 'No matching notes'}</p><span>{notes.length === 0 ? 'Create your first note to get started.' : 'Try a different search.'}</span></div> : visibleNotes.map((note) => <div key={note.id} className={`note-row ${selectedNote?.id === note.id ? 'selected' : ''}`}><button className="note-row-main" onClick={() => { setSelectedNote(note); setSaveState('saved'); setSidebarOpen(false) }}><span className="note-row-copy"><strong>{note.title || 'Untitled note'}</strong></span></button><button className="note-delete-button" onClick={() => void handleDeleteNote(note)} aria-label={`Delete ${note.title || 'Untitled note'}`} title="Delete note"><TrashIcon size={15} weight="regular" aria-hidden /></button></div>)}</div>
      <div className="sidebar-footer"><button className="footer-link" onClick={() => setSettingsOpen(true)}><Icon name="settings" size={15} /> Settings</button><span className="local-badge"><span className="status-dot" /> Local</span></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><ListIcon size={20} weight="regular" aria-hidden /></button><div className="breadcrumbs"><span className="muted">Notes</span><span className="slash">/</span><span>{selectedNote?.title ?? 'Workspace'}</span></div></div><div className="topbar-meta"><span className="save-state"><span className={`status-dot ${saveDotClass}`} /> {saveLabel}</span>{selectedNote && <><input ref={importInputRef} type="file" accept=".md,text/markdown" hidden onChange={handleImport} /><button className="file-button" onClick={() => importInputRef.current?.click()}><UploadSimpleIcon size={15} weight="regular" aria-hidden /><span className="btn-label">Import .md</span></button><button className="file-button" onClick={handleExport}><DownloadSimpleIcon size={15} weight="regular" aria-hidden /><span className="btn-label">Export .md</span></button><button className="mode-button format-trigger" onClick={() => changeEditorMode(editorMode === 'visual' ? 'markdown' : 'visual')}><span className="btn-label">{editorMode === 'visual' ? 'Visual' : 'Markdown'}</span> <Icon name="chevron" size={14} /></button><button className="icon-button topbar-settings" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><DotsThreeVerticalIcon size={20} weight="regular" aria-hidden /></button></>}</div></header>
      <section className={`editor-placeholder ${scrolled ? 'scrolled' : ''}`} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}>{selectedNote ? <div className="editor-canvas note-editor"><div className="document-kicker">LOCAL MARKDOWN DOCUMENT</div><NoteEditor ref={editorRef} note={selectedNote} mode={editorMode} onTitleChange={(title) => updateNote({ title })} onChange={(content, format) => updateNote({ content, format: format ?? 'json' })} /></div> : <div className="editor-canvas empty-editor"><div className="document-kicker">LOCAL MARKDOWN DOCUMENT</div><h1>Your workspace for ideas</h1><p className="lead">A calm place to work with documents that live outside your knowledge vault.</p><div className="placeholder-rule" /><p className="editor-hint">Create a note from the sidebar to get started.</p></div>}</section>
    </main>
    <div className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden />
    {isDragging && <div className="drop-overlay" aria-hidden><div className="drop-overlay-card"><UploadSimpleIcon size={26} weight="regular" aria-hidden /><strong>Suelta tu archivo Markdown</strong><span>Se importará como una nota nueva</span></div></div>}
    <input ref={backupInputRef} type="file" accept=".json,application/json" hidden onChange={handleRestore} />
    {settingsOpen && <SettingsPanel mode={editorMode} notes={notes} onModeChange={changeEditorMode} onBackup={handleBackup} onRestore={() => backupInputRef.current?.click()} onReset={handleReset} onClose={() => setSettingsOpen(false)} />}
  </div>
}
