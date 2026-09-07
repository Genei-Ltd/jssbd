import rules from './clean-data.json'
import type { LanguageCode } from './languages'
import { applyRules, escapePattern, pattern } from './regex'

function replacementText(template: string, original: string): string {
  const escapes: Record<string, string> = {
    a: '\x07',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    '\\': '\\',
  }
  let result = ''
  for (let index = 0; index < template.length; index++) {
    const character = template.charAt(index)
    if (character !== '\\') {
      result += character
      continue
    }
    const next = template.charAt(++index)
    const escaped = escapes[next]
    if (escaped !== undefined) {
      result += escaped
      continue
    }
    const octal = /^(?:0[0-7]{0,2}|[1-7][0-7]{2})/u.exec(
      template.slice(index),
    )?.[0]
    if (octal !== undefined) {
      const value = Number.parseInt(octal, 8)
      if (value > 0xff) {
        throw new SyntaxError(
          'Octal replacement escape is outside the byte range.',
        )
      }
      result += String.fromCharCode(value)
      index += octal.length - 1
      continue
    }
    if (template.startsWith('g<0>', index)) {
      result += original
      index += 3
      continue
    }
    if (next === '' || /[a-zA-Z0-9]/u.test(next)) {
      throw new SyntaxError(`Invalid replacement escape: \\${next}`)
    }
    result += `\\${next}`
  }
  return result
}

export function cleanText(text: null, language?: LanguageCode): null
export function cleanText(text: string, language?: LanguageCode): string
export function cleanText(
  text: string | null,
  language: LanguageCode = 'en',
): string | null {
  if (text === null || text === '') {
    return text
  }
  if (language === 'ja') {
    return text.replace(pattern(String.raw`(?<=の)\n(?=\S)`), '')
  }
  let result = text.replace(pattern(String.raw`(?:[^\.])*`), (match) =>
    match.replace(pattern(rules.NEWLINE_IN_MIDDLE_OF_SENTENCE_REGEX), ''),
  )
  result = applyRules(result, [
    rules.NewLineInMiddleOfWordRule,
    rules.DoubleNewLineWithSpaceRule,
    rules.DoubleNewLineRule,
    rules.NewLineFollowedByPeriodRule,
    rules.ReplaceNewlineWithCarriageReturnRule,
    rules.EscapedNewLineRule,
    rules.EscapedCarriageReturnRule,
    rules.TypoEscapedNewLineRule,
    rules.TypoEscapedCarriageReturnRule,
    ...rules.html,
  ])
  result = result.replace(pattern(String.raw`\[(?:[^\]])*\]`), (match) =>
    match.replace(/\?/gu, '&ᓷ&'),
  )
  result = applyRules(result, [rules.InlineFormattingRule])
  result = applyRules(result.replace(/`/gu, "'"), [
    rules.QuotationsFirstRule,
    rules.QuotationsSecondRule,
    rules.TableOfContentsRule,
    rules.ConsecutivePeriodsRule,
    rules.ConsecutiveForwardSlashRule,
  ])
  for (const word of result.split(' ')) {
    for (const rule of [
      rules.NoSpaceBetweenSentencesRule,
      rules.NoSpaceBetweenSentencesDigitRule,
    ]) {
      if (
        pattern(rule.source, '').test(word) &&
        !rules.URL_EMAIL_KEYWORDS.some((keyword) => word.includes(keyword))
      ) {
        // Python also interprets backslashes in this computed replacement.
        const replacement = replacementText(applyRules(word, [rule]), word)
        result = result.replace(pattern(escapePattern(word)), () => replacement)
      }
    }
  }
  return applyRules(result, [
    rules.ConsecutivePeriodsRule,
    rules.ConsecutiveForwardSlashRule,
  ])
}
