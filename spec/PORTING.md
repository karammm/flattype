# Writing a Flat Notation implementation

This guide is for anyone writing Flat Notation for another language: Go, Rust, Java, C#, Swift, Ruby, PHP or anything else. The [specification](SPEC.md) says what to build. This page says how, and where the hard parts are. Most of it was learned writing the Python package, which now matches the JavaScript one on every case of the suite.

What you get:

- **[The specification](SPEC.md),** with an [ABNF grammar](grammar.abnf) for the syntax of a line.
- **[The conformance suite](../conformance/README.md):** about 5,600 checks generated from the JavaScript implementation, and a runner that tests your implementation from any language through a small adapter.
- **A grammar checker,** [`conformance/grammar.mjs`](../conformance/grammar.mjs), that tells you whether a document your encoder wrote is valid.
- **Two reference implementations** to read: [TypeScript](../packages/core/src) (about 800 lines for the format) and [Python](../python/src/flattype) (about 1,000, no dependencies). The Python one is the better model for most languages, because it had to spell out everything JavaScript does implicitly.

## 1. Plan the levels

The suite checks [six levels](SPEC.md#14-conformance) (plus one for unpaired surrogates, which most languages skip, section 4), and a port can stop after any of them:

1. **Decoder** (required). Strict decoding of values, with errors at the right line and column. Most of the work is here.
2. **Encoder.** The canonical text, byte for byte. Mostly string quoting and number formatting.
3. **Exact integers.** Usually free if your language has 64-bit or big integers.
4. **Lenient.** The repairs for text from language models. It is cheap if the decoder was built for it from the start (section 2.6).
5. **References.** Shared objects and cycles. Optional, and rare in practice.
6. **Messages.** The English error and warning texts, word for word. Free if you copy them from [appendix D](SPEC.md#appendix-d-messages) as you go.

Build in that order, and run the suite after each step with `--only`.

## 2. The decoder

The reference decoders are single-pass and line-based, with no regular expressions that can backtrack badly. This structure works in any language.

### 2.1 Lines

Keep the unfinished last line in a buffer. When a chunk arrives, search **only the new chunk** for LF, so a long line delivered in many small chunks stays linear. Then hand each complete line, without a trailing CR, to the line reader. At the end, the buffer is the last line (possibly empty).

In Python, appending to a string in a loop can be quadratic, so the buffer is a list of pieces, joined once per line.

### 2.2 The line reader

```text
read_line(text):
  if a table is open:          read text as a row (2.5); return
  skip SP and HTAB
  if nothing is left, or "#":  return
  (segments, terminal, end) ← parse_path(text, pos)
  if terminal is plain and "=" follows after SP: reference (2.7); return
  if text[end] ≠ ":":          error "Expected ':' after path" at end
  rest ← text after the colon
  plain   → assign(segments, token(trim(rest)))
  inline  → assign(segments, cells(rest, delimiter))
  table   → if trim(rest) ≠ "": problem "Table rows go on the following lines"
            open a table (assign at once if its count is 0)
```

### 2.3 Paths

`parse_path` reads segments until a code point that can't continue the path, and returns them with the **terminal** (plain, inline array with its delimiter, or table with its count, delimiter and fields) and the position where it stopped. Write it as one loop over code points, with the errors of [appendix D](SPEC.md#appendix-d-messages) at the positions given there. Quoted keys and field names: find the closing quote (skipping `\`-escaped characters), then hand the slice to your JSON parser.

An index is digits converted to a **double**, not an integer: messages print it as a number, so `[99999999999999999999999]` is reported as `[1e+23]`.

### 2.4 Assignment

Implement `assign` and `SLOT` exactly as [section 6.1](SPEC.md#61-assignment) writes them, **iteratively**: one line can hold a path with 100,000 segments. The root is the `root` slot of a holder object, which is why errors at the root say `'root'`.

Containers need one property beyond JSON: a reference placeholder (2.7) must be distinguishable from an object.

### 2.5 Cells and tables

`cells(text, delimiter)` follows [section 5.2](SPEC.md#52-cells) step by step. Get these details right:

- **What is skipped** before a cell is SP and HTAB (only SP for the HTAB delimiter), but the **trim** of an unquoted cell is the full whitespace set.
- **The value of a quoted cell** comes from your JSON parser. Check that the closing quote is followed only by SP and HTAB, then the delimiter or the end.
- **Recovery in lenient mode** differs between a value and a cell. A malformed quoted value is kept with its quotes. An unterminated quoted cell keeps the rest of the line, without its opening quote, as the last cell.

An open table holds its path, its count, the delimiter, the fields (each a list of keys), the rows read so far and the line of its header. Each row is an object built with the same `assign`, starting from an empty holder. When the last row arrives, assign the array at the table's path with the header's line number.

### 2.6 One code path for strict and lenient

Every repairable problem goes through one function:

```text
problem(reason, line, column, repair):
  if strict: raise DecodeError(reason, line, column)
  warn(reason + ": " + repair, line, column)
  (the caller then makes the repair)
```

Writing the decoder this way from the start makes the lenient level a few dozen lines.

For **skipping invalid lines**, run each line's assignments twice: once in a dry mode that raises every error but writes nothing (it creates containers but never attaches them), and then for real. If the dry run raises, drop the line. Hold the line's warnings until it has been read, so a dropped line reports only `the line is skipped`.

### 2.7 References

A reference assigns a placeholder object and records it. At the end of the document, resolve the placeholders in order, as [section 8.2](SPEC.md#82-meaning) describes. Two JavaScript habits are part of the rules:

- **An index segment on an object** reads the key with the same digits.
- **`length` on an array** is its length, a number. The target is then `isn't an object or array`, not `doesn't exist`.

## 3. The encoder

A recursive walk is natural ([section 12](SPEC.md#12-encoding)). The decisions are local:

- **Tables:** for an array that isn't all primitives, collect each item's leaf paths and values. Give up on the first item that is not an object, has an array or empty object inside, or has different leaf paths from the first item. Only then write the header and rows.
- **Separators:** join cells with `", "`, `" | "` or a tab, but join the header's fields with the bare delimiter (`{a,b}`, `{a|b}`).
- **Cycles:** keep the set of containers on the current path, and reject a cycle unless references are on.

### 3.1 Strings: don't use your JSON library's string writer

Most JSON libraries escape more than `JSON.stringify` does, and the canonical form needs exactly its escapes ([section 12.3](SPEC.md#123-strings)):

- **Python `json.dumps`** escapes all non-ASCII text by default (`ensure_ascii=True`).
- **Go `encoding/json`** escapes `<`, `>` and `&` unless told not to, and U+2028 and U+2029 always.
- **Other libraries** differ in the case of hex digits, in `\/`, and in which controls get a short escape. Check yours before relying on it.

A dozen lines of your own are safer: escape `"`, `\`, the seven named controls (`\b \f \n \r \t`), other U+0000–U+001F as `\u00xx` with lowercase hex, and unpaired surrogates as `\udxxx`. Leave everything else as it is.

### 3.2 Numbers: format doubles like JavaScript

This is the part most likely to be wrong in a new port. Doubles must be written as ECMAScript's `Number::toString` writes them ([appendix C](SPEC.md#appendix-c-number-formatting)): `1e+21` and not `1e21` or `1.0e21`, `1e-7` and not `1e-07`, `100` and not `100.0`. Get the shortest round-trip digits from your language, then lay them out by the rules. This is the Python version:

```python
def format_number(x: float) -> str:
    if x == 0:
        return "0"
    r = repr(abs(x))                     # shortest round-trip digits, e.g. "1.5e-07" or "123.0"
    mant, _, exp = r.partition("e")
    whole, _, frac = mant.partition(".")
    digits = whole + frac
    n = len(whole) + (int(exp) if exp else 0)   # x = 0.digits × 10^n
    stripped = digits.lstrip("0")
    n -= len(digits) - len(stripped)
    digits = stripped.rstrip("0")
    k = len(digits)
    if k <= n <= 21:
        out = digits + "0" * (n - k)
    elif 0 < n <= 21:
        out = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * -n + digits
    else:
        e = n - 1
        out = (digits if k == 1 else digits[0] + "." + digits[1:]) + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return "-" + out if x < 0 else out
```

Where to get the digits elsewhere:
- **Go:** `strconv.FormatFloat(x, 'e', -1, 64)`.
- **Rust:** `format!("{:e}", x)`.
- **Java:** none of the built-in formatters reliably give the shortest digits. Use a port of Ryu or Schubfach.
- **C#:** `x.ToString("R")` on .NET Core 3.0 and later.

Test the formatter on its own against a few million random doubles formatted by Node.js before you trust it.

Integers from an integer type are written as plain digits: an `int64` of `10000000000000000000000` doesn't exist, but a Go `*big.Int`, a Rust `i128` or a Python `int` of that size is written in full. A **double** of `1e21` is written `1e+21`.

## 4. Pitfalls

Each of these broke a test in the Python port at least once.

- **Whitespace isn't your language's whitespace.** The trim set is JavaScript's ([appendix B](SPEC.md#appendix-b-whitespace)), and almost no other language matches it:
  - Python's `str.strip()` also removes U+001C to U+001F and U+0085, and keeps U+FEFF.
  - Go's `strings.TrimSpace` removes U+0085 and keeps U+FEFF.
  - Java's `String.trim()` removes every code point up to U+0020, and nothing above it.

  Write the set out as a constant.
- **Integers must round-trip exactly.** A value like `9007199254740993` (2^53 + 1) or `18446744073709551615` must come back with every digit. In Python, an integer token over 4,300 digits must be read as a float, because `int()` refuses longer strings.
- **Floats with no fraction come back as integers.** `30.0` is written `30`, so decoding gives the integer 30. Compare values as JSON, where they are equal.
- **Columns count code points.** If your strings are UTF-8 bytes (Go, Rust), convert byte offsets to code point counts when you report a column. Do it only when reporting an error, never per character.
- **Keep key order.** Objects must keep insertion order, both when decoding and when your adapter reads an encode case. Go's `map` doesn't, so use an ordered map and decode JSON with `json.Decoder` token by token.
- **Unpaired surrogates** can't exist in Rust, Go or Swift strings, and JSON parsers there turn `"\ud800"` into U+FFFD or reject it. That's fine: the suite puts those 60 cases in a level of their own. Run it with `--skip surrogates`.
- **Prototype pollution** is a JavaScript problem, but its cousin exists everywhere: never turn a key into a field name, method or attribute. Keys go into maps, and `__proto__` is just a key.
- **Linear time.** The reference implementations test every decoder path on hostile inputs of growing size and require linear growth: long lines in tiny chunks, long digit runs, long paths, many skipped lines, and reference chains. Watch for repeated string concatenation, regular expressions with nested quantifiers, and re-scanning a line from the start after an error.

## 5. Testing

1. **Write the adapter.** It is a short program that reads JSON requests from stdin and answers on stdout ([protocol](../conformance/README.md#the-protocol)). Look at [`conformance/adapters/python.py`](../conformance/adapters/python.py): it is about 40 lines.
2. **Run the suite:** `node conformance/run.mjs -- <your adapter>`. It needs Node.js 21 or later and nothing else. Use `--only decoder` while you build, and `--show 20` to see more failures.
3. **Check your encoder's output** on your own random values with `node conformance/grammar.mjs out.flat`.
4. **Add round-trip property tests:** `decode(encode(x))` equals `x` for random JSON values with every option. This catches what a fixed suite can't.
5. **Test the stream:** decode every suite document in chunks of 1, 3 and 7 code points (or bytes), and compare with decoding it whole.

## 6. Before calling it 1.0

- [ ] The suite passes at the levels you claim, with no failures.
- [ ] `decode(encode(x)) == x` holds in a property test with thousands of random values.
- [ ] Decoding is linear on hostile inputs (section 4).
- [ ] References and lenient decoding, if you offer them, are off by default.
- [ ] Your README says which levels of Flat Notation 1.0 it passes, and links here.

Then [ask for it to be listed](IMPLEMENTATIONS.md#add-yours). Questions, and anything in the spec that was unclear to you, are welcome as [issues](https://github.com/karammm/flattype/issues): an unclear spec is a spec bug.
