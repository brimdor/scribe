import { meetingNotes } from './meeting-notes';
import { dailyJournal } from './daily-journal';
import { research } from './research';
import { projectPlan } from './project-plan';

export const builtInSchemas = [
  meetingNotes,
  dailyJournal,
  research,
  projectPlan,
];

export function getSchemaById(id) {
  return builtInSchemas.find(s => s.id === id) || null;
}

export function getSchemaTemplate(id) {
  const schema = getSchemaById(id);
  return schema ? schema.template : null;
}

export { meetingNotes, dailyJournal, research, projectPlan };
