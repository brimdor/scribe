/**
 * Markdown utility functions for Obsidian-compatible note generation
 */

/**
 * Parse YAML frontmatter from a markdown string
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, content };

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    
    // Handle arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    }
    frontmatter[key] = value;
  }

  return { data: frontmatter, content: match[2] };
}

/**
 * Generate YAML frontmatter string
 */
export function generateFrontmatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(v => `"${v}"`).join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

/**
 * Generate a valid filename from a title
 */
export function titleToFilename(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * Get the current date in YYYY-MM-DD format
 */
export function getDateString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Extract the title from markdown content (first H1 or frontmatter title)
 */
export function extractTitle(content) {
  const { data } = parseFrontmatter(content);
  if (data.title) return data.title;
  
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1];
  
  return 'Untitled';
}
