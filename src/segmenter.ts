import { cleanText } from './cleaner'
import { isLanguageCode, supportedLanguages } from './languages'
import type { LanguageCode } from './languages'
import { processText } from './processor'
import { escapePattern, pattern } from './regex'

export type SentenceSpan = {
  sent: string
  /** UTF-16 offset into the original input. */
  start: number
  /** Exclusive UTF-16 offset into the original input. */
  end: number
}

export type SegmenterOptions<
  WithSpans extends boolean = boolean,
  WithClean extends boolean = boolean,
> = {
  language?: LanguageCode
  clean?: WithClean
  charSpan?: WithSpans
}

export class Segmenter<
  WithSpans extends boolean = false,
  WithClean extends boolean = false,
> {
  readonly language: LanguageCode
  readonly clean: boolean
  readonly charSpan: boolean

  constructor(
    ...args: false extends WithSpans
      ? [options?: SegmenterOptions<WithSpans, WithClean>]
      : [
          options: SegmenterOptions<WithSpans, WithClean> & {
            charSpan: WithSpans
          },
        ]
  ) {
    const options: SegmenterOptions<WithSpans, WithClean> = args[0] ?? {}
    const { language = 'en', clean = false, charSpan = false } = options
    if (!isLanguageCode(language)) {
      throw new RangeError(
        `Provide valid language ID i.e. ISO code. Available codes are: ${supportedLanguages.join(', ')}`,
      )
    }
    if (clean && charSpan) {
      throw new RangeError(
        'charSpan must be false if clean is true. Cleaning modifies the original text.',
      )
    }
    this.language = language
    this.clean = clean
    this.charSpan = charSpan
  }

  segment(
    text: string | null | undefined,
  ): WithSpans extends true
    ? SentenceSpan[]
    : WithClean extends false
      ? string[]
      : string[] | ''
  segment(text: string | null | undefined): SentenceSpan[] | string[] | '' {
    if (text === null || text === undefined || text === '') {
      return []
    }
    if (typeof text !== 'string') {
      throw new TypeError('Text must be a string, null, or undefined.')
    }
    const input = this.clean ? cleanText(text, this.language) : text
    if (this.clean && input === '') {
      return ''
    }
    const sentences = processText(input, this.language)
    if (this.clean) {
      return sentences
    }

    const spans: SentenceSpan[] = []
    let previousEnd = 0
    for (const sentence of sentences) {
      for (const match of pattern(`${escapePattern(sentence)}\\s*`).finditer(
        text,
      )) {
        const end = match.index + match[0].length
        if (end > previousEnd) {
          spans.push({ sent: match[0], start: match.index, end })
          previousEnd = end
          break
        }
      }
    }
    return this.charSpan ? spans : spans.map((span) => span.sent)
  }
}
