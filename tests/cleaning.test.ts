import { expect, it } from 'vitest'
import { Segmenter } from '../src/index'

it('retains the upstream empty string when cleaning removes nonempty input', () => {
  const segmenter = new Segmenter({ clean: true })
  expect(segmenter.segment('<b>')).toBe('')
  expect(segmenter.segment('')).toEqual([])
  expect(segmenter.segment(null)).toEqual([])
  expect(segmenter.segment(undefined)).toEqual([])
})
