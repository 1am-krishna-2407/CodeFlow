import { useEffect, useRef } from 'react'
import MonacoEditor, { BeforeMount, OnMount } from '@monaco-editor/react'
import { useTheme } from '../lib/theme'
import { Spinner } from './ui'

// Syntax themes built from the same palette as the UI tokens (see styles.css).
const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('codeflow-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8B97AB', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7C9CFF' },
      { token: 'string', foreground: '2DD4A7' },
      { token: 'number', foreground: 'FBBF24' },
      { token: 'type', foreground: 'A78BFA' },
      { token: 'type.identifier', foreground: 'A78BFA' },
      { token: 'annotation', foreground: 'A78BFA' },
      { token: 'delimiter', foreground: 'A3AEC2' },
    ],
    colors: {
      'editor.background': '#0D1220',
      'editor.foreground': '#E6EBF2',
      'editorLineNumber.foreground': '#4A5872',
      'editorLineNumber.activeForeground': '#8B97AB',
      'editor.lineHighlightBackground': '#172031',
      'editor.lineHighlightBorder': '#17203100',
      'editor.selectionBackground': '#7C9CFF40',
      'editor.inactiveSelectionBackground': '#7C9CFF22',
      'editorCursor.foreground': '#2DD4A7',
      'editorIndentGuide.background1': '#1C2638',
      'editorWidget.background': '#111723',
      'editorWidget.border': '#233047',
      'scrollbarSlider.background': '#23304780',
      'scrollbarSlider.hoverBackground': '#233047',
    },
  })
  monaco.editor.defineTheme('codeflow-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5B6475', fontStyle: 'italic' },
      { token: 'keyword', foreground: '4F6BED' },
      { token: 'string', foreground: '0B7F65' },
      { token: 'number', foreground: 'B45309' },
      { token: 'type', foreground: '7C3AED' },
      { token: 'type.identifier', foreground: '7C3AED' },
      { token: 'annotation', foreground: '7C3AED' },
      { token: 'delimiter', foreground: '5B6475' },
    ],
    colors: {
      'editor.background': '#FBFBFC',
      'editor.foreground': '#111827',
      'editorLineNumber.foreground': '#A0A8B8',
      'editorLineNumber.activeForeground': '#5B6475',
      'editor.lineHighlightBackground': '#F0F2F5',
      'editor.lineHighlightBorder': '#F0F2F500',
      'editor.selectionBackground': '#4F6BED30',
      'editorCursor.foreground': '#0B7F65',
      'editorIndentGuide.background1': '#E6E9EF',
      'editorWidget.background': '#FFFFFF',
      'editorWidget.border': '#DDE2EA',
    },
  })
}

export default function CodeEditor({
  value, onChange, language, readOnly = false, onRun, ariaLabel = 'Code editor',
}: {
  value: string
  onChange?: (value: string) => void
  language: string
  readOnly?: boolean
  onRun?: () => void
  ariaLabel?: string
}) {
  const { resolved } = useTheme()
  // Monaco registers the command once; read the latest callback through a ref.
  const runRef = useRef(onRun)
  useEffect(() => {
    runRef.current = onRun
  }, [onRun])

  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.())
  }

  return (
    <MonacoEditor
      height="100%"
      language={language}
      value={value}
      onChange={(v) => onChange?.(v ?? '')}
      beforeMount={defineThemes}
      onMount={handleMount}
      theme={resolved === 'dark' ? 'codeflow-dark' : 'codeflow-light'}
      loading={<Spinner className="h-5 w-5" />}
      options={{
        readOnly,
        ariaLabel,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 13.5,
        lineHeight: 21,
        fontLigatures: false, // show exactly what was typed: <= must not render as ≤
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: readOnly ? 'none' : 'line',
        smoothScrolling: true,
        tabSize: 4,
        domReadOnly: readOnly,
      }}
    />
  )
}
