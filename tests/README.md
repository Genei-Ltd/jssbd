# Upstream tests

`upstream.test.ts` ports all **484 non-PDF cases authored in pySBD 0.3.4**,
including its three marked expected failures. The fixture values come from the
upstream tests, not from executing the implementation to generate new answers.

Source: [pySBD v0.3.4 tests](https://github.com/nipunsadvilkar/pySBD/tree/5905f13be4fc95f407b98392e0ec303617a33d86/tests),
commit `5905f13be4fc95f407b98392e0ec303617a33d86`.

The upstream test sources and their fixtures are copyright 2019 Nipun Sadvilkar,
licensed under the MIT license. The upstream notice is retained in this
package's `LICENSE`. The tests also identify cases adapted upstream from
[Pragmatic Segmenter](https://github.com/diasks2/pragmatic_segmenter).

## Inventory

| Upstream group                         | Included cases |
| -------------------------------------- | -------------: |
| Amharic                                |              1 |
| Arabic                                 |              5 |
| Armenian                               |             26 |
| Bulgarian                              |              4 |
| Burmese                                |              1 |
| Chinese                                |              2 |
| Danish                                 |             48 |
| German                                 |             32 |
| Dutch                                  |              3 |
| English                                |            174 |
| French                                 |              5 |
| Greek                                  |              1 |
| Hindi                                  |              1 |
| Italian                                |             36 |
| Japanese                               |              5 |
| Kazakh                                 |             13 |
| Marathi                                |              5 |
| Persian                                |              1 |
| Polish                                 |              1 |
| Russian                                |             42 |
| Slovak                                 |              5 |
| Spanish                                |             35 |
| Urdu                                   |              1 |
| Issue regressions                      |             22 |
| Cleaner                                |              5 |
| Language selection and validation      |              3 |
| Segmenter input, spans, and validation |              7 |
| **Total**                              |        **484** |

There are 472 parametrized cases and 12 individual tests. The fixture metadata
records each source file, function, line, table, case count, and source checksum.
Every Vitest test name includes its upstream source and case ID.

Python overwrites two upstream function names before pytest collection. The
exporter walks the source AST to retain the hidden **three Russian golden cases**
and **25 Spanish additional cases**. Upstream pytest therefore collects 469
cases including PDF cases; its unmodified run passes 466 and expects three
failures. The 28 hidden cases also pass when run separately. Removing the 13 PDF
cases gives 481 passing cases and three expected failures in this port.

## Expected failures

These retain the upstream golden expectations and use Vitest `it.fails`. An
unexpected pass requires explicit review of the marker.

| Source table and zero-based index                            | Behavior                              |
| ------------------------------------------------------------ | ------------------------------------- |
| `lang/test_arabic.py`, `GOLDEN_AR_RULES_TEST_CASES[1]`       | Doctor abbreviation in Arabic text    |
| `lang/test_english.py`, `GOLDEN_EN_RULES_TEST_CASES[17]`     | `a.m. Mr.` sentence boundary          |
| `regression/test_issues.py`, `TEST_ISSUE_DATA_CHAR_SPANS[8]` | Issue #83, overlapping ellipsis spans |

## PDF exclusions

Only tests that configure `doc_type='pdf'` are excluded:

| Source function                                                                     | Excluded cases |
| ----------------------------------------------------------------------------------- | -------------: |
| `test_segmenter.py::test_en_pdf_type`                                               |              6 |
| `lang/test_deutsch.py::test_de_pdf_type`                                            |              3 |
| `lang/test_danish.py::test_da_pdf_type`                                             |              1 |
| `lang/test_spanish.py::test_es_pdf_type`                                            |              1 |
| `test_segmenter.py::test_exception_with_doc_type_pdf_and_clean_false`               |              1 |
| `test_segmenter.py::test_exception_with_doc_type_pdf_and_both_clean_char_span_true` |              1 |
| **Total**                                                                           |         **13** |

Ordinary cleaning tests remain included. Issue #27 contains the word “PDF” in its
input but uses ordinary segmentation, so it is retained.

## JavaScript equivalents

- Python `None` inputs become `null`.
- `TextSpan` instances become `{ sent, start, end }` records. The exporter converts
  Python code-point offsets to JavaScript UTF-16 offsets; ranges remain end-exclusive.
- The language class registry check verifies the supported codes and each
  `Segmenter` instance's selected language.
- Python `ValueError` becomes `RangeError`. The invalid-option message names
  JavaScript's `charSpan` option.
- Sentence assertions that call Python `str.strip()` use the same whitespace
  characters in the test helper, rather than JavaScript's different `trim()` set.
- The additional upstream assertions that reconstruct input from sentence strings
  or span text remain in place.
- The cleaner's internal tests remain internal tests; they add no public exports.

## Regenerate and verify fixtures

The exporter uses only the Python standard library. It reads literals and
`pytest.param` markers through the AST without importing pySBD or pytest. It
rejects a different commit or modified upstream test sources.

```sh
git clone --branch v0.3.4 --depth 1 https://github.com/nipunsadvilkar/pySBD.git .context/upstream
python3 -B scripts/export-upstream-tests.py
python3 -B scripts/export-upstream-tests.py --check
pnpm run test --run tests/upstream.test.ts
```

An existing checkout can be supplied as the first script argument. `--check`
compares fixture contents without writing. It ignores JSON layout differences.
