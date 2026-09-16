# Tool reference

## Tools

| Tool                       | Behavior                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base64 / Base64URL         | UTF-8 or hex-byte input; strict UTF-8 or hex-byte decode output. Standard Base64 requires padding. URL-safe output is unpadded. Whitespace, mixed alphabets and nonzero padding bits are rejected.                                                                                    |
| URL encoding               | Encode/decode components, full URIs, or form components. Only form mode treats `+` as a space.                                                                                                                                                                                        |
| HTML entities              | Encode or decode named/numeric entities as text. Decode requires semicolons. Nothing is inserted as HTML.                                                                                                                                                                             |
| Text / hexadecimal         | Strict UTF-8 ↔ hexadecimal byte pairs. No implicit whitespace stripping or invalid-byte replacement.                                                                                                                                                                                 |
| JSON format / validate     | Format, minify or validate. Number lexemes stay exact, including values outside JavaScript's numeric range. Duplicate keys are rejected. Validation returns unchanged input.                                                                                                          |
| JSON string escaping       | Encode a text string as a quoted JSON literal or decode that literal. Separate from document formatting.                                                                                                                                                                              |
| JSON tree                  | Lazy expansion, 100 children per page, subtree selection/copy, and JSON Pointer paths. The root pointer is the empty string.                                                                                                                                                          |
| JSON comparison            | Added, removed and changed values. Object key order is ignored. Array order matters. Numerically equivalent forms such as `1`, `1.0` and `1e0` compare equally without floating-point conversion.                                                                                     |
| CSV / JSON                 | Quoting, escaped quotes, multiline fields and explicit delimiter support. CSV requires a header. Values remain strings, including leading zeros. JSON export requires flat objects with identical columns and rejects null. Empty strings are quoted to preserve final empty records. |
| JWT inspector              | JSON header/payload and unverified signature segment. Always labeled **Decoded only. Signature not verified.** Time claims are labeled UTC. JWE, detached/unencoded payloads and critical extensions are unsupported.                                                                 |
| Unix timestamp             | Explicit seconds or milliseconds; UTC and local output. Date input requires ISO 8601 with seconds and an explicit timezone. Millisecond precision; no guessed formats.                                                                                                                |
| URL / query inspector      | URL components and ordered repeated parameters. No fetch or navigation. WHATWG parsing normalizes URL display; query decoding uses form rules and may replace malformed percent bytes, as the result note explains. Original text is retained.                                        |
| UUID v4                    | One to 100 cryptographically random identifiers.                                                                                                                                                                                                                                      |
| Random strings / passwords | Configurable length and fixed character sets; cryptographic rejection sampling avoids modulo bias. No minimum count from each character category is implied.                                                                                                                          |
| SHA-256 / SHA-512          | Web Crypto hashes over explicitly selected UTF-8 text or hex bytes. No newline or Unicode normalization.                                                                                                                                                                              |
| Text utilities             | Sort, unique lines, trim lines, remove empty lines, upper/lowercase and statistics. Explicit comparison sensitivity and newline settings. Counts include UTF-8 bytes, UTF-16 units, code points and grapheme clusters.                                                                |
| Text diff                  | Bounded line comparison, visible line endings, and inline changed ranges for adjacent single-line replacements.                                                                                                                                                                       |
| Number bases               | Binary, octal, decimal and hexadecimal integers using BigInt. Signed values supported; fractions and prefixes rejected.                                                                                                                                                               |
| Color conversion           | Opaque sRGB `#RGB`, `#RRGGBB`, integer `rgb()` and comma-separated `hsl()`. Range validation and local swatch. HSL converts through 8-bit RGB; output rounding is disclosed.                                                                                                          |

CSV files opened in spreadsheets can execute formula-like cells. **Prefix spreadsheet formulas with apostrophe** is an explicit export option that changes data. It is off by default. Do not treat CSV as a typed JSON interchange format: CSV-to-JSON always produces strings.

Line transformations treat the final blank line as a line. Sorting, trimming or deduplication can change blank-line and final-newline placement. Mixed line endings require an explicit LF/CRLF choice. Unicode casing uses default mappings rather than a locale-specific rule and can change length.

## Recipes

Open **Recipe** to add, configure, reorder, disable or remove up to 12 steps. **Run recipe** executes the same functions as the standalone tools and exposes each successful intermediate result. A failure identifies its step and stops execution. A failed run has no final result.

The built-in **Load demo and example input** action uses this harmless input:

```text
eyJtZXNzYWdlIjoiSGVsbG8sIFRvb2xzbWl0aCEiLCJsb2NhbCI6dHJ1ZX0%3D
```

The real chain is URL component decode → standard Base64 decode → JSON format. It produces a JSON object with a greeting and a `local` flag.

Transformation types are `text`, `hex` byte representation, and `report`. Reports, generators and comparisons cannot be recipe steps. Hex output can only flow into an explicit hex decoder, a Base64 encoder configured for hex bytes, or a hash configured for hex bytes. Binary results are never implicitly treated as UTF-8.

**Save definition** stores the named recipe. Saving the same name replaces its definition. **Copy definition** exports JSON through an explicit clipboard write. **Import definition** validates pasted JSON. Definitions contain only schema version, name, tool identifiers, enumerated or bounded options, order and enabled flags. Unknown fields/operations, duplicate JSON keys, unsupported versions and excessive steps are rejected. They contain no inputs, outputs, tokens or intermediate results, and cannot execute scripts, commands or URLs. Do not put secrets in recipe names.

## Chat handoff

1. Highlight text in **Output text** and click **Select highlighted text for chat**, or explicitly select the entire output or a subtree/intermediate result.
2. Keep Toolsmith open, switch to the destination chat, and choose **Toolsmith: insert reviewed output** from that composer's attachment menu.
3. Review and edit the exact text in the preview. Click **Insert into draft**.

The preview uses the insertion callback from that invocation. It sends no message, starts no agent turn, adds no analysis instruction, and includes no original input or hidden intermediates. Session, owner, connection and profile state changes cancel the pending preview; closing it releases the callback. Closing Toolsmith clears the selection.

Inserted text becomes part of the chat draft and follows Hermes's normal storage and sending behavior. Local processing says nothing about data you deliberately copy or send later. If the SDK cannot guard a composer target, or the status-bar contribution is not mounted, use **Copy output** instead. No conversation is created or selected automatically.

## Privacy and storage

The plugin makes no runtime feature network requests. It contains no analytics, telemetry, remote assets, background clipboard reading or automatic updater. A remote gateway does not receive conversion input.

The only persistent key is plugin-scoped `preferences`: selected tool ID, favorite IDs, and validated recipe definitions. No payload history or tool options containing free-form input are saved. Switching to another page retains the active input, recipe and results in memory. Clear removes them; Close also returns to Capabilities. Closing Toolsmith or disabling/reloading the plugin releases its active references and invalidates pending work. JavaScript cannot guarantee secure memory erasure, and Toolsmith does not control clipboard history or synchronization.

Errors do not log payloads to the console or send them through notifications. Untrusted values are rendered as text. There is no `eval`, arbitrary script execution, unsafe HTML insertion, or private host-store access.

## Limits

| Work                          | Limit                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Each pasted input             | 262,144 UTF-16 code units; oversized values remain visible but execution is rejected |
| Imported text file            | 262,144 bytes; strict UTF-8                                                          |
| Each output / handoff preview | 1,048,576 UTF-16 code units                                                          |
| HTML entity encoding          | 32,768 input code units to bound expansion                                           |
| JSON                          | Depth 64; 25,000 values; bounded serialization                                       |
| JSON comparison               | 2,000 differences; 8,192 code units per pointer                                      |
| Tree                          | Children mounted only on expansion; 100 per page                                     |
| CSV                           | 10,000 records; 500 columns; global input/output limits also apply                   |
| Text diff                     | 64,000 code units per input; 1,000 lines per side; 250,000 dynamic-programming cells |
| Number-base input             | 16,384 characters                                                                    |
| UUID batch                    | 100                                                                                  |
| Random-string length          | 1–4,096                                                                              |
| Recipe                        | 12 steps; 20 saved definitions; import up to 32,768 code units                       |
| Suggestions                   | Debounced 300 ms; inputs above 32,768 code units are skipped                         |

Conversions run only on explicit actions. Detection is advisory; “Try” labels deliberately avoid claiming certainty. Pending asynchronous results are discarded after input/tool/option changes or closure. A recipe output must fit the next step's input limit. There is no worker or backend execution.
