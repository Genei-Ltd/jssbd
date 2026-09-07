# Python regex behavior

`regex-parser.ts` parses Python syntax, assigns capture numbers, tracks flags,
and validates references and lookbehind widths. It preserves the meaning of
patterns before choosing how to execute them.

`regex-matcher.ts` compiles a pattern to a JavaScript regex only when the
matching behavior agrees. Other patterns use the internal matcher, which
preserves Python capture retention, assertion backtracking, backreferences,
and repetition of expressions that can match empty text. Match iteration also
permits a nonempty match immediately after an empty match at the same position.

`regex.ts` provides Python replacement templates, splitting, and match
iteration. Its `Symbol.replace` adapter supports the JavaScript string-replace
calls in the segmentation pipeline. Computed cleaner replacements use `sub`,
so Python backslash rules apply without JavaScript dollar expansion.

`unicode.ts` supplies character classes and case mappings from the pinned
CPython 3.13 / Unicode 15.1 reference. Literal case equivalence and backreference
lowercase comparison are separate operations. The runtime never asks Node's
Unicode tables to classify input text. Pattern widths count code points;
returned match positions count UTF-16 units.

This is an internal compatibility layer for the patterns pySBD uses or builds
from text. It is not an exported general-purpose Python regex library. For
example, named Unicode escapes (`\N{name}`) cannot occur in pySBD's static
patterns or its abbreviation-derived patterns and are unsupported here.

The tests cover differences between the two regex engines. The differential
runner separately checks complete segmentation, including dictionary patterns
with capturing groups and text inserted into computed replacement templates.
See [verification commands](../scripts/README.md).
