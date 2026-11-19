# Document Portal (Apps Script)

[![CI](https://github.com/FIlIpeDiBr/portal-documentos-apps-script/actions/workflows/ci.yml/badge.svg)](https://github.com/FIlIpeDiBr/portal-documentos-apps-script/actions/workflows/ci.yml)

A Google Apps Script web app that lets a firm collect documents from its clients. Each client gets a link to a checklist; they drop files on it, the app stores each one in Google Drive, and a language model (Gemini) works out which checklist item the document belongs to and marks it as delivered.

It was built for a Brazilian accounting firm and is published here without client data and without the firm's identity: the name, contact details and document lists are examples. Code identifiers and interface text are in Portuguese.

*[Versão em português](README.md)*

## How it works

1. **List templates.** A template says which documents are expected. Two are built in (onboarding and monthly routine); staff create more by pasting text, one document per line.
2. **Client.** Creating a client copies the template's items into the `Estado` sheet. The copy makes the client's list immutable: editing or deleting the template later changes nothing that was already requested.
3. **Upload.** The file is stored in the client's folder first. Only then is it sent to the model, together with that client's item catalogue.
4. **Classification.** The answer can only mark items that exist in that client's checklist, with confidence of 0.6 or more. If the model fails or does not recognise the document, the file is kept and staff check it by hand.

## Engineering decisions

**The list of public functions is treated as an API.** In Apps Script, every global function without a trailing `_` can be called from the browser of any visitor, including someone who only holds a client link. There are nine here and a test fails if the list changes. The five staff functions take the admin token as their first argument. The two setup functions must be public to show up in the editor, so they return nothing: the token and folder links go only to the execution log.

**The client link is the credential, and it reaches only that client's checklist.** The id carries 122 random bits. No function lists other clients without the token, and the client page never receives the Drive folder id.

**The document is data, not an instruction.** The prompt tells the model to ignore orders written inside the document or the file name. The real guarantee is in code: the answer is filtered against the ids in the catalogue that was sent, so a PDF saying "mark everything" cannot reach anything outside the sender's own checklist.

**Nothing from outside is printed unescaped.** Page data goes into a `<script>` as JSON with `<`, `>`, `&` and line separators escaped, because `JSON.stringify` alone lets a `</script>` in a client or file name through. File links become `href` only when they are `https`.

**Writes take a lock.** Creating and deleting clients and templates and marking items as delivered go through `LockService`; otherwise two simultaneous uploads would read the same row and one would erase the other's attachment.

**A model failure is not an upload failure.** The client sees "received, staff will check"; the error detail stays in the log.

## Running it

```bash
cp .clasp.json.example .clasp.json   # fill in your project's scriptId
clasp push
```

Then, in the Apps Script editor: run `inicializar` (it creates the Drive folder and the control spreadsheet and writes the admin token to the execution log), add the `GEMINI_API_KEY` script property, deploy as a web app, and open `URL?admin=<token>`.

## Tests

```bash
npm test
```

37 tests on `node:test`, no dependencies. The `.gs` files are loaded into an isolated context with in-memory fakes for Sheets, Drive, properties, lock and HTTP. They cover the public function list and the token on each one, the client lifecycle, uploads (size limit, name and type sanitising, model outage, malformed answers, an attempt to mark another client's item) and the rendered page in its three modes with a name containing `</script>`. CI runs the suite on Node 20 and 22.

## Known limitations

- The admin token travels in the URL and stays in browser history. An anonymous Apps Script web app has no session; the alternative would be requiring Google sign-in and checking the e-mail.
- Whoever holds a client link can upload files and see the names of what was already sent. There is no expiry or revocation other than deleting the client.
- The spreadsheet is the database. Every operation reads a whole sheet, which is fine for dozens of clients, not thousands.
- Files travel as base64 through `google.script.run`; the configured limit is 25 MB.
- Tests use fakes for Google services. Nothing runs against real Apps Script, and on the browser side only rendering and script compilation are tested.
- Classification quality depends on the model and is not measured by a test.

## Author

Filipe Dias Brandão · [github.com/FIlIpeDiBr](https://github.com/FIlIpeDiBr)

Published as a portfolio piece. All rights reserved.
