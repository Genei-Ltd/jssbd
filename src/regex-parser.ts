import { isIdentifier } from './unicode'

export type Flags = {
  ignoreCase: boolean
  ascii: boolean
  multiline: boolean
  dotAll: boolean
  verbose: boolean
}
export type Category = 'd' | 'D' | 's' | 'S' | 'w' | 'W'
export type ClassTerm =
  | { kind: 'range'; start: number; end: number }
  | { kind: 'category'; value: Category }
export type Node =
  | { kind: 'sequence' | 'alternative'; children: Node[] }
  | { kind: 'literal'; value: number; flags: Flags }
  | { kind: 'class'; terms: ClassTerm[]; negate: boolean; flags: Flags }
  | { kind: 'any'; flags: Flags }
  | { kind: 'anchor'; value: '^' | '$' | 'A' | 'Z' | 'b' | 'B'; flags: Flags }
  | { kind: 'group'; child: Node; index: number }
  | {
      kind: 'assertion'
      child: Node
      positive: boolean
      behind: boolean
      width: number
    }
  | { kind: 'atomic'; child: Node }
  | {
      kind: 'repeat'
      child: Node
      min: number
      max: number
      greedy: boolean
      possessive: boolean
    }
  | { kind: 'reference'; index: number; flags: Flags }
  | { kind: 'conditional'; index: number; yes: Node; no: Node }

export type ParsedPattern = {
  root: Node
  groups: number
  names: Map<string, number>
  widths: Map<number, [number, number]>
}

export const escapeValues: Readonly<Record<string, number>> = {
  a: 7,
  b: 8,
  f: 12,
  n: 10,
  r: 13,
  t: 9,
  v: 11,
  '\\': 92,
}

export function nodeWidth(
  node: Node,
  groups: Map<number, [number, number]>,
): [number, number] {
  switch (node.kind) {
    case 'literal':
    case 'class':
    case 'any':
      return [1, 1]
    case 'anchor':
    case 'assertion':
      return [0, 0]
    case 'reference':
      return groups.get(node.index) ?? [0, Infinity]
    case 'group':
    case 'atomic':
      return nodeWidth(node.child, groups)
    case 'repeat': {
      if (node.max === 0) {
        return [0, 0]
      }
      const [min, max] = nodeWidth(node.child, groups)
      return [min * node.min, max === 0 ? 0 : max * node.max]
    }
    case 'conditional': {
      const yes = nodeWidth(node.yes, groups),
        no = nodeWidth(node.no, groups)
      return [Math.min(yes[0], no[0]), Math.max(yes[1], no[1])]
    }
    case 'sequence':
      return node.children.reduce<[number, number]>(
        (width, child) => {
          const next = nodeWidth(child, groups)
          return [width[0] + next[0], width[1] + next[1]]
        },
        [0, 0],
      )
    case 'alternative': {
      const widths = node.children.map((child) => nodeWidth(child, groups))
      return [
        Math.min(...widths.map((w) => w[0])),
        Math.max(...widths.map((w) => w[1])),
      ]
    }
  }
}

export function parsePattern(source: string, options: string): ParsedPattern {
  const chars = Array.from(source)
  let cursor = 0,
    groups = 0
  let flags: Flags = {
    ignoreCase: options.includes('i'),
    ascii: false,
    multiline: options.includes('m'),
    dotAll: options.includes('s'),
    verbose: false,
  }
  const names = new Map<string, number>(),
    widths = new Map<number, [number, number]>()
  const open = new Set<number>()
  const lookbehinds: number[] = []
  const conditionals = new Set<number>()
  const globalTypes = new Set<string>()
  const error = (message: string): never => {
    throw new SyntaxError(message)
  }
  const literal = (value: number): Node => ({ kind: 'literal', value, flags })
  const codePoint = (character: string): number =>
    character.codePointAt(0) ?? error('unexpected end of pattern')
  const take = (): string =>
    chars[cursor++] ?? error('unexpected end of pattern')
  const until = (end: string): string => {
    let result = ''
    while (chars[cursor] !== end) {
      result += take()
    }
    cursor++
    return result
  }
  function skip() {
    for (;;) {
      if (chars.slice(cursor, cursor + 3).join('') === '(?#') {
        cursor += 3
        for (;;) {
          const token = take()
          if (token === ')') {
            break
          }
          if (token === '\\') {
            take()
          }
        }
      } else if (
        flags.verbose &&
        chars[cursor] !== undefined &&
        /[\t\n\v\f\r ]/u.test(chars[cursor] ?? '')
      ) {
        cursor++
      } else if (flags.verbose && chars[cursor] === '#') {
        while (chars[cursor] !== undefined && chars[cursor] !== '\n') {
          if (take() === '\\' && chars[cursor] !== undefined) {
            cursor++
          }
        }
      } else {
        return
      }
    }
  }
  function reference(index: number): Node {
    if (index > groups || index === 0) {
      error(`invalid group reference ${String(index)}`)
    }
    if (open.has(index)) {
      error('cannot refer to an open group')
    }
    if (lookbehinds.some((first) => index >= first)) {
      error('cannot refer to group defined in the same lookbehind subpattern')
    }
    return { kind: 'reference', index, flags }
  }
  function escape(inClass: boolean): Node {
    const char = take()
    if (!inClass && 'AZbB'.includes(char)) {
      return { kind: 'anchor', value: char as 'A' | 'Z' | 'b' | 'B', flags }
    }
    if ('dDsSwW'.includes(char)) {
      return {
        kind: 'class',
        terms: [{ kind: 'category', value: char as Category }],
        negate: false,
        flags,
      }
    }
    if (escapeValues[char] !== undefined) {
      return literal(escapeValues[char])
    }
    if ('xuU'.includes(char)) {
      const length = char === 'x' ? 2 : char === 'u' ? 4 : 8
      let digits = ''
      for (let i = 0; i < length; i++) {
        const digit = take()
        if (!/[0-9a-fA-F]/u.test(digit)) {
          error(`incomplete escape \\${char}`)
        }
        digits += digit
      }
      const value = Number.parseInt(digits, 16)
      if (value > 0x10ffff) {
        error('bad Unicode escape')
      }
      return literal(value)
    }
    if (/[0-9]/u.test(char)) {
      let digits = char
      if (char === '0' || inClass) {
        if (!/[0-7]/u.test(char)) {
          error(`bad escape \\${char}`)
        }
        while (digits.length < 3 && /^[0-7]$/u.test(chars[cursor] ?? '')) {
          digits += take()
        }
      } else {
        if (/^[0-9]$/u.test(chars[cursor] ?? '')) {
          digits += take()
        }
        if (
          /^[0-7]{2}$/u.test(digits) &&
          /^[0-7]$/u.test(chars[cursor] ?? '')
        ) {
          digits += take()
        } else {
          return reference(Number(digits))
        }
      }
      const value = Number.parseInt(digits, 8)
      if (value > 255) {
        error('octal escape outside of range 0-0o377')
      }
      return literal(value)
    }
    if (/[a-zA-Z]/u.test(char)) {
      error(`bad escape \\${char}`)
    }
    return literal(codePoint(char))
  }
  function characterClass(): Node {
    const negate = chars[cursor] === '^'
    if (negate) {
      cursor++
    }
    const terms: ClassTerm[] = []
    function item(): ClassTerm {
      const char = take()
      const node = char === '\\' ? escape(true) : literal(codePoint(char))
      if (node.kind === 'literal') {
        return { kind: 'range', start: node.value, end: node.value }
      }
      if (node.kind === 'class') {
        return node.terms[0] ?? error('invalid character class')
      }
      return error('invalid character class')
    }
    while (chars[cursor] !== ']' || terms.length === 0) {
      const first = item()
      if (chars[cursor] === '-' && chars[cursor + 1] !== ']') {
        cursor++
        const last = item()
        if (
          first.kind !== 'range' ||
          last.kind !== 'range' ||
          last.start < first.start
        ) {
          return error('bad character range')
        }
        terms.push({ kind: 'range', start: first.start, end: last.start })
      } else {
        terms.push(first)
      }
    }
    cursor++
    return { kind: 'class', terms, negate, flags }
  }
  function group(allowGlobal: boolean): Node | undefined {
    let capture = true,
      name: string | undefined
    let assertion: { positive: boolean; behind: boolean } | undefined
    let atomic = false
    const outerFlags = flags
    if (chars[cursor] === '?') {
      cursor++
      const prefix = take()
      if (prefix === ':') {
        capture = false
      } else if (prefix === '>') {
        capture = false
        atomic = true
      } else if (prefix === '=' || prefix === '!') {
        capture = false
        assertion = { positive: prefix === '=', behind: false }
      } else if (prefix === '<' && ['=', '!'].includes(chars[cursor] ?? '')) {
        capture = false
        assertion = { positive: take() === '=', behind: true }
      } else if (prefix === 'P' && chars[cursor] === '<') {
        cursor++
        name = until('>')
      } else if (prefix === 'P' && chars[cursor] === '=') {
        cursor++
        const index = names.get(until(')'))
        if (index === undefined) {
          return error('unknown group name')
        }
        return reference(index)
      } else if (prefix === '(') {
        const condition = until(')')
        const index = /^[0-9]+$/u.test(condition)
          ? Number(condition)
          : names.get(condition)
        if (index === undefined || index === 0 || index >= 0x3fffffff) {
          return error('unknown group reference')
        }
        if (
          lookbehinds.length &&
          (open.has(index) || lookbehinds.some((first) => index >= first))
        ) {
          error(
            'cannot refer to group defined in the same lookbehind subpattern',
          )
        }
        conditionals.add(index)
        const child = alternative(false)
        if (take() !== ')') {
          error('missing )')
        }
        const branches = child.kind === 'alternative' ? child.children : [child]
        if (branches.length > 2) {
          error('conditional backref with more than two branches')
        }
        return {
          kind: 'conditional',
          index,
          yes: branches[0] ?? error('missing conditional branch'),
          no: branches[1] ?? { kind: 'sequence', children: [] },
        }
      } else if ('aiLmsux-'.includes(prefix)) {
        let spec = prefix
        while (chars[cursor] !== ')' && chars[cursor] !== ':') {
          spec += take()
        }
        const components = spec.split('-')
        const [enabled = '', disabled = ''] = components
        if (
          components.length > 2 ||
          (components.length === 2 && disabled === '') ||
          /[^aimsux]/u.test(enabled) ||
          /[^imsx]/u.test(disabled) ||
          Array.from(enabled).some((flag) => disabled.includes(flag)) ||
          (enabled.includes('a') && enabled.includes('u'))
        ) {
          error('bad inline flags')
        }
        const next = { ...flags }
        for (const [letter, key] of [
          ['i', 'ignoreCase'],
          ['m', 'multiline'],
          ['s', 'dotAll'],
          ['x', 'verbose'],
        ] as const) {
          if (enabled.includes(letter)) {
            next[key] = true
          }
          if (disabled.includes(letter)) {
            next[key] = false
          }
        }
        if (enabled.includes('a')) {
          next.ascii = true
        }
        if (enabled.includes('u')) {
          next.ascii = false
        }
        flags = next
        if (take() === ')') {
          if (disabled || !allowGlobal) {
            error('global flags not at the start of the expression')
          }
          if (enabled.includes('a')) {
            globalTypes.add('a')
          }
          if (enabled.includes('u')) {
            globalTypes.add('u')
          }
          if (globalTypes.size > 1) {
            throw new RangeError('ASCII and UNICODE flags are incompatible')
          }
          return undefined
        }
        capture = false
      } else {
        return error('unknown extension')
      }
    }
    const index = capture ? ++groups : 0
    if (name !== undefined) {
      if (!isIdentifier(name) || names.has(name)) {
        error('bad group name')
      }
      names.set(name, index)
    }
    if (capture) {
      open.add(index)
    }
    if (assertion?.behind) {
      lookbehinds.push(groups + 1)
    }
    const child = alternative(false)
    if (take() !== ')') {
      error('missing ), unterminated subpattern')
    }
    if (assertion?.behind) {
      lookbehinds.pop()
    }
    if (capture) {
      open.delete(index)
      widths.set(index, nodeWidth(child, widths))
    }
    flags = outerFlags
    if (assertion) {
      const [min, max] = nodeWidth(child, widths)
      if (assertion.behind && min > 0xffffffff) {
        error('looks too much behind')
      }
      if (assertion.behind && min !== max) {
        error('look-behind requires fixed-width pattern')
      }
      return { kind: 'assertion', child, ...assertion, width: min }
    }
    if (atomic) {
      return { kind: 'atomic', child }
    }
    return capture
      ? { kind: 'group', child, index }
      : { kind: 'sequence', children: [child] }
  }
  function repeatBounds(
    position: number,
  ): { min: number; max: number; length: number } | undefined {
    if (chars[position] !== '{') {
      return undefined
    }
    const match = /^\{([0-9]*)(?:,([0-9]*))?\}/u.exec(
      chars.slice(position).join(''),
    )
    if (!match || (match[1] === '' && match[2] === undefined)) {
      return undefined
    }
    const min = Number(match[1])
    return {
      min,
      max:
        match[2] === undefined
          ? min
          : match[2] === ''
            ? Infinity
            : Number(match[2]),
      length: match[0].length,
    }
  }
  function sequence(allowGlobal: boolean): Node {
    const children: Node[] = []
    for (;;) {
      skip()
      const char = chars[cursor]
      if (char === undefined || char === ')' || char === '|') {
        break
      }
      cursor++
      let node: Node
      if (char === '(') {
        const grouped = group(allowGlobal && children.length === 0)
        if (grouped === undefined) {
          continue
        }
        node = grouped
      } else if (char === '[') {
        node = characterClass()
      } else if (char === '\\') {
        node = escape(false)
      } else if (char === '.') {
        node = { kind: 'any', flags }
      } else if (char === '^' || char === '$') {
        node = { kind: 'anchor', value: char, flags }
      } else if ('*+?'.includes(char) || repeatBounds(cursor - 1)) {
        return error('nothing to repeat')
      } else {
        node = literal(codePoint(char))
      }
      skip()
      const next = chars[cursor]
      let min: number | undefined,
        max = 0
      if (next === '*' || next === '+' || next === '?') {
        cursor++
        min = next === '+' ? 1 : 0
        max = next === '?' ? 1 : Infinity
      } else if (next === '{') {
        const bounds = repeatBounds(cursor)
        if (bounds) {
          min = bounds.min
          max = bounds.max
          cursor += bounds.length
          if (min > max) {
            error('min repeat greater than max repeat')
          }
          if (min >= 0xffffffff || (max !== Infinity && max >= 0xffffffff)) {
            throw new RangeError('the repetition number is too large')
          }
        }
      }
      if (min !== undefined) {
        if (node.kind === 'anchor') {
          error('nothing to repeat')
        }
        const greedy = chars[cursor] !== '?',
          possessive = chars[cursor] === '+'
        if (!greedy || possessive) {
          cursor++
        }
        node = { kind: 'repeat', child: node, min, max, greedy, possessive }
        if (
          ['*', '+', '?'].includes(chars[cursor] ?? '') ||
          repeatBounds(cursor)
        ) {
          error('multiple repeat')
        }
      }
      children.push(node)
    }
    const first = children[0]
    return children.length === 1 && first !== undefined
      ? first
      : { kind: 'sequence', children }
  }
  function alternative(allowGlobal: boolean): Node {
    const children = [sequence(allowGlobal)]
    while (chars[cursor] === '|') {
      cursor++
      children.push(sequence(false))
    }
    const first = children[0]
    return children.length === 1 && first !== undefined
      ? first
      : { kind: 'alternative', children }
  }
  const root = alternative(true)
  if (cursor !== chars.length) {
    error('unbalanced parenthesis')
  }
  for (const index of conditionals) {
    if (index > groups) {
      error(`invalid group reference ${String(index)}`)
    }
  }
  return { root, groups, names, widths }
}
