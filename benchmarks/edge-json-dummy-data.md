# Benchmark: Microsoft Edge demo JSON (64 KB to 5 MB, pretty and minified)

The [JSON dummy data](https://github.com/MicrosoftEdge/Demos/tree/main/json-dummy-data) files from Microsoft's Edge demos, both the pretty-printed `.json` and the `-min.json` versions, converted with `@flattype/core`. Every file is a list of people with the same five fields, the most common shape of an API response. Every number below was measured by [`scripts/real-world.mjs`](../scripts/real-world.mjs) on the real files, and every conversion was decoded again and checked to equal the original.

## The 5 MB file

| | Size | vs. 5MB.json | vs. 5MB-min.json |
| --- | ---: | ---: | ---: |
| 5MB.json, as served (pretty-printed) | **4.89 MB** | | |
| 5MB-min.json, as served | **4.43 MB** | −10% | |
| JSON fully minified (`JSON.stringify`) | 4.35 MB | −11% | −2% |
| TOON | 3.67 MB | −25% | −17% |
| MessagePack (binary) | 4.14 MB | −15% | −6% |
| **Flat Notation** | **3.73 MB** | **−24%** | **−16%** |
| Flat Notation, tab-separated | 3.64 MB | −26% | −18% |

- **From the pretty file:** 4.89 MB becomes 3.73 MB, 1,224,288 bytes fewer (24%).
- **From the minified file:** 4.43 MB becomes 3.73 MB, 733,364 bytes fewer (16%). The site's minified files still have a space after every colon (`"name": "Adeel Solangi"`), so they're 2% bigger than JSON with no spaces at all. Even against that, Flat Notation is 14% smaller.

That's for the same 15,840 records: what a model reads when you paste the data into a prompt, and what a browser downloads without compression.

## All six files

| File | Records | .json (pretty) | -min.json | JSON, no spaces | TOON | **Flat Notation** | Saved vs. .json | Saved vs. -min.json |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64KB | 197 | 62.3 KB | 56.3 KB | 55.4 KB | 46.7 KB | **47.5 KB** | **24%** | **16%** |
| 128KB | 788 | 249.2 KB | 225.3 KB | 221.5 KB | 186.6 KB | **189.7 KB** | **24%** | **16%** |
| 256KB | 792 | 250.6 KB | 226.6 KB | 222.7 KB | 187.7 KB | **190.8 KB** | **24%** | **16%** |
| 512KB | 1,584 | 501.1 KB | 453.2 KB | 445.4 KB | 375.4 KB | **381.6 KB** | **24%** | **16%** |
| 1MB | 3,168 | 1002.2 KB | 906.4 KB | 890.9 KB | 750.8 KB | **763.1 KB** | **24%** | **16%** |
| 5MB | 15,840 | 4.89 MB | 4.43 MB | 4.35 MB | 3.67 MB | **3.73 MB** | **24%** | **16%** |

The saving is the same at every size, because it comes from the shape: the five keys are written once in a table header instead of once per record. (The files named 128KB are really 249.2 KB and 225.3 KB, almost the same data as the 256KB ones.)

## What it looks like

The first two records of 64KB.json:

```json
[
  {
    "name": "Adeel Solangi",
    "language": "Sindhi",
    "id": "V59OF92YF627HFY0",
    "bio": "Donec lobortis eleifend condimentum. Cras dictum dolor lacinia lectus vehicula rutrum. Maecenas quis nisi nunc. Nam tristique feugiat est vitae mollis. Maecenas quis nisi nunc.",
    "version": 6.1
  },
  {
    "name": "Afzal Ghaffar",
    "language": "Sindhi",
    "id": "ENTOCR13RSCLZ6KU",
    "bio": "Aliquam sollicitudin ante ligula, eget malesuada nibh efficitur et. Pellentesque massa sem, scelerisque sit amet odio id, cursus tempor urna. Etiam congue dignissim volutpat. Vestibulum pharetra libero et velit gravida euismod.",
    "version": 1.88
  }
]
```

```
[2]{name,language,id,bio,version}:
  Adeel Solangi, Sindhi, V59OF92YF627HFY0, Donec lobortis eleifend condimentum. Cras dictum dolor lacinia lectus vehicula rutrum. Maecenas quis nisi nunc. Nam tristique feugiat est vitae mollis. Maecenas quis nisi nunc., 6.1
  Afzal Ghaffar, Sindhi, ENTOCR13RSCLZ6KU, "Aliquam sollicitudin ante ligula, eget malesuada nibh efficitur et. Pellentesque massa sem, scelerisque sit amet odio id, cursus tempor urna. Etiam congue dignissim volutpat. Vestibulum pharetra libero et velit gravida euismod.", 1.88
```

The `bio` text contains commas, so it is quoted in comma-separated rows. With `encode(data, { delimiter: "\t" })` the quotes go away, which saves another 2%.

## Why about a quarter, not half

Flat Notation saves the most where keys are a large part of the data. Here they aren't:
- **Long text dominates.** The `bio` field is 67% of every record, and no format can shrink the text itself. Only the keys, quotes and braces around it go away.
- **Commas inside the text need quotes.** Most bios contain a comma, so they are quoted in comma-separated rows. Tab-separated rows avoid that, and the tab-separated version comes out 1% smaller than TOON.
- **Shorter values save more.** On a typical API list with short values (ids, names, flags, a nested city), Flat Notation is about 45% smaller than minified JSON. See the [main benchmarks](https://karammm.github.io/flattype/docs/guide/benchmarks).

Also note that **the files repeat the same 197 records**: 5MB.json is those 197 people about 80 times over. That doesn't change the uncompressed sizes above, but it is why brotli shrinks every file to the same few kilobytes below.

## Over the wire, compressed

Gzip and brotli already remove most of JSON's repeated keys, so the difference almost disappears once a response is compressed. (Brotli also notices the repeated records, so every file compresses to about the same size.)

| File | -min.json, gzip | MessagePack, gzip | Flat Notation, gzip | Saved | -min.json, brotli | Flat Notation, brotli | Saved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64KB | 9.1 KB | 10.0 KB | 8.9 KB | 2% | 7.8 KB | 7.8 KB | 1% |
| 128KB | 31.4 KB | 34.7 KB | 30.9 KB | 2% | 7.9 KB | 7.8 KB | 1% |
| 256KB | 31.5 KB | 34.7 KB | 30.9 KB | 2% | 7.9 KB | 7.8 KB | 1% |
| 512KB | 61.2 KB | 67.7 KB | 60.1 KB | 2% | 7.9 KB | 7.8 KB | 1% |
| 1MB | 120.8 KB | 133.6 KB | 118.5 KB | 2% | 7.9 KB | 7.8 KB | 1% |
| 5MB | 597.0 KB | 660.9 KB | 585.9 KB | 2% | 7.9 KB | 8.0 KB | 0% |

MessagePack is 5% smaller than minified JSON before compression, but 11% *larger* after gzip: its binary length prefixes compress worse than text, and like JSON it repeats every key in every record. Flat Notation writes the keys once, in the table header.

So the large savings are for text that isn't compressed, above all **LLM prompts**: models are billed by token, not by gzip size. On the wire, Flat Notation is a modest win on top of compression.

## Speed (5 MB file)

| | Time |
| --- | ---: |
| `JSON.parse` (native) | 4.2 ms |
| `decode` (Flat Notation) | 11.9 ms |
| MessagePack `decode` | 8.6 ms |
| `JSON.stringify` (native) | 4.3 ms |
| `encode` (Flat Notation) | 11.1 ms |
| MessagePack `encode` | 10.3 ms |

Measured on Node 24.0.0, Apple M4, best of 7 runs. `JSON.parse` and `JSON.stringify` are built into the engine. FlatType and MessagePack ([`@msgpack/msgpack`](https://www.npmjs.com/package/@msgpack/msgpack)) are plain JavaScript.

The [Python package](../python) writes the same 3.73 MB byte for byte (`pip install flattype`; the SHA-256 of both outputs matched when this page was written).

## A broken file: missing-colon.json

The demo site also has [missing-colon.json](https://microsoftedge.github.io/Demos/json-dummy-data/missing-colon.json): 64KB-min.json with one character removed, the colon in `"language" "Galician",…`, record 76 of 197.

| | What happens |
| --- | --- |
| `JSON.parse` | Throws `Expected ':' after property name in JSON at position 22260 (line 1 column 22261)`. **0 of 197 records** are read, because JSON is one nested value: one wrong character anywhere invalidates the whole document. |
| `flattype encode missing-colon.json` | Stops with the same message. FlatType reads JSON with `JSON.parse`, so it can't convert JSON that is already broken. |
| `fromModelOutput(text)` (`@flattype/ai`) | Throws `ModelOutputError`: *The data is JSON, but it is broken at line 1, column 22261: me": "Noa Ervello","language" ⟶ "Galician","id": "W9FR842CI16V*. The arrow marks the spot; `error.line` and `error.column` hold the position. (Before 1.12 it returned `{}` without an error.) |

The same one-character slip **inside Flat Notation**, a missing comma in that record's row:

```
  Noa Ervello, Galician, W9FR842CI16V8NU3, "Aliquam sollicitudin…    (original)
  Noa Ervello Galician, W9FR842CI16V8NU3, "Aliquam sollicitudin …     (comma missing)
```

| | What happens |
| --- | --- |
| `decode(text)` | Throws `Expected 5 values, got 4 (line 77, column 1)`, pointing at that record's line. |
| `decode(text, { strict: false, onWarning })` | Reads all 197 records. **196 are exactly right**; the damaged one has its fields shifted by one (`name` is `"Noa Ervello Galician"`, the last field is `null`), and `onWarning` says so: *line 77, column 1: Expected 5 values, got 4: the missing values are null*. |

Each record is one line, so a mistake stays in its line, and the warning tells you which record to check. `flattype decode --lenient` prints the same warnings:

```
$ flattype decode --lenient people.flat > people.json
warning: people.flat:77:1: Expected 5 values, got 4: the missing values are null
```

A missing colon on the **table header** itself no longer loses the rows either: lenient decoding reads all 197 records and warns *line 1, column 36: Expected ':' after the table header: read as a table anyway*.

## Run it yourself

```bash
pnpm install && pnpm build
node scripts/real-world.mjs
```

Or paste any of the files into the [playground](https://karammm.github.io/flattype/).
