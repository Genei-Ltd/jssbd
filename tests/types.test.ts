import { expectTypeOf, it } from 'vitest'
import { Segmenter } from '../src/index'
import type { SentenceSpan } from '../src/index'

it('infers the result type from the span option', () => {
  // @ts-expect-error Explicit span output requires the runtime option.
  new Segmenter<true>()
  // @ts-expect-error An empty options object still returns sentence strings.
  new Segmenter<true>({})
  expectTypeOf(new Segmenter().segment('')).toEqualTypeOf<string[]>()
  expectTypeOf(new Segmenter({ clean: true }).segment('')).toEqualTypeOf<
    string[]
  >()
  expectTypeOf(new Segmenter({ charSpan: true }).segment('')).toEqualTypeOf<
    SentenceSpan[]
  >()
  expectTypeOf(new Segmenter({ charSpan: false }).segment('')).toEqualTypeOf<
    string[]
  >()
  const _segment = (charSpan: boolean) =>
    new Segmenter({ charSpan }).segment('')
  expectTypeOf<ReturnType<typeof _segment>>().toEqualTypeOf<
    SentenceSpan[] | string[]
  >()
})
