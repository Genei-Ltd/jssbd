import rules from './clean-data.json'
import type { LanguageCode } from './languages'
import { applyRules, escapePattern, pattern } from './regex'

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
        result = pattern(escapePattern(word)).sub(
          applyRules(word, [rule]),
          result,
        )
      }
    }
  }
  return applyRules(result, [
    rules.ConsecutivePeriodsRule,
    rules.ConsecutiveForwardSlashRule,
  ])
}
