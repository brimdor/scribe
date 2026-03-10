export const meetingNotes = {
  id: 'meeting-notes',
  name: 'Meeting Notes',
  description: 'Structured template for meeting agendas, discussion points, and action items',
  icon: '📋',
  isBuiltIn: true,
  frontmatterFields: [
    { key: 'title', type: 'string', required: true },
    { key: 'date', type: 'date', required: true },
    { key: 'attendees', type: 'array', required: false },
    { key: 'tags', type: 'array', default: ['meeting'] },
    { key: 'schema', type: 'string', default: 'meeting-notes' },
  ],
  template: `---
title: "{{title}}"
date: {{date}}
attendees: [{{attendees}}]
tags: [meeting]
schema: meeting-notes
---

# {{title}}

## 📅 Meeting Details
- **Date**: {{date}}
- **Attendees**: {{attendees}}
- **Duration**: 

## 📋 Agenda
1. 

## 💬 Discussion Notes


## ✅ Action Items
- [ ] 

## 📌 Key Decisions


## 🔗 Follow-up
- Next meeting: 
`,
};

export default meetingNotes;
