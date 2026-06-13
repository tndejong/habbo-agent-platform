import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Bold, Italic, Code, Heading2, List, ListOrdered, Link, Minus } from 'lucide-react'

export function MarkdownEditor({ value, onChange, placeholder, rows = 16 }) {
  const [mode, setMode] = useState('edit')
  const textareaRef = useRef(null)

  function insert({ before, after = '', placeholder: ph = '' }) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || ph
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newValue)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      )
    })
  }

  function insertLine(prefix) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(newValue)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length)
    })
  }

  const tools = [
    { icon: Bold,        title: 'Bold',           action: () => insert({ before: '**', after: '**', placeholder: 'bold text' }) },
    { icon: Italic,      title: 'Italic',         action: () => insert({ before: '_', after: '_', placeholder: 'italic text' }) },
    { icon: Code,        title: 'Inline code',    action: () => insert({ before: '`', after: '`', placeholder: 'code' }) },
    { icon: Heading2,    title: 'Heading',        action: () => insertLine('## ') },
    { icon: List,        title: 'Bullet list',    action: () => insertLine('- ') },
    { icon: ListOrdered, title: 'Numbered list',  action: () => insertLine('1. ') },
    { icon: Link,        title: 'Link',           action: () => insert({ before: '[', after: '](url)', placeholder: 'link text' }) },
    { icon: Minus,       title: 'Divider',        action: () => insert({ before: '\n---\n', placeholder: '' }) },
  ]

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center gap-0 border-b border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'edit' ? 'text-foreground bg-background border-r border-border' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'preview' ? 'text-foreground bg-background border-r border-border' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Preview
        </button>
        <span className="ml-auto px-3 text-xs text-muted-foreground/50">Markdown</span>
      </div>

      {mode === 'edit' && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/20">
          {tools.map(({ icon: Icon, title, action }) => (
            <button
              key={title}
              type="button"
              title={title}
              onMouseDown={e => { e.preventDefault(); action() }}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}

      {mode === 'edit' && (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full text-sm bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none font-mono resize-y min-h-[200px]"
        />
      )}

      {mode === 'preview' && (
        <div className="px-4 py-3 min-h-[200px] bg-background prose prose-sm dark:prose-invert max-w-none
          [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mb-2
          [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-1
          [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1
          [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:my-1
          [&_ul]:text-sm [&_ul]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1
          [&_ol]:text-sm [&_ol]:text-muted-foreground [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1
          [&_li]:my-0.5
          [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-primary
          [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto
          [&_strong]:text-foreground [&_strong]:font-semibold
          [&_hr]:border-border">
          {value ? <ReactMarkdown>{value}</ReactMarkdown> : <p className="text-muted-foreground/50 text-sm italic">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  )
}
