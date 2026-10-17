# Benchmark: Microsoft Edge demo JSON (64 KB to 5 MB)

The [JSON dummy data](https://github.com/MicrosoftEdge/Demos/tree/main/json-dummy-data) files from Microsoft's Edge demos, converted with `@flattype/core`. Every file is a list of people with the same five fields, the most common shape of an API response. Every number below was measured by [`scripts/real-world.mjs`](../scripts/real-world.mjs) on the real files, and every conversion was decoded again and checked to equal the original.

## The 5 MB file

| | Size | vs. the file as served | vs. minified JSON |
| --- | ---: | ---: | ---: |
| JSON as served (pretty-printed) | **4.89 MB** | | |
| JSON, minified | 4.35 MB | −11% | |
| TOON | 3.67 MB | −25% | −16% |
| **Flat Notation** | **3.73 MB** | **−24%** | **−14%** |
| Flat Notation, tab-separated | 3.64 MB | −26% | −16% |

**4.89 MB becomes 3.73 MB**: 1,224,288 bytes fewer for the same 15,840 records, or 24% smaller than the file as served and 14% smaller than minified JSON. That is what a model reads when you paste the data into a prompt, and what a browser downloads without compression.

## All six files

| File | Records | JSON as served | JSON minified | TOON | **Flat Notation** | Saved vs. served | Saved vs. minified |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64KB.json | 197 | 62.3 KB | 55.4 KB | 46.7 KB | **47.5 KB** | **24%** | 14% |
| 128KB.json | 788 | 249.2 KB | 221.5 KB | 186.6 KB | **189.7 KB** | **24%** | 14% |
| 256KB.json | 792 | 250.6 KB | 222.7 KB | 187.7 KB | **190.8 KB** | **24%** | 14% |
| 512KB.json | 1,584 | 501.1 KB | 445.4 KB | 375.4 KB | **381.6 KB** | **24%** | 14% |
| 1MB.json | 3,168 | 1002.2 KB | 890.9 KB | 750.8 KB | **763.1 KB** | **24%** | 14% |
| 5MB.json | 15,840 | 4.89 MB | 4.35 MB | 3.67 MB | **3.73 MB** | **24%** | 14% |

The saving is the same at every size, because it comes from the shape: the five keys are written once in a table header instead of once per record. (The file named 128KB.json is really 249.2 KB, almost the same data as 256KB.json.)

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

## Why 24% and not 45%

Flat Notation saves the most where keys are a large part of the data. Here they aren't:
- **Long text dominates.** The `bio` field is 67% of every record, and no format can shrink the text itself. Only the keys, quotes and braces around it go away.
- **Commas inside the text need quotes.** Most bios contain a comma, so they are quoted in comma-separated rows. Tab-separated rows avoid that, and the tab-separated version comes out 1% smaller than TOON.
- **Shorter values save more.** On a typical API list with short values (ids, names, flags, a nested city), Flat Notation is about 45% smaller than minified JSON. See the [main benchmarks](https://karammm.github.io/flattype/docs/guide/benchmarks).

Also note that **the files repeat the same 197 records**: 5MB.json is those 197 people about 80 times over. That doesn't change the uncompressed sizes above, but it is why brotli shrinks every file to the same few kilobytes below.

## Over the wire, compressed

Gzip and brotli already remove most of JSON's repeated keys, so the difference almost disappears once a response is compressed. (Brotli also notices the repeated records, so every file compresses to about the same size.)

| File | JSON minified, gzip | Flat Notation, gzip | Saved | JSON minified, brotli | Flat Notation, brotli | Saved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 64KB.json | 9.1 KB | 8.9 KB | 1% | 7.9 KB | 7.8 KB | 1% |
| 128KB.json | 31.4 KB | 30.9 KB | 2% | 7.9 KB | 7.8 KB | 1% |
| 256KB.json | 31.4 KB | 30.9 KB | 2% | 7.9 KB | 7.8 KB | 1% |
| 512KB.json | 61.1 KB | 60.1 KB | 2% | 7.9 KB | 7.8 KB | 1% |
| 1MB.json | 120.4 KB | 118.5 KB | 2% | 7.9 KB | 7.8 KB | 1% |
| 5MB.json | 595.2 KB | 585.9 KB | 2% | 7.9 KB | 8.0 KB | 1% larger |

So the large savings are for text that isn't compressed, above all **LLM prompts**: models are billed by token, not by gzip size. On the wire, Flat Notation is a modest win on top of compression.

## Speed (5 MB file)

| | Time |
| --- | ---: |
| `JSON.parse` (native) | 4.3 ms |
| `decode` (Flat Notation) | 13.6 ms |
| `JSON.stringify` (native) | 4.4 ms |
| `encode` (Flat Notation) | 11.6 ms |

Measured on Node 24.15.0, Apple M4, best of 7 runs. `JSON.parse` and `JSON.stringify` are built into the engine. FlatType is plain JavaScript.

The [Python package](../python) writes the same 3.73 MB byte for byte (`pip install flattype`; the SHA-256 of both outputs matched when this page was written).

## Run it yourself

```bash
pnpm install && pnpm build
node scripts/real-world.mjs
```

Or paste any of the files into the [playground](https://karammm.github.io/flattype/).
