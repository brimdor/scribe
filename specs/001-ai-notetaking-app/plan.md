# Implementation Plan: Scribe AI Notetaking App

**Feature**: 001-ai-notetaking-app
**Date**: 2026-03-10
**Branch**: 001-ai-notetaking-app

---

## Technical Context

| Property | Value |
|----------|-------|
| Language | JavaScript (ES2022+) |
| Framework | React 18 + Vite |
| Styling | Vanilla CSS with CSS Custom Properties |
| Storage | IndexedDB (via idb wrapper) |
| AI Backend | OpenAI API (GPT-4 chat completions with streaming) |
| VCS Integration | GitHub REST API v3 (Octokit) |
| Auth | GitHub OAuth (via GitHub App or OAuth App) |
| Testing | Vitest + Playwright |
| Target | Modern browsers (Chrome, Firefox, Safari, Edge) |
| Deployment | Static site (Vercel, Netlify, or GitHub Pages) |

---

## Architecture: Client-Side SPA

```
┌─────────────────────────────────────┐
│          Browser (React SPA)         │
│  ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ Auth │ │ Chat │ │Notes │        │
│  │Module│ │Engine│ │Mgmt  │        │
│  └──┬───┘ └──┬───┘ └──┬───┘        │
│     │        │        │             │
│  ┌──▼────────▼────────▼───┐        │
│  │    Service Layer         │        │
│  │ • GitHubService          │        │
│  │ • OpenAIService          │        │
│  │ • StorageService (IDB)   │        │
│  └──────────────────────────┘        │
└─────────────────────────────────────┘
       │              │
       ▼              ▼
  GitHub API     OpenAI API
```

No backend server. The OpenAI API key is provided by the user and stored in sessionStorage.

---

## Project Structure

```
src/
├── main.jsx                  # App entry point
├── App.jsx                   # Root component + routing
├── index.css                 # Global styles + CSS variables + theming
├── components/
│   ├── Layout/
│   │   ├── Layout.jsx        # Three-zone layout wrapper
│   │   └── Layout.css
│   ├── Sidebar/
│   │   ├── Sidebar.jsx       # Thread list, navigation
│   │   └── Sidebar.css
│   ├── TopBar/
│   │   ├── TopBar.jsx        # Branding, settings, account
│   │   └── TopBar.css
│   ├── Chat/
│   │   ├── ChatWindow.jsx    # Message list + empty state
│   │   ├── ChatWindow.css
│   │   ├── MessageBubble.jsx # Single message (user or AI)
│   │   ├── MessageBubble.css
│   │   ├── InputConsole.jsx  # Text input + actions
│   │   ├── InputConsole.css
│   │   ├── ResponseBar.jsx   # Copy, feedback, regenerate
│   │   └── ResponseBar.css
│   ├── Notes/
│   │   ├── NoteBrowser.jsx   # GitHub file tree
│   │   ├── NoteBrowser.css
│   │   ├── NotePreview.jsx   # Markdown preview
│   │   └── NotePreview.css
│   ├── Schema/
│   │   ├── SchemaSelector.jsx
│   │   └── SchemaSelector.css
│   ├── Auth/
│   │   ├── LoginPage.jsx     # GitHub OAuth login
│   │   └── LoginPage.css
│   └── Common/
│       ├── ThemeToggle.jsx
│       ├── SuggestionCards.jsx
│       ├── SuggestionCards.css
│       └── Modal.jsx
├── services/
│   ├── github.js             # Octokit wrapper — repo CRUD, file read/write
│   ├── openai.js             # OpenAI chat completions with streaming
│   ├── storage.js            # IndexedDB wrapper (threads, messages, schemas)
│   └── auth.js               # GitHub OAuth flow
├── schemas/
│   ├── index.js              # Schema registry
│   ├── meeting-notes.js      # Meeting schema
│   ├── daily-journal.js      # Journal schema
│   ├── research.js           # Research schema
│   └── project-plan.js       # Project plan schema
├── hooks/
│   ├── useThread.js          # Thread CRUD operations
│   ├── useMessages.js        # Message handling + streaming
│   ├── useGitHub.js          # GitHub API operations
│   ├── useAuth.js            # Auth state management
│   └── useTheme.js           # Theme preference
├── context/
│   ├── AuthContext.jsx        # Auth provider
│   └── ThemeContext.jsx       # Theme provider
└── utils/
    ├── markdown.js            # Markdown helpers (frontmatter, Obsidian compat)
    └── constants.js           # App constants, Obsidian compat rules
tests/
├── unit/
├── integration/
├── e2e/
└── reports/
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| react, react-dom | UI framework |
| @octokit/rest | GitHub API client |
| openai | OpenAI API client |
| idb | IndexedDB promise wrapper |
| react-markdown | Markdown rendering |
| remark-gfm | GitHub Flavored Markdown support |
| remark-frontmatter | YAML frontmatter parsing |
| gray-matter | Frontmatter extraction |
| highlight.js | Code syntax highlighting |
| uuid | UUID generation |

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-First | ✅ | Spec written before implementation |
| II. Test-Driven | ✅ | Vitest + Playwright planned |
| III. Constitution Alignment | ✅ | This check |
| IV. Iterative Refinement | ✅ | Following SDD phases |
| V. Documentation as Code | ✅ | Spec, plan, tasks maintained |

---

## Verification Plan

### Automated Tests

**Unit Tests (Vitest)**:
```bash
npx vitest run
```
- Service layer functions (github.js, openai.js, storage.js)
- Schema template generation
- Markdown utility functions
- React hooks behavior

**Linting**:
```bash
npx eslint src/
```

### Browser Verification

After each user story implementation, verify via `browser_subagent`:
1. Start dev server: `npm run dev`
2. Navigate to `http://localhost:5173`
3. Visual check at desktop (1280px) and mobile (375px) viewports
4. Interaction smoke test (buttons, forms, navigation)

### Manual Verification
The user should verify:
1. GitHub OAuth sign-in flow works with their account
2. Notes appear correctly when opened in Obsidian
3. Dark/light theme matches OS preference
