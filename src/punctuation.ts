import { pattern } from './regex'

export function replacePunctuation(text: string, single = false): string {
  const replacements: Record<string, string> = {
    '.': '∯',
    '。': '&ᓰ&',
    '．': '&ᓱ&',
    '！': '&ᓳ&',
    '!': '&ᓴ&',
    '?': '&ᓷ&',
    '？': '&ᓸ&',
  }
  let result = text.replace(
    /[.。．！!?？]/gu,
    (character) => replacements[character] ?? character,
  )
  if (!single) {
    result = result.replace(/'/g, '&⎋&')
  }
  return result
}

export function replaceBetweenPunctuation(
  input: string,
  language: string,
): string {
  let text = input
  function replace(source: string, single = false) {
    text = text.replace(pattern(source), (match) =>
      replacePunctuation(match, single),
    )
  }
  // The lookahead and backreference preserve PySBD's escaped-quote matching
  // without backtracking through quote contents.
  if (language === 'zh') {
    replace(String.raw`《(?=(?P<tmp>[^》\\]+|\\{2}|\\.)*)(?P=tmp)》`)
    replace(String.raw`「(?=(?P<tmp>[^」\\]+|\\{2}|\\.)*)(?P=tmp)」`)
    return text
  }
  if (language === 'ja') {
    replace(String.raw`（(?=(?P<tmp>[^（）]+|\\{2}|\\.)*)(?P=tmp)）`)
    replace(String.raw`「(?=(?P<tmp>[^「」]+|\\{2}|\\.)*)(?P=tmp)」`)
    return text
  }
  if (!(
    pattern(String.raw`(?<=\s)'(?:[^']|'[a-zA-Z])*'\S`, '').test(text) &&
    !pattern(String.raw`'\s`, '').test(text)
  )) {
    replace(String.raw`(?<=\s)'(?:[^']|'[a-zA-Z])*'`, true)
  }
  replace(String.raw`(?<=\s)‘(?:[^’]|’[a-zA-Z])*’`)
  if (language === 'de') {
    if (text.includes('„')) {
      replace(String.raw`„(?=(?P<tmp>[^“\\]+|\\{2}|\\.)*)(?P=tmp)“`)
    } else if (text.includes(',,')) {
      replace(String.raw`,,(?=(?P<tmp>[^“\\]+|\\{2}|\\.)*)(?P=tmp)“`)
    }
  } else {
    replace(String.raw`"(?=(?P<tmp>[^"\\]+|\\{2}|\\.)*)(?P=tmp)"`)
  }
  replace(String.raw`\[(?=(?P<tmp>[^\]\\]+|\\{2}|\\.)*)(?P=tmp)\]`)
  replace(String.raw`\((?=(?P<tmp>[^()\\]+|\\{2}|\\.)*)(?P=tmp)\)`)
  replace(String.raw`«(?=(?P<tmp>[^»\\]+|\\{2}|\\.)*)(?P=tmp)»`)
  replace(String.raw`--[^-]*--`)
  replace(String.raw`“(?=(?P<tmp>[^”\\]+|\\{2}|\\.)*)(?P=tmp)”`)
  if (language === 'sk') {
    replace(String.raw`„(?=(?P<tmp>[^“\\]+|\\{2}|\\.)*)(?P=tmp)“`)
  }
  if (language === 'kk') {
    text = text
      .replace(pattern(String.raw`\?(?=\s*[-—]\s*)`), '&ᓷ&')
      .replace(pattern(String.raw`!(?=\s*[-—]\s*)`), '&ᓴ&')
  }
  return text
}
