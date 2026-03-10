export const projectPlan = {
  id: 'project-plan',
  name: 'Project Plan',
  description: 'Project planning with objectives, milestones, and task tracking',
  icon: '🗂️',
  isBuiltIn: true,
  frontmatterFields: [
    { key: 'title', type: 'string', required: true },
    { key: 'date', type: 'date', required: true },
    { key: 'project', type: 'string', required: false },
    { key: 'status', type: 'string', default: 'planning' },
    { key: 'tags', type: 'array', default: ['project'] },
    { key: 'schema', type: 'string', default: 'project-plan' },
  ],
  template: `---
title: "{{title}}"
date: {{date}}
project: "{{project}}"
status: planning
tags: [project]
schema: project-plan
---

# {{title}}

## 🎯 Objective


## 📊 Status
**Current Phase**: Planning

## 🏁 Milestones
- [ ] Milestone 1: 
- [ ] Milestone 2: 
- [ ] Milestone 3: 

## 📋 Tasks

### Phase 1
- [ ] 

### Phase 2
- [ ] 

## 📝 Notes


## ⚠️ Risks & Blockers
- 

## 🔗 Resources
- 
`,
};

export default projectPlan;
