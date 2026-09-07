# Compatibility checks

## Authored upstream fixtures

`export-upstream-tests.py` extracts the original non-PDF test expectations from
the pinned pySBD checkout. It uses Python's standard library and does not import
pySBD or pytest. See [the test inventory](../tests/README.md) for its commands.

## Differential comparison

`check-parity.py` compares the compiled JavaScript package with the actual Python
implementation. This includes the actual results of upstream's three expected
failures, rather than treating their golden expectations as implementation output.

Requirements:

- Python **3.13**, using Unicode database **15.1.0**.
- A pristine pySBD **0.3.4** checkout at commit
  `5905f13be4fc95f407b98392e0ec303617a33d86`.
- Node.js and a compiled package entry point. The runner does not rebuild files.

From the package root:

```sh
pnpm run build
python3.13 -B scripts/check-parity.py --seed 20260907 --shrink 20
```

By default, the oracle checkout is `.context/upstream`, and the compiled entry
point is `dist/index.mjs`. Set `--upstream` or `--module` to use another path.
The script verifies the Python and Unicode versions, upstream commit, and absence
of tracked source changes before running. It also compares all 184 language fields,
the shared rules used by each language, list expressions, Roman numeral and
exclamation-word tables, and ordinary cleaning data against the loaded Python
classes. A missing or changed field fails before corpus execution. Data hashes and
comparison counts are included in run metadata. The package itself has no Python
runtime dependency.

All 23 languages run in three modes: ordinary sentences, cleaned sentences, and
character spans. The default corpus contains:

- Original upstream sentence and span inputs, each exercised in every mode.
- Previously confirmed regression inputs.
- Every abbreviation with uppercase, lowercase, and numeric following text.
- Every dotted abbreviation with individual and combined wildcard substitutions,
  regex metacharacters, paired capture delimiters, and supplementary characters.
  A literal abbreviation elsewhere in each input exercises pySBD's initial
  substring check. Cases vary word order and spacing.
- Matching inputs for abbreviation expressions containing captures, classes,
  branches, or repeats. These are generated from Python's parsed expression,
  verified with its compiled regex, and paired with the literal abbreviation
  elsewhere in the input. This exercises the distinction between `findall`
  capture values and whole matches.
- Cross-products of punctuation, quotation marks, lists, spacing, and ordinary
  cleaning fragments. There are no PDF-specific inputs or options.
- Computed replacement templates in connected-word cleaning, including numeric
  and Unicode group references, octal limits, control escapes, invalid escapes,
  and trailing backslashes.
- Unicode text, including combining sequences, joined emoji, Unicode whitespace,
  isolated surrogates, case variants, and characters added after Unicode 15.1.
  Abbreviation guard positions are included.
- Generated multilingual inputs using the specified deterministic seed.
- Invalid language codes and incompatible cleaning/span options.

Values are compared exactly, including whitespace, overlapping spans, and the
empty string returned when cleaning removes a nonempty input. Python code-point
spans are converted to UTF-16 offsets before comparison. Exceptions compare
classes: Python `ValueError`, `IndexError`, and `OverflowError` map to `RangeError`;
`re.error` maps to `SyntaxError`; and `TypeError` maps to `TypeError`. Both original
messages are retained in reports; their wording is not required to match.

The runner exits with status 1 when any comparison differs. A successful corpus
run is evidence for those inputs, not proof of equivalence for every possible
string.

## Reports and reproduction

Generated inputs and reports stay under `.context/parity/`. Each run writes:

- `metadata.json`: exact module hash, runner hashes, interpreter versions, seed,
  selected groups/languages, source commit, and abbreviation grammar inventory.
- `cases.jsonl`: every input and its stable case ID.
- `mismatches.jsonl`: each differing input with both results.
- `minimized.json`: bounded minimization results, when `--shrink` is requested.
- `summary.json`: counts by group, error pairs, and elapsed time.

Use a fixed `--output` directory name for a named run. It must not already exist.
For source changes during an investigation, copy the compiled `dist` directory to
an isolated `.context` path and pass its entry point with `--module`.

Focused runs:

```sh
python3.13 -B scripts/check-parity.py --group captures --language de --language ru
python3.13 -B scripts/check-parity.py --group witnesses --witness-limit 32
python3.13 -B scripts/check-parity.py --group generated --seed 42 --generated 10000
```

The pinned abbreviation expressions use literals, wildcard dots, and seven
capturing-group patterns. Their parsed operators are recorded in metadata. The
witness generator also handles classes, alternatives, and bounded repetitions;
unknown operators fail explicitly. `--witness-limit` bounds generated strings
per expression, so it does not enumerate every possible matching string.

Replay mismatches against a new build:

```sh
pnpm run build
python3.13 -B scripts/check-parity.py --replay .context/parity/previous-run
```

`--replay` also accepts `cases.jsonl`, `mismatches.jsonl`, or `minimized.json`
directly. Minimize a saved report:

```sh
python3.13 -B scripts/check-parity.py \
  --replay .context/parity/previous-run/mismatches.jsonl \
  --shrink 20 --shrink-steps 200
```

Minimization deletes code-point ranges while preserving the language, options,
and direction of the mismatch: a value difference stays a value difference, and
exception differences retain their classes. It is bounded and reports whether
the step limit was reached. It does not claim to find a globally minimal input.
Distinct mismatch groups, languages, and modes receive separate samples.

Keep persistent Vitest regressions small and tied to confirmed bugs. Generated
bulk corpora belong in `.context`, rather than checked-in fixture files.

## Unicode tables

`export-unicode.py` derives character classes, identifiers, lowercase mappings,
and regex case equivalence from CPython 3.13 with Unicode 15.1.0. Its output is
compact JSON. Regenerate or verify it with the same Python interpreter:

```sh
python3.13 -B scripts/export-unicode.py
python3.13 -B scripts/export-unicode.py --check
```
