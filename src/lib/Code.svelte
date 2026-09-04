<script lang="ts">
  import { untrack } from 'svelte'
  import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext } from '@codemirror/autocomplete'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
  import { HighlightStyle, bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language'
  import { EditorState } from '@codemirror/state'
  import { Decoration, EditorView, ViewPlugin, drawSelection, highlightSpecialChars, keymap, placeholder as cmPlaceholder, type DecorationSet, type ViewUpdate } from '@codemirror/view'
  import { tags } from '@lezer/highlight'
  import { scriptConnectionFields } from './connections'

  let {
    id,
    value = $bindable(''),
    placeholder = '',
    selectedKeys = [],
  }: {
    id: string
    value: string
    placeholder?: string
    selectedKeys?: readonly string[]
  } = $props()

  const highlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--code-bool)' },
    { tag: tags.controlKeyword, color: 'var(--code-ctrl)' },
    { tag: tags.definitionKeyword, color: 'var(--code-kw)' },
    { tag: tags.moduleKeyword, color: 'var(--code-kw)' },
    { tag: tags.operatorKeyword, color: 'var(--code-fg)' },
    { tag: tags.modifier, color: 'var(--code-kw)' },
    { tag: tags.bool, color: 'var(--code-bool)' },
    { tag: tags.null, color: 'var(--code-bool)' },
    { tag: tags.atom, color: 'var(--code-bool)' },
    { tag: tags.self, color: 'var(--code-bool)' },
    { tag: tags.string, color: 'var(--code-str)' },
    { tag: tags.special(tags.string), color: 'var(--code-str)' },
    { tag: tags.regexp, color: 'var(--code-str)' },
    { tag: tags.comment, color: 'var(--code-cmt)' },
    { tag: tags.lineComment, color: 'var(--code-cmt)' },
    { tag: tags.blockComment, color: 'var(--code-cmt)' },
    { tag: tags.number, color: 'var(--code-num)' },
    { tag: tags.function(tags.definition(tags.variableName)), color: 'var(--code-fn-name)' },
    { tag: tags.function(tags.variableName), color: 'var(--code-fn-name)' },
    { tag: tags.function(tags.propertyName), color: 'var(--code-fn)' },
    { tag: tags.definition(tags.variableName), color: 'var(--code-name)' },
    { tag: tags.definition(tags.className), color: 'var(--code-class)' },
    { tag: tags.definition(tags.typeName), color: 'var(--code-class)' },
    { tag: tags.className, color: 'var(--code-class)' },
    { tag: tags.typeName, color: 'var(--code-class)' },
    { tag: tags.definition(tags.propertyName), color: 'var(--code-key)' },
    { tag: tags.propertyName, color: 'var(--code-var)' },
    { tag: tags.variableName, color: 'var(--code-var)' },
    { tag: tags.operator, color: 'var(--code-fg)' },
    { tag: tags.punctuation, color: 'var(--code-fg)' },
    { tag: tags.bracket, color: 'var(--code-fg)' },
    { tag: tags.paren, color: 'var(--code-fg)' },
    { tag: tags.squareBracket, color: 'var(--code-fg)' },
    { tag: tags.brace, color: 'var(--code-fg)' },
    { tag: tags.separator, color: 'var(--code-fg)' },
    { tag: tags.derefOperator, color: 'var(--code-fg)' },
  ])

  const pascalClass = Decoration.mark({ class: 'cm-pascal-class' })
  const pascalNames = ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = markPascal(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = markPascal(u.view)
    }
  }, { decorations: (v) => v.decorations })

  // ponytail: PascalCase ≈ class; upgrade is JS semantic tokens
  function markPascal(view: EditorView) {
    const out: ReturnType<typeof pascalClass.range>[] = []
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from, to,
        enter(node) {
          if (node.name !== 'VariableName') return
          const ch = view.state.doc.sliceString(node.from, node.from + 1)
          if (ch < 'A' || ch > 'Z') return
          out.push(pascalClass.range(node.from, node.to))
        },
      })
    }
    return Decoration.set(out)
  }

  function completions(context: CompletionContext) {
    const before = context.state.sliceDoc(Math.max(0, context.pos - 80), context.pos)
    const member = /([A-Za-z_$][\w$]*)\s*\.\s*([\w$]*)$/.exec(before)
    if (member) {
      const pool = member[1] === 'connection'
        ? scriptConnectionFields
        : member[1] === 'selected' ? selectedKeys.map((label) => [label, 'string'] as const) : null
      if (!pool) return null
      const prefix = member[2]
      const options = pool
        .filter(([label]) => label.startsWith(prefix))
        .map(([label, detail]) => ({ label, detail }))
      return options.length ? { from: context.pos - prefix.length, options } : null
    }
    const ident = context.matchBefore(/[A-Za-z_$][\w$]*/)
    if (!ident && !context.explicit) return null
    if (ident && ident.from === ident.to && !context.explicit) return null
    return {
      from: ident?.from ?? context.pos,
      options: [
        { label: 'connection', detail: 'Connection' },
        { label: 'selected', detail: '{ [id: string]: string }' },
      ],
    }
  }

  let host = $state<HTMLDivElement | undefined>()
  let view: EditorView | undefined
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (pending === null || !host) return
    const next = pending
    pending = null
    if (next === value) return
    value = next
    host.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function schedule(next: string) {
    pending = next
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 200)
  }

  $effect(() => {
    const parent = host
    if (!parent) return
    const v = untrack(() => new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          highlightSpecialChars(),
          history(),
          drawSelection(),
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          javascript(),
          javascriptLanguage.data.of({ autocomplete: completions }),
          autocompletion({ activateOnTyping: true, icons: false }),
          syntaxHighlighting(highlightStyle),
          pascalNames,
          cmPlaceholder(placeholder),
          EditorView.contentAttributes.of({ id, spellcheck: 'false' }),
          keymap.of([
            ...completionKeymap,
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) schedule(update.state.doc.toString())
          }),
          EditorView.theme({
            '&': { backgroundColor: 'transparent' },
            '&.cm-focused': { outline: 'none' },
            '.cm-scroller': {
              fontFamily: 'Consolas, ui-monospace, SFMono-Regular, monospace',
              fontSize: '12.5px',
              lineHeight: '1.45',
              minHeight: '180px',
              maxHeight: '280px',
            },
            '.cm-content': {
              padding: '12px 13px',
              caretColor: 'var(--code-fg)',
              minHeight: '180px',
            },
            '.cm-cursor': { borderLeftColor: 'var(--code-fg)' },
            '.cm-placeholder': { color: 'var(--code-cmt)' },
            '.cm-selectionBackground': { background: 'var(--code-sel)' },
            '&.cm-focused .cm-selectionBackground': { background: 'var(--code-sel)' },
            '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--code-match)' },
            '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'light-dark(#cf222e44, #f4877144)' },
            '.cm-tooltip.cm-tooltip-autocomplete > ul': {
              fontFamily: 'Consolas, ui-monospace, SFMono-Regular, monospace',
            },
          }),
        ],
      }),
    }))
    view = v
    return () => {
      flush()
      v.destroy()
      if (view === v) view = undefined
    }
  })

  $effect(() => {
    const next = value
    if (!view) return
    if (pending !== null) {
      if (next === view.state.doc.toString()) return
      pending = null
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
    }
    if (next === view.state.doc.toString()) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
  })
</script>

<div
  class="code-editor"
  bind:this={host}
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) flush()
  }}
></div>
