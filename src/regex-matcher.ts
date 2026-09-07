import type {
  Category,
  ClassTerm,
  Flags,
  Node,
  ParsedPattern,
} from './regex-parser'
import { nodeWidth } from './regex-parser'
import {
  simpleLowercaseCodePoint,
  caseInsensitiveCharacters,
  decimalCharacters,
  isDecimal,
  isWhitespace,
  isWord,
  whitespaceCharacters,
  wordCharacters,
} from './unicode'

export type RegexMatch = [string, ...(string | undefined)[]] & {
  index: number
  input: string
  groups?: Record<string, string | undefined>
}

type Capture = [number, number] | undefined
type State = { position: number; captures: Capture[] }
const categoryCharacters = {
  d: decimalCharacters,
  s: whitespaceCharacters,
  w: wordCharacters,
}
const asciiCharacters = { d: '0-9', s: '\\t-\\r ', w: 'A-Za-z0-9_' }
const hex = (value: number) => `\\u{${value.toString(16)}}`

function category(value: Category, char: string, ascii: boolean): boolean {
  if (char === '') {
    return false
  }
  const kind = value.toLowerCase()
  const matches = ascii
    ? kind === 'd'
      ? /^[0-9]$/u.test(char)
      : kind === 's'
        ? /^[\t-\r ]$/u.test(char)
        : /^[A-Za-z0-9_]$/u.test(char)
    : kind === 'd'
      ? isDecimal(char)
      : kind === 's'
        ? isWhitespace(char)
        : isWord(char)
  return value === kind ? matches : !matches
}

function rangeContents(start: number, end: number, flags: Flags): string {
  if (!flags.ignoreCase) {
    return start === end ? hex(start) : `${hex(start)}-${hex(end)}`
  }
  if (!flags.ascii) {
    return caseInsensitiveCharacters(start, end)
  }
  let result = start === end ? hex(start) : `${hex(start)}-${hex(end)}`
  for (let code = 65; code <= 90; code++) {
    if (code >= start && code <= end) {
      result += hex(code + 32)
    }
    if (code + 32 >= start && code + 32 <= end) {
      result += hex(code)
    }
  }
  return result
}

function emitTerm(term: ClassTerm, flags: Flags): string {
  if (term.kind === 'range') {
    return `[${rangeContents(term.start, term.end, flags)}]`
  }
  const key = term.value.toLowerCase() as 'd' | 's' | 'w'
  return `[${term.value === key ? '' : '^'}${flags.ascii ? asciiCharacters[key] : categoryCharacters[key]}]`
}

function wordPattern(flags: Flags): string {
  return `[${flags.ascii ? asciiCharacters.w : wordCharacters}]`
}

function emit(node: Node): string {
  switch (node.kind) {
    case 'literal':
      return `[${rangeContents(node.value, node.value, node.flags)}]`
    case 'class': {
      const union = `(?:${node.terms.map((term) => emitTerm(term, node.flags)).join('|')})`
      return node.negate ? `(?!${union})[\\s\\S]` : union
    }
    case 'any':
      return node.flags.dotAll ? '[\\s\\S]' : '[^\\n]'
    case 'anchor': {
      if (node.value === 'A') {
        return '^'
      }
      if (node.value === 'Z') {
        return '(?![\\s\\S])'
      }
      if (node.value === '^') {
        return node.flags.multiline ? '(?:^|(?<=\\n))' : '^'
      }
      if (node.value === '$') {
        return node.flags.multiline
          ? '(?=\\n|(?![\\s\\S]))'
          : '(?=\\n?(?![\\s\\S]))'
      }
      const word = wordPattern(node.flags)
      return node.value === 'b'
        ? `(?:(?<=${word})(?!${word})|(?<!${word})(?=${word}))`
        : `(?=[\\s\\S]|(?<=[\\s\\S]))(?:(?<=${word})(?=${word})|(?<!${word})(?!${word}))`
    }
    case 'sequence':
      return node.children.map(emit).join('')
    case 'alternative':
      return `(?:${node.children.map(emit).join('|')})`
    case 'group':
      return `(${emit(node.child)})`
    case 'assertion':
      return `(?${node.behind ? '<' : ''}${node.positive ? '=' : '!'}${emit(node.child)})`
    case 'repeat':
      return `(?:${emit(node.child)}){${String(node.min)},${node.max === Infinity ? '' : String(node.max)}}${node.greedy ? '' : '?'}`
    default:
      throw new Error('Pattern requires the Python matcher.')
  }
}

function nativeCompatible(
  node: Node,
  repeated = false,
  behind = false,
): boolean {
  switch (node.kind) {
    case 'reference':
    case 'conditional':
    case 'atomic':
      return false
    case 'group':
      return (
        !repeated && !behind && nativeCompatible(node.child, repeated, behind)
      )
    case 'assertion':
      return nativeCompatible(node.child, repeated, node.behind || behind)
    case 'repeat':
      return !node.possessive && nativeCompatible(node.child, true, behind)
    case 'sequence':
    case 'alternative':
      return node.children.every((child) =>
        nativeCompatible(child, repeated, behind),
      )
    default:
      return true
  }
}

function characterAt(text: string, position: number): string {
  const code = text.codePointAt(position)
  return code === undefined ? '' : String.fromCodePoint(code)
}
function previousPosition(text: string, position: number): number {
  if (position <= 0) {
    return -1
  }
  const last = text.charCodeAt(position - 1)
  return last >= 0xdc00 &&
    last <= 0xdfff &&
    position > 1 &&
    text.charCodeAt(position - 2) >= 0xd800 &&
    text.charCodeAt(position - 2) <= 0xdbff
    ? position - 2
    : position - 1
}

export function createMatcher(
  parsed: ParsedPattern,
): (text: string) => Generator<RegexMatch> {
  function result(
    values: [string, ...(string | undefined)[]],
    index: number,
    text: string,
  ): RegexMatch {
    return Object.assign(
      values,
      { index, input: text },
      parsed.names.size
        ? {
            groups: Object.fromEntries(
              Array.from(parsed.names, ([name, group]) => [
                name,
                values[group],
              ]),
            ),
          }
        : {},
    )
  }
  if (
    nodeWidth(parsed.root, parsed.widths)[0] > 0 &&
    nativeCompatible(parsed.root)
  ) {
    const source = emit(parsed.root)
    // Native matching is used only after Python parsing, Unicode expansion, and
    // exclusion of constructs whose backtracking or capture semantics differ.
    new RegExp(source, 'gu')
    return function* (text) {
      for (const match of text.matchAll(new RegExp(source, 'gu'))) {
        yield result([match[0], ...match.slice(1)], match.index, text)
      }
    }
  }
  const predicates = new Map<Node, (char: string) => boolean>()
  function predicate(
    node: Extract<Node, { kind: 'literal' | 'class' }>,
  ): (char: string) => boolean {
    let check = predicates.get(node)
    if (check) {
      return check
    }
    const terms: ClassTerm[] =
      node.kind === 'literal'
        ? [{ kind: 'range', start: node.value, end: node.value }]
        : node.terms
    const ranges = terms
      .filter((term) => term.kind === 'range')
      .map(
        (term) =>
          new RegExp(
            `^[${rangeContents(term.start, term.end, node.flags)}]$`,
            'u',
          ),
      )
    const categories = terms.filter((term) => term.kind === 'category')
    check = (char) => {
      if (!char) {
        return false
      }
      const present =
        ranges.some((range) => range.test(char)) ||
        categories.some((term) => category(term.value, char, node.flags.ascii))
      return node.kind === 'class' && node.negate ? !present : present
    }
    predicates.set(node, check)
    return check
  }
  function* sequence(
    nodes: Node[],
    index: number,
    text: string,
    state: State,
  ): Generator<State> {
    const child = nodes[index]
    if (child === undefined) {
      yield state
      return
    }
    for (const next of match(child, text, state)) {
      yield* sequence(nodes, index + 1, text, next)
    }
  }
  function* repeat(
    node: Extract<Node, { kind: 'repeat' }>,
    text: string,
    initial: State,
  ): Generator<State> {
    if (node.possessive) {
      let state = initial,
        count = 0,
        previous: number | undefined
      while (
        count < node.max &&
        (count < node.min || state.position !== previous)
      ) {
        const first = match(node.child, text, state).next()
        if (first.done) {
          break
        }
        if (count >= node.min) {
          previous = state.position
        }
        state = first.value
        count++
      }
      if (count >= node.min) {
        yield state
      }
      return
    }
    type Frame = {
      state: State
      count: number
      yielded: boolean
      children: Generator<State> | undefined
      previous: number | undefined
    }
    const stack: Frame[] = [
      {
        state: initial,
        count: 0,
        yielded: false,
        children: undefined,
        previous: undefined,
      },
    ]
    for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
      if (!node.greedy && !frame.yielded) {
        frame.yielded = true
        if (frame.count >= node.min) {
          yield frame.state
        }
      }
      // CPython applies its zero-width guard after required repetitions.
      if (
        frame.count < node.max &&
        (frame.count < node.min || frame.state.position !== frame.previous)
      ) {
        frame.children ??= match(node.child, text, frame.state)
        const child = frame.children.next()
        if (!child.done) {
          stack.push({
            state: child.value,
            count: frame.count + 1,
            yielded: false,
            children: undefined,
            previous:
              frame.count < node.min ? frame.previous : frame.state.position,
          })
          continue
        }
      }
      stack.pop()
      if (node.greedy && frame.count >= node.min) {
        yield frame.state
      }
    }
  }
  function* match(node: Node, text: string, state: State): Generator<State> {
    const position = state.position
    switch (node.kind) {
      case 'literal':
      case 'class': {
        const char = characterAt(text, position)
        if (predicate(node)(char)) {
          yield { ...state, position: position + char.length }
        }
        return
      }
      case 'any': {
        const char = characterAt(text, position)
        if (char && (node.flags.dotAll || char !== '\n')) {
          yield { ...state, position: position + char.length }
        }
        return
      }
      case 'anchor': {
        const before = characterAt(text, previousPosition(text, position)),
          after = characterAt(text, position)
        let valid: boolean
        if (node.value === 'A') {
          valid = position === 0
        } else if (node.value === 'Z') {
          valid = position === text.length
        } else if (node.value === '^') {
          valid = position === 0 || (node.flags.multiline && before === '\n')
        } else if (node.value === '$') {
          valid =
            position === text.length ||
            (after === '\n' &&
              (node.flags.multiline || position === text.length - 1))
        } else {
          const boundary =
            category('w', before, node.flags.ascii) !==
            category('w', after, node.flags.ascii)
          valid = node.value === 'b' ? boundary : text.length > 0 && !boundary
        }
        if (valid) {
          yield state
        }
        return
      }
      case 'sequence':
        yield* sequence(node.children, 0, text, state)
        return
      case 'alternative':
        for (const child of node.children) {
          yield* match(child, text, state)
        }
        return
      case 'group':
        for (const next of match(node.child, text, state)) {
          const captures = next.captures.slice()
          captures[node.index] = [position, next.position]
          yield { ...next, captures }
        }
        return
      case 'assertion': {
        let start = position
        if (node.behind) {
          for (let index = 0; index < node.width && start >= 0; index++) {
            start = previousPosition(text, start)
          }
        }
        let found: State | undefined
        if (start >= 0) {
          for (const next of match(node.child, text, {
            ...state,
            position: start,
          })) {
            if (!node.behind || next.position === position) {
              found = next
              break
            }
          }
        }
        if (node.positive && found) {
          yield { position, captures: found.captures }
        } else if (!node.positive && !found) {
          yield state
        }
        return
      }
      case 'atomic': {
        const first = match(node.child, text, state).next()
        if (!first.done) {
          yield first.value
        }
        return
      }
      case 'repeat': {
        yield* repeat(node, text, state)
        return
      }
      case 'reference': {
        const capture = state.captures[node.index]
        if (!capture) {
          return
        }
        const original = text.slice(...capture)
        let end = position
        for (const char of original) {
          const actual = characterAt(text, end)
          if (!actual) {
            return
          }
          const left = char.codePointAt(0),
            right = actual.codePointAt(0)
          if (left === undefined || right === undefined) {
            return
          }
          const fold = (code: number): number =>
            node.flags.ascii
              ? code >= 65 && code <= 90
                ? code + 32
                : code
              : simpleLowercaseCodePoint(code)
          if (
            node.flags.ignoreCase ? fold(left) !== fold(right) : char !== actual
          ) {
            return
          }
          end += actual.length
        }
        yield { ...state, position: end }
        return
      }
      case 'conditional':
        yield* match(
          state.captures[node.index] ? node.yes : node.no,
          text,
          state,
        )
        return
    }
  }
  return function* (text) {
    let position = 0,
      rejectEmpty = false
    while (position <= text.length) {
      let found: State | undefined
      for (const state of match(parsed.root, text, {
        position,
        captures: [],
      })) {
        if (!rejectEmpty || state.position > position) {
          found = state
          break
        }
      }
      if (!found) {
        position += characterAt(text, position).length || 1
        rejectEmpty = false
        continue
      }
      yield result(
        [
          text.slice(position, found.position),
          ...Array.from({ length: parsed.groups }, (_, i) => {
            const capture = found.captures[i + 1]
            return capture ? text.slice(...capture) : undefined
          }),
        ],
        position,
        text,
      )
      rejectEmpty = found.position === position
      position = found.position
    }
  }
}
