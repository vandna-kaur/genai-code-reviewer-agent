import { GoogleGenAI, Type } from "@google/genai";
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// ─── FILE TOOLS ────────────────────────────────────────────────────────────────

async function listFiles({ directory }) {
  const files = [];
  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css'];

  function scan(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      if (
        fullPath.includes('node_modules') ||
        fullPath.includes('dist') ||
        fullPath.includes('build')
      ) continue;

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) files.push(fullPath);
      }
    }
  }

  scan(directory);
  return { files };
}

async function readFile({ file_path }) {
  const content = fs.readFileSync(file_path, 'utf-8');
  return { content };
}

async function writeFile({ file_path, content }) {
  fs.writeFileSync(file_path, content, 'utf-8');
  return { success: true };
}

const tools = {
  list_files: listFiles,
  read_file: readFile,
  write_file: writeFile,
};

// ─── TOOL DECLARATIONS ─────────────────────────────────────────────────────────

const listFilesTool = {
  name: 'list_files',
  description: 'List all JS/TS/HTML/CSS files in a directory',
  parameters: {
    type: Type.OBJECT,
    properties: {
      directory: { type: Type.STRING, description: 'Directory path to scan' },
    },
    required: ['directory'],
  },
};

const readFileTool = {
  name: 'read_file',
  description: 'Read the content of a file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      file_path: { type: Type.STRING, description: 'Path to the file' },
    },
    required: ['file_path'],
  },
};

const writeFileTool = {
  name: 'write_file',
  description: 'Write fixed/corrected content back to a file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      file_path: { type: Type.STRING, description: 'Path to the file' },
      content: { type: Type.STRING, description: 'The corrected content' },
    },
    required: ['file_path', 'content'],
  },
};

// ─── AGENT ─────────────────────────────────────────────────────────────────────

/**
 * runAgent — runs the Gemini code review agent.
 *
 * @param {string} directoryPath   - path to scan
 * @param {function} emit          - optional callback(type, text) for streaming to UI
 *                                   types: 'info' | 'accent' | 'amber' | 'error' | 'muted'
 */
export async function runAgent(directoryPath, emit = null) {
  const log = (text, cls = '') => {
    process.stdout.write(`[${cls || 'log'}] ${text}\n`);
    if (emit) emit(cls || 'muted', text);
  };

  const history = [
    {
      role: 'user',
      parts: [{ text: `Review and fix all the JS/HTML/CSS/TS code in: ${directoryPath}` }],
    },
  ];

  log(`Starting review of: ${directoryPath}`, 'info');

  while (true) {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: history,
      config: {
        systemInstruction: `You are an expert JavaScript code reviewer and fixer.

**Your Job:**
1. Use list_files to get all HTML, CSS, JavaScript, and TypeScript files in the directory
2. Use read_file to read each file's content
3. Analyze for:

  **HTML Issues:**
  - Missing doctype, meta tags, semantic HTML
  - Broken links, missing alt attributes
  - Accessibility issues (ARIA, roles)
  - Inline styles that should be in CSS

  **CSS Issues:**
  - Syntax errors, invalid properties
  - Browser compatibility issues
  - Inefficient selectors
  - Missing vendor prefixes
  - Unused or duplicate styles

  **JavaScript Issues:**
  - BUGS: null/undefined errors, missing returns, type issues, async problems
  - SECURITY: hardcoded secrets, eval(), XSS risks, injection vulnerabilities
  - CODE QUALITY: console.logs, unused code, bad naming, complex logic

4. Use write_file to FIX the issues you found (write corrected code back)
5. After fixing all files, respond with a summary report in this EXACT JSON format:

{
  "filesAnalyzed": <number>,
  "filesFixed": <number>,
  "security": [{ "file": "filename:line", "desc": "what was fixed" }],
  "bugs": [{ "file": "filename:line", "desc": "what was fixed" }],
  "quality": [{ "file": "filename:line", "desc": "what was fixed" }]
}

Respond ONLY with the JSON object, no other text.`,
        tools: [{
          functionDeclarations: [listFilesTool, readFileTool, writeFileTool],
        }],
      },
    });

    if (result.functionCalls && result.functionCalls.length > 0) {
      for (const functionCall of result.functionCalls) {
        const { name, args } = functionCall;

        if (!tools[name]) throw new Error(`Unknown tool: ${name}`);

        // Log meaningful messages for each tool call
        if (name === 'list_files') {
          log(`Scanning directory: ${args.directory}`, 'accent');
        } else if (name === 'read_file') {
          log(`Reading: ${path.basename(args.file_path)}`, 'accent');
        } else if (name === 'write_file') {
          log(`Fixed and saved: ${path.basename(args.file_path)}`, 'accent');
        }

        const toolResponse = await tools[name](args);

        // Log results
        if (name === 'list_files') {
          const count = toolResponse.files.length;
          log(`Found ${count} file${count !== 1 ? 's' : ''} to review`, '');
          toolResponse.files.forEach(f => log(`  ${f}`, 'muted'));
        }

        history.push({
          role: 'model',
          parts: [{ functionCall }],
        });
        history.push({
          role: 'user',
          parts: [{ functionResponse: { name, response: { result: toolResponse } } }],
        });
      }
    } else {
      // Final text response — should be our JSON report
      const rawText = result.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        .map(p => p.text)
        .join('') ?? '';

      log('Review complete. Generating report…', 'info');

      try {
        const clean = rawText.replace(/```json|```/g, '').trim();
        const report = JSON.parse(clean);
        return report;
      } catch {
        // If model didn't return JSON, return a basic structure
        return {
          filesAnalyzed: 0,
          filesFixed: 0,
          security: [],
          bugs: [],
          quality: [],
          raw: rawText,
        };
      }
    }
  }
}

// ─── CLI ENTRYPOINT ────────────────────────────────────────────────────────────

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const directory = process.argv[2] || '';
  if (!directory) {
    console.error('Usage: node agent.js <directory>');
    process.exit(1);
  }

  const report = await runAgent(directory);
  console.log('\n📊 REPORT:\n', JSON.stringify(report, null, 2));
}