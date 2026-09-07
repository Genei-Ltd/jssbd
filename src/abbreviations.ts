import data from './data.json'
import { applyRules, escapePattern, pattern, trimWhitespace } from './regex'

export type LanguageData = typeof data.common

export function replaceAbbreviations(
  input: string,
  language: string,
  config: LanguageData,
): string {
  let text = input
  if (language === 'kk') {
    text = text.replace(
      pattern(String.raw`(?<=^[А-ЯЁ])\.(?=\s)|(?<=\s[А-ЯЁ])\.(?=\s)`),
      '∯',
    )
    return text.replace(pattern(config.multiPeriod, 'gi'), (match) =>
      match.replace(/\./g, '∯'),
    )
  }
  text = applyRules(text, [
    ...data.rules.PossessiveAbbreviationRule,
    ...(language === 'de' ? [] : data.rules.KommanditgesellschaftRule),
    ...data.rules.SingleLetterAbbreviationRules,
  ])
  if (language === 'de') {
    text = text.replace(
      pattern(String.raw`(?<=\s[a-z])\.(?=\s)|(?<=^[a-z])\.(?=\s)`),
      '∯',
    )
  }

  function replacePeriod(line: string, abbreviation: string): string {
    const escaped = escapePattern(trimWhitespace(abbreviation))
    if (language === 'ar' || language === 'fa') {
      return line.replace(
        pattern(`(?<=${escapePattern(abbreviation)})\\.`),
        '∯',
      )
    }
    if (language === 'de') {
      return line.replace(
        pattern(`(?<=${escapePattern(abbreviation)})\\.(?=\\s)`),
        '∯',
      )
    }
    const lower = trimWhitespace(abbreviation).toLowerCase()
    if (config.prepositive.includes(lower)) {
      return ` ${line}`
        .replace(pattern(`(?<=\\s${escaped})\\.(?=(\\s|:\\d+))`), '∯')
        .slice(1)
    }
    if (config.numberAbbreviations.includes(lower)) {
      return ` ${line}`
        .replace(pattern(`(?<=\\s${escaped})\\.(?=(\\s\\d|\\s+\\())`), '∯')
        .slice(1)
    }
    if (language === 'ru' || language === 'bg') {
      return line.replace(
        pattern(`(?<=\\s${escaped})\\.|(?<=^${escaped})\\.`),
        '∯',
      )
    }
    if (language === 'sk') {
      return line
        .split(`${abbreviation}.`)
        .join(`${abbreviation.replace(/\./g, '∯')}∯`)
    }
    return ` ${line}`
      .replace(
        pattern(
          `(?<=\\s${escaped})\\.(?=((\\.|:|-|\\?|,)|(\\s([a-z]|I\\s|I'm|I'll|\\d|\\())))`,
        ),
        '∯',
      )
      .slice(1)
  }

  function scan(line: string): string {
    const lower = line.toLowerCase()
    for (const abbreviation of config.abbreviations) {
      const stripped = trimWhitespace(abbreviation)
      if (!lower.includes(stripped)) {
        continue
      }
      const matches = Array.from(
        line.matchAll(pattern(`(?:^|\\s|\\r|\\n)${stripped}`, 'gi')),
        (match) => match[0],
      )
      for (const match of matches) {
        line = replacePeriod(line, match)
      }
    }
    return line
  }

  text =
    language === 'de'
      ? scan(text)
      : text
          // Python splitlines includes the information separator controls.
          // eslint-disable-next-line no-control-regex
          .split(/(?<=[\n\r\v\f\x1c-\x1e\u0085\u2028\u2029])/u)
          .map(scan)
          .join('')
  text = text.replace(pattern(config.multiPeriod, 'gi'), (match) =>
    match.replace(/\./g, '∯'),
  )
  text = applyRules(text, data.rules.AmPmRules)
  const starters = config.sentenceStarters
    .map((starter) => `(?=\\s${starter}\\s)`)
    .join('|')
  const abbreviations =
    language === 'da'
      ? String.raw`(U∯S|U\.S|U∯K|E∯U|E\.U|U∯S∯A|U\.S\.A|I|i.v|s.u|s.U)`
      : String.raw`(U∯S|U\.S|U∯K|E∯U|E\.U|U∯S∯A|U\.S\.A|I|i.v|I.V)`
  return text.replace(pattern(`${abbreviations}∯(${starters})`), '$1.')
}
