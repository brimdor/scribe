import { describe, expect, it } from 'vitest';
import { buildSaveNotePrompt, inferNotePathFromContent, isLikelySavableNote, parseSaveNotePromptAction } from '../note-publish';

describe('note publish utilities', () => {
  it('infers a project note path from markdown frontmatter', () => {
    const content = [
      '---',
      'title: Scribe',
      'date: 2026-03-10',
      'tags: [project]',
      'schema: project-plan',
      '---',
      '',
      '# Scribe',
    ].join('\n');

    expect(inferNotePathFromContent(content)).toBe('Projects/scribe.md');
  });

  it('uses date-based filenames for daily journal notes', () => {
    const content = [
      '---',
      'title: Journal - 2026-03-10',
      'date: 2026-03-10',
      'tags: [journal, daily]',
      'schema: daily-journal',
      '---',
      '',
      '# Journal - 2026-03-10',
    ].join('\n');

    expect(inferNotePathFromContent(content)).toBe('Journal/2026-03-10.md');
  });

  it('builds a publish prompt that explicitly targets the save tool', () => {
    const content = '# Scribe\n\nCurrent project notes.';
    const prompt = buildSaveNotePrompt(content, { filePath: 'Projects/scribe.md' });

    expect(prompt).toContain('save_note_to_repository');
    expect(prompt).toContain('[SCRIBE_ACTION]');
    expect(prompt).toContain('Projects/scribe.md');
    expect(prompt).toContain('```markdown');
  });

  it('parses a structured save-note action from the prompt', () => {
    const content = '# Scribe\n\nCurrent project notes.';
    const prompt = buildSaveNotePrompt(content, { filePath: 'Projects/scribe.md', commitMessage: 'save note: Scribe' });

    expect(parseSaveNotePromptAction(prompt)).toEqual({
      path: 'Projects/scribe.md',
      commitMessage: 'save note: Scribe',
      content,
    });
  });

  it('detects assistant note drafts that can be published', () => {
    expect(isLikelySavableNote('# Title\n\nThis is a real note draft with enough content to publish.')).toBe(true);
    expect(isLikelySavableNote('Short reply')).toBe(false);
  });
});
