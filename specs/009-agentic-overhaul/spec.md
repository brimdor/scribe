# Feature Specification: Agentic AI Overhaul

**Feature Number**: 009
**Short Name**: agentic-overhaul
**Date**: 2026-03-11
**Status**: Draft

---

## 1. Overview

Transform Scribe from a chat-first note-taking application into an **Agentic AI-first platform**. Every interaction that triggers the AI agent must provide it with full platform awareness: an understanding of its purpose, complete knowledge of available capabilities, and clear guidance on what to accomplish. The agent becomes not only a note-taking assistant but the **platform manager** — responsible for maintaining, organizing, and proactively improving the user's workspace.

A user-configurable **heartbeat system** enables the agent to perform scheduled autonomous work at a designated interval. Each heartbeat execution follows a defined checklist with acceptance criteria.

All work must be validated by an exhaustive, repeatable, quantifiable end-to-end test suite covering platform behavior, agent integration, and agent interactions.

---

## 2. Actors

| Actor | Description |
|-------|-------------|
| **User** | The person using Scribe to take notes, manage their workspace, and configure the agent |
| **Agent** | The AI system that assists with note-taking and manages the platform autonomously |
| **Heartbeat Scheduler** | The system component that triggers agent work at user-designated intervals |

---

## 3. User Stories

### US1 (P1): Agent Platform Awareness

**As a** user,
**I want** every AI interaction to have full context about the Scribe platform, my workspace state, and the agent's capabilities,
**So that** the agent can provide grounded, accurate, and complete assistance without requiring me to re-explain what Scribe can do.

#### Acceptance Scenarios

**Scenario 1.1: Agent receives full platform context**
- **Given** a user sends a message to the agent
- **When** the agent processes the request
- **Then** the agent has access to: its purpose statement, complete tool inventory with descriptions, current workspace state (repo status, note counts, recent activity), and user preferences
- **And** the agent's response demonstrates awareness of available capabilities

**Scenario 1.2: Agent understands its purpose**
- **Given** the agent is invoked for any task
- **When** it begins processing
- **Then** it operates under a clear mission: "I am Scribe's AI assistant. I help users create, organize, and manage notes and their workspace. I can take notes of different kinds, manage the platform, search and navigate content, and maintain workspace health."

**Scenario 1.3: Agent adapts to workspace state**
- **Given** the user has a configured repository with existing notes
- **When** the agent is asked a question about workspace contents
- **Then** the agent can reference actual note counts, recent changes, tags, and repository structure without the user providing this information manually

### US2 (P1): Agent as Platform Manager

**As a** user,
**I want** the agent to be able to manage my entire Scribe platform beyond just note-taking,
**So that** I can delegate organizational tasks, maintenance, and workspace optimization to the agent.

#### Acceptance Scenarios

**Scenario 2.1: Agent performs platform management tasks**
- **Given** the user asks the agent to "organize my notes by topic"
- **When** the agent processes the request
- **Then** the agent uses its tools to list notes, read content, and propose or execute reorganization
- **And** each action taken is reported to the user

**Scenario 2.2: Agent provides workspace summaries**
- **Given** the user asks "what's the state of my workspace?"
- **When** the agent processes the request
- **Then** the agent returns: total notes count, notes by directory, recent changes, tag distribution, repository sync status, and any issues detected

**Scenario 2.3: Agent handles multi-step workflows**
- **Given** the user requests a complex task (e.g., "create a weekly summary from my daily journals")
- **When** the agent processes the request
- **Then** the agent reads multiple notes, synthesizes content, creates a new summary note, and publishes it — all without additional user intervention

### US3 (P1): Heartbeat System

**As a** user,
**I want** to configure a recurring heartbeat that triggers the agent to perform scheduled work,
**So that** my workspace stays organized and maintained without constant manual intervention.

#### Acceptance Scenarios

**Scenario 3.1: User configures heartbeat interval**
- **Given** the user opens the Settings panel
- **When** they navigate to the Heartbeat section
- **Then** they can enable/disable the heartbeat and set an interval (minimum 15 minutes, maximum 24 hours)
- **And** the setting persists across sessions

**Scenario 3.2: Heartbeat executes on schedule**
- **Given** the heartbeat is enabled with a 1-hour interval
- **When** 1 hour elapses since the last heartbeat
- **Then** the agent is triggered with the heartbeat checklist
- **And** the execution is logged with timestamp and results

**Scenario 3.3: Heartbeat checklist execution**
- **Given** a heartbeat is triggered
- **When** the agent runs the heartbeat checklist
- **Then** the agent completes all checklist items: sync repository, check for unresolved issues, verify workspace health, generate activity summary
- **And** each item has a Pass/Fail result
- **And** the overall heartbeat has an acceptance rating (0-5 scale, minimum 4 to pass)

**Scenario 3.4: Heartbeat results visible to user**
- **Given** a heartbeat has completed
- **When** the user opens the heartbeat history
- **Then** they see each heartbeat execution with: timestamp, checklist items with Pass/Fail status, overall rating, and any issues detected

**Scenario 3.5: Heartbeat runs only when app is open**
- **Given** the heartbeat is enabled
- **When** the user closes the browser tab
- **Then** no heartbeat executions occur
- **And** when the user returns, the heartbeat resumes from the current time (not retroactive)

### US4 (P2): Enhanced Settings Panel

**As a** user,
**I want** the Settings panel to provide comprehensive agent configuration options,
**So that** I can customize the agent's behavior, heartbeat settings, and platform preferences.

#### Acceptance Scenarios

**Scenario 4.1: Heartbeat configuration section**
- **Given** the user opens Settings
- **When** they view the Agent section
- **Then** they see: heartbeat toggle (on/off), interval selector, checklist configuration, and heartbeat history link

**Scenario 4.2: Agent behavior preferences**
- **Given** the user opens Settings
- **When** they view the Agent section
- **Then** they can configure: agent verbosity level (concise/detailed), auto-publish preference (ask/auto/never), and workspace summary frequency

**Scenario 4.3: Settings overlay UX**
- **Given** the user opens Settings
- **When** the settings panel appears
- **Then** it displays as an overlay that can be closed by tapping/clicking outside, pressing Escape, or using a close button
- **And** all controls are at least 44px touch targets
- **And** the panel is scrollable on small screens

### US5 (P2): UI/UX Improvements for Touch and Mouse

**As a** user,
**I want** all interactions to work seamlessly with both touchscreen and mouse input,
**So that** I can use Scribe on any device without friction.

#### Acceptance Scenarios

**Scenario 5.1: Touch-friendly controls**
- **Given** the user is on a touchscreen device
- **When** they interact with any button, link, or control
- **Then** each interactive element has a minimum 44x44px touch target
- **And** there is appropriate spacing between adjacent interactive elements (minimum 8px gap)

**Scenario 5.2: Overlay menus close easily**
- **Given** any overlay menu is open (settings, heartbeat history, etc.)
- **When** the user taps outside the overlay, swipes down, or presses Escape
- **Then** the overlay closes immediately
- **And** the animation is smooth (under 300ms)

**Scenario 5.3: Intuitive navigation**
- **Given** a new user opens Scribe for the first time
- **When** they see the interface
- **Then** they can identify: how to start a conversation, where settings are, how to access the sidebar
- **And** no user manual is required for basic operations

### US6 (P1): Exhaustive End-to-End Testing

**As a** developer,
**I want** a comprehensive, repeatable, quantifiable test suite covering the platform, agent integration, and agent interactions,
**So that** every release can be validated against clear Pass/Fail criteria.

#### Acceptance Scenarios

**Scenario 6.1: Platform tests**
- **Given** the test suite is run
- **When** platform tests execute
- **Then** they cover: authentication, storage, GitHub sync, settings persistence, thread management, and message handling
- **And** each test has a clear Pass/Fail result

**Scenario 6.2: Agent integration tests**
- **Given** the test suite is run
- **When** agent integration tests execute
- **Then** they verify: agent context injection includes platform awareness, tool registry is complete and functional, each tool executes correctly with valid inputs, tool error handling works for invalid inputs

**Scenario 6.3: Agent interaction tests**
- **Given** the test suite is run
- **When** agent interaction tests execute
- **Then** they verify: agent responds with platform-aware context, agent can execute multi-step workflows, heartbeat checklist completes all items, agent handles edge cases gracefully

**Scenario 6.4: Quantifiable results**
- **Given** the test suite completes
- **When** results are evaluated
- **Then** each test category has a 0-5 rating based on pass rate
- **And** the minimum acceptable rating is 4 (80% pass rate)
- **And** results are logged in a structured report

---

## 4. Functional Requirements

### Agent Platform Context

| ID | Requirement | Acceptance Criteria |
|----|-------------|-------------------|
| FR-001 | The agent system prompt must include a purpose statement, capability inventory, and behavioral guidelines | System prompt contains all three sections |
| FR-002 | Each agent invocation must receive current workspace state (note count, repo status, recent activity) | Workspace state is fetched and injected before each agent call |
| FR-003 | The agent must have access to user preferences (theme, verbosity, auto-publish setting) | Preferences are included in agent context |
| FR-004 | The agent context must be assembled consistently regardless of which provider (OAuth vs. manual) is used | Both providers receive identical context structure |

### Agent Platform Management

| ID | Requirement | Acceptance Criteria |
|----|-------------|-------------------|
| FR-005 | The agent must be able to provide workspace summaries on request | Summary includes note count, directory breakdown, tag distribution, sync status |
| FR-006 | The agent must be able to execute multi-step workflows without additional user input per step | Agent chains tool calls to complete complex tasks |
| FR-007 | All agent actions must be reported to the user | Each tool call result is visible in the conversation |

### Heartbeat System

| ID | Requirement | Acceptance Criteria |
|----|-------------|-------------------|
| FR-008 | The heartbeat interval must be configurable between 15 minutes and 24 hours | Interval selector enforces min/max bounds |
| FR-009 | The heartbeat can be enabled or disabled by the user | Toggle persists across sessions |
| FR-010 | Each heartbeat execution must run a defined checklist | Checklist contains: repository sync, issue check, workspace health, activity summary |
| FR-011 | Each checklist item must produce a Pass/Fail result | Results are stored and displayed |
| FR-012 | Each heartbeat must produce an overall rating on a 0-5 scale | Rating is calculated from checklist results |
| FR-013 | Minimum acceptable heartbeat rating is 4 | Ratings below 4 trigger a notification to the user |
| FR-014 | Heartbeat execution history must be viewable by the user | History shows timestamp, results, and rating for each execution |
| FR-015 | Heartbeat must only execute while the application is open in the browser | Uses client-side scheduling, not server-side cron |
| FR-016 | Heartbeat results must be stored persistently | Results survive page refresh within the session |

### Settings Panel

| ID | Requirement | Acceptance Criteria |
|----|-------------|-------------------|
| FR-017 | The Settings panel must include a dedicated Agent section | Section is visually grouped and labeled |
| FR-018 | Agent section must include heartbeat configuration controls | Toggle, interval selector, and history link present |
| FR-019 | Agent section must include behavior preferences | Verbosity level and auto-publish preference configurable |
| FR-020 | All settings must persist across sessions via the storage API | Settings survive logout/login |

### UI/UX

| ID | Requirement | Acceptance Criteria |
|----|-------------|-------------------|
| FR-021 | All interactive elements must have minimum 44x44px touch targets | No interactive element smaller than 44px in either dimension |
| FR-022 | All overlay menus must be dismissible by: outside tap/click, Escape key, close button | All three methods work |
| FR-023 | Adjacent interactive elements must have minimum 8px spacing | No elements closer than 8px |
| FR-024 | Overlay open/close animations must complete in under 300ms | Animation timing verified |
| FR-025 | The interface must be navigable without a user manual | Core actions (new chat, send message, open settings) are visually obvious |

### Testing

| ID | Requirement | Acceptance Criteria |
|----|-------------|-------------------|
| FR-026 | Test suite must cover platform functionality (auth, storage, sync, settings, threads, messages) | All areas have test coverage |
| FR-027 | Test suite must cover agent integration (context injection, tool registry, tool execution, error handling) | All areas have test coverage |
| FR-028 | Test suite must cover agent interactions (platform-aware responses, multi-step workflows, heartbeat) | All areas have test coverage |
| FR-029 | Each test category must produce a 0-5 rating | Rating formula: floor(pass_count / total_count * 5) |
| FR-030 | Minimum acceptable rating per category is 4 | Categories below 4 are flagged as failures |
| FR-031 | Test results must be logged in a structured, parseable report | Report includes timestamp, category, individual results, and ratings |

---

## 5. Key Entities

| Entity | Description |
|--------|-------------|
| **AgentContext** | Complete context object assembled for each agent invocation, containing purpose, tools, workspace state, and preferences |
| **HeartbeatConfig** | User settings for heartbeat: enabled, interval, checklist items |
| **HeartbeatExecution** | Record of a single heartbeat run: timestamp, checklist results, overall rating |
| **HeartbeatChecklistItem** | Individual checklist item with name, description, Pass/Fail result, and optional detail message |
| **AgentPreferences** | User preferences for agent behavior: verbosity, auto-publish, summary frequency |
| **TestReport** | Structured test execution report with categories, individual results, and ratings |

---

## 6. Success Criteria

| Criterion | Measure |
|-----------|---------|
| Agent context completeness | Every agent invocation receives purpose, tools, workspace state, and preferences — verified by test |
| Agent platform management | Agent can list notes, provide summaries, reorganize content, and execute multi-step workflows without user re-prompting |
| Heartbeat reliability | Heartbeat triggers within 10% of configured interval while app is open |
| Heartbeat quality | Each heartbeat produces a valid rating; average rating across 5 consecutive runs is >= 4.0 |
| Settings persistence | All new settings survive logout/login cycle |
| Touch compatibility | 100% of interactive elements meet 44px minimum and 8px spacing requirements |
| Overlay dismissibility | All overlay menus close via outside tap, Escape, and close button |
| Test coverage | All three test categories (platform, agent integration, agent interaction) achieve rating >= 4 |
| Test repeatability | Running the test suite 3 times in succession produces identical Pass/Fail results |

---

## 7. Out of Scope

- Server-side cron/scheduling (heartbeat is client-side only)
- Mobile native app
- Multi-user collaboration features
- AI model fine-tuning
- Voice input/output
- Third-party plugin system
- Changes to authentication mechanism (PAT-based login remains)
