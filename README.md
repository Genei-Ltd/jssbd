# @coloop-ai/jssbd

Split text into sentences in 23 languages. A TypeScript port of
[pySBD 0.3.4](https://github.com/nipunsadvilkar/pySBD/tree/v0.3.4), with no runtime
dependencies. Provides ESM, CommonJS, and TypeScript declarations. Requires Node.js 18 or later.

## Install

```sh
pnpm add @coloop-ai/jssbd
```

## Split text

```ts
import { Segmenter } from '@coloop-ai/jssbd'

const segmenter = new Segmenter({ language: 'en' })

segmenter.segment('My name is Jonas E. Smith. Please turn to p. 55.')
// ['My name is Jonas E. Smith. ', 'Please turn to p. 55.']
```

The language defaults to English. Abbreviations, numbers, lists, and quoted
punctuation follow pySBD's language-specific rules. With cleaning disabled,
sentences are taken from the original input and retain trailing whitespace.
Leading whitespace before the first sentence can be omitted, as in pySBD.

A segmenter can be reused for multiple inputs. Empty strings, `null`, and
`undefined` return an empty array. Other non-string inputs throw `TypeError`.

## Character spans

```ts
const segmenter = new Segmenter({ charSpan: true })
const text = '😀 Hi. Next.'
const spans = segmenter.segment(text)
// [
//   { sent: '😀 Hi. ', start: 0, end: 7 },
//   { sent: 'Next.', start: 7, end: 12 },
// ]

text.slice(spans[0]!.start, spans[0]!.end) // '😀 Hi. '
```

Offsets count **UTF-16 code units**, matching JavaScript's `slice()` and `length`.
`start` is inclusive; `end` is exclusive. Python's code-point offsets therefore
need conversion when comparing spans containing emoji or other supplementary
characters. The text is not Unicode-normalized. Combining marks and joined emoji
retain their original representation.

## Clean text

```ts
new Segmenter({ clean: true }).segment('<em>Hello.</em> Next sentence.')
// ['Hello.', 'Next sentence.']
```

Cleaning applies pySBD's language-specific text transformations, such as removing
HTML tags and repairing some line breaks. It changes the source text, so
`clean: true` and `charSpan: true` cannot be combined. That combination throws
`RangeError`.

PDF cleanup and the Python `doc_type` option are not supported.

## Options and types

| Option     | Default | Purpose                                                    |
| ---------- | ------- | ---------------------------------------------------------- |
| `language` | `'en'`  | Supported language code. Invalid codes throw `RangeError`. |
| `clean`    | `false` | Clean text before segmentation.                            |
| `charSpan` | `false` | Return `{ sent, start, end }` records instead of strings.  |

```ts
import { supportedLanguages } from '@coloop-ai/jssbd'
import type {
  LanguageCode,
  SegmenterOptions,
  SentenceSpan,
} from '@coloop-ai/jssbd'
```

Supported languages:

| Code | Language | Code | Language  |
| ---- | -------- | ---- | --------- |
| `am` | Amharic  | `ar` | Arabic    |
| `hy` | Armenian | `bg` | Bulgarian |
| `my` | Burmese  | `zh` | Chinese   |
| `da` | Danish   | `nl` | Dutch     |
| `en` | English  | `fr` | French    |
| `de` | German   | `el` | Greek     |
| `hi` | Hindi    | `it` | Italian   |
| `ja` | Japanese | `kk` | Kazakh    |
| `mr` | Marathi  | `fa` | Persian   |
| `pl` | Polish   | `ru` | Russian   |
| `sk` | Slovak   | `es` | Spanish   |
| `ur` | Urdu     |      |           |

## Compatibility

The test suite includes all 484 non-PDF cases authored in pySBD 0.3.4, including
three upstream expected failures. It also checks JavaScript Unicode behavior.
See the [test inventory](tests/README.md) for the original sources, exclusions,
and fixture regeneration commands.

The port retains upstream segmentation behavior, including known limitations;
it does not guarantee correct linguistic boundaries for every input. Cleaning
also retains Python's backslash replacement behavior, which can reject malformed
escape sequences in connected words.

## License

MIT. Includes the original pySBD copyright notice. See [LICENSE](LICENSE).
