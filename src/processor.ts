import type { LanguageCode } from './languages'
import { type LanguageData, replaceAbbreviations } from './abbreviations'
import data from './data.json'
import { replaceListItems } from './lists'
import { replaceBetweenPunctuation, replacePunctuation } from './punctuation'
import { applyRules, escapePattern, pattern, trimWhitespace } from './regex'

export function processText(input: string, language: LanguageCode): string[] {
  const config: LanguageData = { ...data.common, ...data.languages[language] }
  let text = replaceListItems(input.replace(/\n/g, '\r'), language)
  text = replaceAbbreviations(text, language, config)
  text = applyRules(text, config.numberRules)
  if (language === 'de' || language === 'sk') {
    const months =
      language === 'de'
        ? [
            'Januar',
            'Februar',
            'März',
            'April',
            'Mai',
            'Juni',
            'Juli',
            'August',
            'September',
            'Oktober',
            'November',
            'Dezember',
          ]
        : [
            'Január',
            'Február',
            'Marec',
            'Apríl',
            'Máj',
            'Jún',
            'Júl',
            'August',
            'September',
            'Október',
            'November',
            'December',
            'Januára',
            'Februára',
            'Marca',
            'Apríla',
            'Mája',
            'Júna',
            'Júla',
            'Augusta',
            'Septembra',
            'Októbra',
            'Novembra',
            'Decembra',
          ]
    for (const month of months) {
      text = text.replace(pattern(`(?<=\\d)\\.(?=\\s*${month})`), '∯')
    }
    if (language === 'sk') {
      text = text.replace(pattern(String.raw`(?<=\d)\.(?=\s*[a-z]+)`), '∯')
      // pySBD passes re.IGNORECASE as the replacement count, so this is two
      // case-sensitive replacements rather than case-insensitive matching.
      let replacements = 0
      text = text.replace(
        pattern(String.raw`((\s+[VXI]+)|(^[VXI]+))\.(?=\s+)`),
        (match) => (replacements++ < 2 ? `${match.slice(0, -1)}∯` : match),
      )
    }
  }
  text = text.replace(
    pattern(data.regex.CONTINUOUS_PUNCTUATION_REGEX),
    (match) => match.replace(/!/g, '&ᓴ&').replace(/\?/g, '&ᓷ&'),
  )
  text = text.replace(pattern(data.regex.NUMBERED_REFERENCE_REGEX), '∯$2\r$7')
  text = applyRules(text, [
    ...data.rules.WithMultiplePeriodsAndEmailRule,
    ...data.rules.GeoLocationRule,
    ...data.rules.FileFormatRule,
  ])
  text = text.replace(
    pattern(data.regex.PARENS_BETWEEN_DOUBLE_QUOTES_REGEX),
    (match) =>
      match
        .replace(pattern(String.raw`\s(?=\()`), '\r')
        .replace(pattern(String.raw`(?<=\))\s`), '\r'),
  )

  const processed: string[] = []
  for (let line of text.split('\r').filter(Boolean)) {
    line = applyRules(line, [
      ...data.rules.SingleNewLineRule,
      ...data.rules.EllipsisRules,
    ])
    let sentences: string[]
    if (config.punctuation.some((punctuation) => line.includes(punctuation))) {
      if (!config.punctuation.includes(line.charAt(line.length - 1))) {
        line += 'ȸ'
      }
      line = line.replace(
        pattern(data.exclamationWords.map(escapePattern).join('|')),
        (match) => replacePunctuation(match),
      )
      line = replaceBetweenPunctuation(line, language)
      if (!/^(?:\?!|!\?|\?\?|!!)/u.test(line)) {
        line = applyRules(line, data.rules.DoublePunctuationRules)
      }
      line = applyRules(line, [
        ...data.rules.QuestionMarkInQuotationRule,
        ...data.rules.ExclamationPointRules,
      ])
      line = line.replace(
        pattern(data.listRegex.ROMAN_NUMERALS_IN_PARENTHESES),
        '&✂&$1&⌬&',
      )
      if (language === 'ar' || language === 'fa') {
        line = line
          .replace(pattern(String.raw`(?<=\d):(?=\d)`), '♭')
          .replace(pattern(String.raw`،(?=\s\S+،)`), '♬')
      }
      line = line.replace(/&ᓴ&$/u, '!')
      sentences = Array.from(
        line.matchAll(pattern(config.boundary)),
        (match) => match[0],
      )
    } else {
      sentences = [line]
    }
    for (let sentence of sentences) {
      sentence = applyRules(sentence, data.rules.SubSymbolsRules)
      if (sentence.length > 2 && /^[a-zA-Z]+$/u.test(sentence)) {
        processed.push(sentence)
        continue
      }
      sentence = applyRules(sentence, data.rules.ReinsertEllipsisRules)
      if (
        pattern(data.regex.QUOTATION_AT_END_OF_SENTENCE_REGEX, '').test(
          sentence,
        )
      ) {
        processed.push(
          ...sentence
            .split(
              pattern(
                data.regex.SPLIT_SPACE_QUOTATION_AT_END_OF_SENTENCE_REGEX,
              ),
            )
            .filter(Boolean),
        )
      } else {
        const trimmed = trimWhitespace(sentence.replace(/\n/g, ''))
        if (trimmed) {
          processed.push(trimmed)
        }
      }
    }
  }

  return processed.map((sentence) =>
    applyRules(sentence, data.rules.SubSingleQuoteRule),
  )
}
