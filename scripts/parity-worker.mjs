import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const modulePath = process.argv[2]
if (!modulePath) {
  throw new Error('Provide the compiled package entry point.')
}
const { Segmenter } = await import(pathToFileURL(resolve(modulePath)).href)
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of input) {
  const cases = JSON.parse(line)
  const results = cases.map(({ text, language, clean, charSpan }) => {
    try {
      return {
        value: new Segmenter({ language, clean, charSpan }).segment(text),
      }
    } catch (error) {
      return error instanceof Error
        ? { error: error.name, message: error.message }
        : { error: 'Error', message: String(error) }
    }
  })
  process.stdout.write(`${JSON.stringify(results)}\n`)
}
