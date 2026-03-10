export const research = {
  id: 'research',
  name: 'Research Notes',
  description: 'Research documentation with sources, findings, and open questions',
  icon: '🔬',
  isBuiltIn: true,
  frontmatterFields: [
    { key: 'title', type: 'string', required: true },
    { key: 'date', type: 'date', required: true },
    { key: 'topic', type: 'string', required: false },
    { key: 'tags', type: 'array', default: ['research'] },
    { key: 'schema', type: 'string', default: 'research' },
  ],
  template: `---
title: "{{title}}"
date: {{date}}
topic: "{{topic}}"
tags: [research]
schema: research
---

# {{title}}

## 🎯 Research Question


## 📖 Sources
1. 

## 🔍 Key Findings


## 💡 Insights


## ❓ Open Questions
- 

## 🔗 Related Notes

`,
};

export default research;
