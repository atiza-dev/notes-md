# Notes.md Local Docs

Local-first Markdown workspace inspired by the calm editing experience of Margin Editor.

## Included in the MVP

- Visual Tiptap editor with headings, formatting, lists, checklists, quotes, code blocks and tables.
- Slash menu for inserting common blocks.
- Markdown source mode with GFM-compatible import/export.
- Multiple documents, local search and autosave in IndexedDB.
- `.md` import, `.md` export and workspace JSON backup/restore.
- Local Settings with editor mode preference, storage information and reset.

The MVP intentionally has no images, comments, AI, MCP, sync or backend.

## Development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Deployment

The project is a static Vite application and can be deployed to Vercel by importing the repository. `vercel.json` keeps the build settings explicit. Documents remain in each visitor's browser; Vercel does not receive workspace contents.
