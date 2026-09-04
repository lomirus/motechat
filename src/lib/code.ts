import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

export type ScriptMarkKind = 'local' | 'parameter' | 'class' | 'special-keyword' | 'bracket-1' | 'bracket-2' | 'bracket-3'

export type ScriptMark = {
  from: number
  to: number
  kind: ScriptMarkKind
}

const bracketPairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
const bracketKinds = ['bracket-1', 'bracket-2', 'bracket-3'] as const
const parameters = new Set(['connection', 'selected'])

export function scriptMarks(state: EditorState) {
  const tree = syntaxTree(state)
  const names = new Set<string>()
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'VariableDefinition') return
      for (let node = ref.node.parent; node; node = node.parent) {
        if (node.name === 'VariableDeclaration') {
          if (node.getChild('const')) names.add(state.doc.sliceString(ref.from, ref.to))
          return
        }
        if (node.name === 'FunctionDeclaration' || node.name === 'ClassDeclaration') return
      }
    },
  })

  const marks: ScriptMark[] = []
  const brackets: { close: string; kind: ScriptMarkKind }[] = []
  tree.iterate({
    enter(ref) {
      const close = bracketPairs[ref.name]
      if (close) {
        // The edited script is the body of a function, so VS Code has one hidden brace level.
        const kind = bracketKinds[(brackets.length + 1) % bracketKinds.length]
        brackets.push({ close, kind })
        marks.push({ from: ref.from, to: ref.to, kind })
        return
      }
      const open = brackets[brackets.length - 1]
      if (open?.close === ref.name) {
        marks.push({ from: ref.from, to: ref.to, kind: open.kind })
        brackets.pop()
        return
      }
      if (ref.name === 'new') {
        marks.push({ from: ref.from, to: ref.to, kind: 'special-keyword' })
        return
      }
      if (ref.name !== 'VariableName' && ref.name !== 'VariableDefinition') return
      const name = state.doc.sliceString(ref.from, ref.to)
      if (names.has(name)) {
        marks.push({ from: ref.from, to: ref.to, kind: 'local' })
        return
      }
      if (ref.name === 'VariableName' && parameters.has(name)) {
        marks.push({ from: ref.from, to: ref.to, kind: 'parameter' })
        return
      }
      const ch = name[0]
      if (ch >= 'A' && ch <= 'Z') marks.push({ from: ref.from, to: ref.to, kind: 'class' })
    },
  })
  return marks
}
