import fs from 'fs';
import path from 'path';

export interface Rule {
  index: number;
  content: string;
  active: boolean;
  protected: boolean;
}

const DEFAULT_RULES = `# Devlens Rules
- Do not run git commit or git push under any circumstances. Only proceed after receiving an explicit user instruction, and clearly indicate before performing the commit.
`;

function isProtected(content: string): boolean {
  // Protect the default git commit guard rule
  const lower = content.toLowerCase();
  return lower.includes('git commit') && lower.includes('git push');
}

export function createRulesService(projectDir: string) {
  const devlensDir = path.join(projectDir, '.devlens');
  const rulesFile = path.join(devlensDir, 'rules.md');

  function ensureFile() {
    if (!fs.existsSync(devlensDir)) {
      fs.mkdirSync(devlensDir, { recursive: true });
    }
    if (!fs.existsSync(rulesFile)) {
      fs.writeFileSync(rulesFile, DEFAULT_RULES);
    }
  }

  function readLines(): string[] {
    ensureFile();
    return fs.readFileSync(rulesFile, 'utf-8').split('\n');
  }

  function writeLines(lines: string[]) {
    ensureFile();
    fs.writeFileSync(rulesFile, lines.join('\n'));
  }

  // Parse a line into a rule. Returns null if it's not a rule line (heading/blank).
  function parseLine(line: string, index: number): Rule | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('# ')) return null;

    let content = trimmed;
    let active = true;

    // Inactive rules: "#- text" or "# - text"
    if (trimmed.startsWith('#-') || trimmed.startsWith('# -')) {
      active = false;
      content = trimmed.replace(/^#\s*-\s*/, '').trim();
    } else if (trimmed.startsWith('-')) {
      content = trimmed.replace(/^-\s*/, '').trim();
    } else {
      return null;
    }

    return {
      index,
      content,
      active,
      protected: isProtected(content),
    };
  }

  return {
    ensureDefault() {
      ensureFile();
    },

    getRules(): Rule[] {
      const lines = readLines();
      const rules: Rule[] = [];
      lines.forEach((line, i) => {
        const r = parseLine(line, i);
        if (r) rules.push(r);
      });
      // Re-index to consecutive numbers for stable references
      return rules.map((r, i) => ({ ...r, index: i }));
    },

    addRule(content: string): Rule {
      const lines = readLines();
      // Append at end with a leading "- "
      if (lines[lines.length - 1] !== '') lines.push('');
      const newLine = `- ${content}`;
      lines.push(newLine);
      writeLines(lines);
      return {
        index: this.getRules().length - 1,
        content,
        active: true,
        protected: isProtected(content),
      };
    },

    removeRule(index: number): boolean {
      const lines = readLines();
      const ruleLineIndices: number[] = [];
      lines.forEach((line, i) => {
        if (parseLine(line, i)) ruleLineIndices.push(i);
      });

      if (index < 0 || index >= ruleLineIndices.length) return false;

      const lineIdx = ruleLineIndices[index];
      const rule = parseLine(lines[lineIdx], lineIdx);
      if (rule?.protected) return false;

      lines.splice(lineIdx, 1);
      writeLines(lines);
      return true;
    },

    toggleRule(index: number): Rule | null {
      const lines = readLines();
      const ruleLineIndices: number[] = [];
      lines.forEach((line, i) => {
        if (parseLine(line, i)) ruleLineIndices.push(i);
      });

      if (index < 0 || index >= ruleLineIndices.length) return null;

      const lineIdx = ruleLineIndices[index];
      const rule = parseLine(lines[lineIdx], lineIdx);
      if (!rule) return null;

      // Toggle: active → "#- text", inactive → "- text"
      if (rule.active) {
        lines[lineIdx] = `#- ${rule.content}`;
      } else {
        lines[lineIdx] = `- ${rule.content}`;
      }
      writeLines(lines);

      return { ...rule, active: !rule.active, index };
    },
  };
}

export type RulesService = ReturnType<typeof createRulesService>;
