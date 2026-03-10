# Feature Specification: Scribe — AI Notetaking Web Application

**Feature Number**: 001
**Short Name**: ai-notetaking-app
**Status**: Draft
**Date**: 2026-03-10
**Branch**: 001-ai-notetaking-app

---

## 1. Overview

Scribe is an AI-powered notetaking web application that provides a conversational chat interface for creating, organizing, and managing notes. Notes are stored in a user's GitHub repository in Obsidian-compatible Markdown format. The application features schema-based note templates (meeting notes, daily journals, research, project plans, etc.), dark/light theming, and a responsive mobile-friendly design.

### 1.1 Actors

| Actor | Description |
|-------|-------------|
| User | A person who creates, edits, and organizes notes via the chat interface |
| AI Assistant | The conversational agent that helps users create and refine notes |
| GitHub API | External service for storing/retrieving notes as Markdown files |

### 1.2 Key Concepts

- **Note**: A Markdown document stored in GitHub, compatible with Obsidian
- **Schema**: A predefined template/structure for a specific note type (meeting, journal, research, etc.)
- **Thread**: A conversation session between the user and the AI assistant
- **Vault**: The user's GitHub repository that stores all notes (analogous to an Obsidian vault)

---

## 2. User Stories

### US1 — User Authentication & GitHub Connection (P1)
**As a** user, **I want to** sign in with my GitHub account **so that** my notes are stored in my own repository.

**Acceptance Scenarios:**
- **Given** the user is on the login page, **When** they click "Sign in with GitHub", **Then** they are redirected to GitHub OAuth and, upon authorization, returned to the app with a valid session.
- **Given** the user is authenticated, **When** they first access the app, **Then** they can select or create a GitHub repository to use as their vault.
- **Given** the user has a session, **When** the session expires, **Then** they are prompted to re-authenticate.

### US2 — Conversational Note Creation (P1)
**As a** user, **I want to** describe what I want to write in natural language **so that** the AI generates a structured note for me.

**Acceptance Scenarios:**
- **Given** the user is in a chat thread, **When** they type a prompt like "Create meeting notes for today's standup", **Then** the AI generates a note using the meeting-notes schema in Obsidian-compatible Markdown.
- **Given** the AI has generated a note, **When** the user asks to modify it ("add an action item for John"), **Then** the AI updates the note accordingly.
- **Given** the user is satisfied, **When** they say "save this note", **Then** the note is committed to their GitHub vault.

### US3 — Note Schemas & Templates (P1)
**As a** user, **I want to** choose from predefined note schemas **so that** my notes have consistent structure.

**Acceptance Scenarios:**
- **Given** the user is creating a note, **When** they select a schema (e.g., Meeting Notes, Daily Journal, Research, Project Plan), **Then** the AI uses that schema's structure.
- **Given** a schema is selected, **When** the AI generates the note, **Then** it includes Obsidian-compatible frontmatter (YAML), proper heading hierarchy, tags, and linked references.
- **Given** the user wants a custom schema, **When** they describe the structure, **Then** the AI creates a reusable schema.

### US4 — Sidebar Navigation & Thread History (P1)
**As a** user, **I want to** see my past conversations and notes in a sidebar **so that** I can quickly find and resume work.

**Acceptance Scenarios:**
- **Given** the user has previous threads, **When** they open the sidebar, **Then** they see a chronological list of threads with auto-generated titles.
- **Given** a thread in the sidebar, **When** the user right-clicks, **Then** they can rename, pin, or delete it.
- **Given** the sidebar is open, **When** the user clicks the collapse toggle, **Then** the sidebar hides and the main area expands.

### US5 — Dark Mode & Theming (P2)
**As a** user, **I want to** use the app in dark or light mode **so that** I can reduce eye strain.

**Acceptance Scenarios:**
- **Given** the user's OS is in dark mode, **When** they first load the app, **Then** the app displays in dark mode.
- **Given** the user is in any mode, **When** they toggle the theme, **Then** the interface smoothly transitions.

### US6 — Responsive Mobile Layout (P2)
**As a** user, **I want to** use Scribe on my phone **so that** I can take notes on the go.

**Acceptance Scenarios:**
- **Given** the user opens Scribe on a mobile device, **When** the page loads, **Then** the layout adapts with the sidebar hidden by default and a hamburger menu accessible.
- **Given** the user is on mobile, **When** they interact with the input console, **Then** the keyboard does not obscure the input area.

### US7 — Response Interaction Features (P2)
**As a** user, **I want to** interact with AI responses **so that** I can refine, share, or validate content.

**Acceptance Scenarios:**
- **Given** an AI response, **When** the user clicks the copy icon, **Then** the response text is copied to clipboard.
- **Given** an AI response, **When** the user clicks thumbs up/down, **Then** feedback is recorded.
- **Given** an AI response, **When** the user clicks "regenerate", **Then** an alternative draft is produced.

### US8 — GitHub Note Browsing & Management (P2)
**As a** user, **I want to** browse and manage my saved notes **so that** I can organize my vault.

**Acceptance Scenarios:**
- **Given** the user clicks "Browse Notes", **When** notes load, **Then** they see a file-tree view of their GitHub vault.
- **Given** a note in the browser, **When** the user clicks it, **Then** the note opens in a Markdown preview panel.
- **Given** a note, **When** the user chooses "Edit in Chat", **Then** the note is loaded into a new thread for AI-assisted editing.

### US9 — Multimodal Input (P3)
**As a** user, **I want to** attach images and documents to the chat **so that** the AI can reference them in notes.

**Acceptance Scenarios:**
- **Given** the user is in the input console, **When** they click the upload icon, **Then** they can select files from their device.
- **Given** an image is uploaded, **When** the AI processes it, **Then** it can describe the image or incorporate it into the note.

### US10 — Voice Input (P3)
**As a** user, **I want to** dictate notes via voice **so that** I can capture ideas hands-free.

**Acceptance Scenarios:**
- **Given** the user clicks the microphone icon, **When** they speak, **Then** their speech is transcribed and appears in the input field.

---

## 3. Functional Requirements

| ID | Requirement | User Story | Priority |
|----|-------------|------------|----------|
| FR-001 | GitHub OAuth 2.0 authentication flow | US1 | P1 |
| FR-002 | Repository selection/creation for note vault | US1 | P1 |
| FR-003 | Chat-based conversational interface for note creation | US2 | P1 |
| FR-004 | AI-powered note generation from natural language prompts | US2 | P1 |
| FR-005 | Obsidian-compatible Markdown output with YAML frontmatter | US2, US3 | P1 |
| FR-006 | Predefined note schemas (Meeting, Journal, Research, Project) | US3 | P1 |
| FR-007 | Custom schema creation and management | US3 | P1 |
| FR-008 | Commit notes to GitHub via API | US2 | P1 |
| FR-009 | Collapsible sidebar with thread history | US4 | P1 |
| FR-010 | Thread management (rename, pin, delete) | US4 | P1 |
| FR-011 | System-synced dark/light mode with manual toggle | US5 | P2 |
| FR-012 | Responsive layout for mobile, tablet, desktop | US6 | P2 |
| FR-013 | Response utility bar (copy, feedback, regenerate) | US7 | P2 |
| FR-014 | Note browsing via GitHub file tree | US8 | P2 |
| FR-015 | Markdown preview for saved notes | US8 | P2 |
| FR-016 | File upload for images and documents | US9 | P3 |
| FR-017 | Voice input via Web Speech API | US10 | P3 |

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-001 | Page load time | < 2 seconds on 4G connection |
| NFR-002 | AI response latency | Streaming response starts within 1 second |
| NFR-003 | Mobile viewport support | 320px minimum width |
| NFR-004 | Accessibility | WCAG 2.1 AA compliance |
| NFR-005 | Browser support | Chrome, Firefox, Safari, Edge (latest 2 versions) |
| NFR-006 | Obsidian compatibility | Notes must render correctly in Obsidian without modification |

---

## 5. Key Entities

| Entity | Attributes |
|--------|------------|
| User | id, githubUsername, avatarUrl, accessToken, selectedRepo |
| Thread | id, title, createdAt, updatedAt, isPinned, messages[] |
| Message | id, role (user/assistant), content, attachments[], timestamp |
| Note | path, content (Markdown), schema, frontmatter, commitSha |
| Schema | id, name, description, template (Markdown), fields[] |

---

## 6. Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Users can authenticate and connect GitHub | OAuth flow completes in < 10 seconds |
| Notes are created via conversation | AI generates structured notes from free-text prompts |
| Notes are Obsidian-compatible | Generated notes render correctly in Obsidian (frontmatter, links, tags) |
| Thread history persists | Past conversations accessible across sessions |
| Dark/light mode works | Theme syncs with OS and toggles without page reload |
| Mobile usability | All primary flows completable on 375px viewport |

---

## 7. Scope Boundaries

### In Scope
- GitHub OAuth + repository integration
- Chat-based AI note creation interface
- Note schema system with predefined and custom templates
- Obsidian-compatible Markdown generation
- Dark/light theming
- Responsive mobile design
- Thread history and management
- Note browsing and preview

### Out of Scope
- Real-time collaboration (multi-user editing)
- Offline-first / service worker caching
- Native mobile app (iOS/Android)
- End-to-end encryption
- Billing / subscription management
- AI model training or fine-tuning

---

## 8. Clarification Items (Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | AI Backend | **OpenAI API (GPT-4)** — use the OpenAI chat completions API with streaming for note generation |
| 2 | Architecture | **Client-side SPA** — IndexedDB for thread persistence, GitHub API for note storage. No backend server. |
| 3 | Suggestion Cards | **Static examples** — curated prompt suggestions for common note types. Dynamic suggestions deferred to future enhancement. |
