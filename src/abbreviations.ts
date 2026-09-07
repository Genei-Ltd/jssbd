import data from './data.json'
import { applyRules, escapePattern, pattern, trimWhitespace } from './regex'
import { isUppercase, lowercase } from './unicode'

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

  function replacePeriod(
    line: string,
    abbreviation: string,
    character: string,
  ): string {
    const stripped = trimWhitespace(abbreviation)
    if (language === 'ar' || language === 'fa') {
      return line.replace(pattern(`(?<=${abbreviation})\\.`), '∯')
    }
    if (language === 'de') {
      return line.replace(pattern(`(?<=${abbreviation})\\.(?=\\s)`), '∯')
    }
    const lower = lowercase(stripped)
    if (config.prepositive.includes(lower)) {
      return ` ${line}`
        .replace(pattern(`(?<=\\s${stripped})\\.(?=(\\s|:\\d+))`), '∯')
        .slice(1)
    }
    if (isUppercase(character)) {
      return line
    }
    if (config.numberAbbreviations.includes(lower)) {
      return ` ${line}`
        .replace(pattern(`(?<=\\s${stripped})\\.(?=(\\s\\d|\\s+\\())`), '∯')
        .slice(1)
    }
    if (language === 'ru' || language === 'bg') {
      return line.replace(
        pattern(`(?<=\\s${stripped})\\.|(?<=^${stripped})\\.`),
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
          `(?<=\\s${escapePattern(stripped)})\\.(?=((\\.|:|-|\\?|,)|(\\s([a-z]|I\\s|I'm|I'll|\\d|\\())))`,
        ),
        '∯',
      )
      .slice(1)
  }

  function scan(line: string): string {
    const lower = lowercase(line)
    for (const abbreviation of config.abbreviations) {
      const stripped = trimWhitespace(abbreviation)
      if (!lower.includes(stripped)) {
        continue
      }
      const matches = Array.from(
        pattern(`(?:^|\\s|\\r|\\n)${stripped}`, 'gi').finditer(line),
        // pySBD's findall returns the single capture in Dutch/Italian entries.
        (match) => (match.length > 1 ? (match[1] ?? '') : match[0]),
      )
      if (matches.length === 0) {
        continue
      }
      // Keep pySBD's literal braces and match-index alignment.
      const characters = Array.from(
        pattern(`(?<=\\{${escapePattern(stripped)}\\} ).`).finditer(line),
        (match) => match[0],
      )
      for (const [index, match] of matches.entries()) {
        line = replacePeriod(line, match, characters[index] ?? '')
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
