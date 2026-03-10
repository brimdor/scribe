export const dailyJournal = {
  id: 'daily-journal',
  name: 'Daily Journal',
  description: 'Daily reflection with mood tracking, highlights, and tasks',
  icon: '📓',
  isBuiltIn: true,
  frontmatterFields: [
    { key: 'title', type: 'string', required: true },
    { key: 'date', type: 'date', required: true },
    { key: 'mood', type: 'string', required: false },
    { key: 'tags', type: 'array', default: ['journal', 'daily'] },
    { key: 'schema', type: 'string', default: 'daily-journal' },
  ],
  template: `---
title: "Journal — {{date}}"
date: {{date}}
mood: "{{mood}}"
tags: [journal, daily]
schema: daily-journal
---

# Journal — {{date}}

## 🌤️ Mood
{{mood}}

## ✨ Highlights
- 

## 🙏 Gratitude
1. 
2. 
3. 

## 📝 Reflections


## ✅ Today's Tasks
- [ ] 

## 🌙 Tomorrow's Focus
- 
`,
};

export default dailyJournal;
