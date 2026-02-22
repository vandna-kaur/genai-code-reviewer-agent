# 🚀 GenAI Code Reviewer Agent

An **autonomous GenAI-powered code reviewer** that scans a project directory, analyzes code, **fixes real issues automatically**, and writes corrected code back to files.

This agent goes beyond static analysis — it **acts like a senior code reviewer** using tool-calling and filesystem access.

---

## ✨ Features

- 🔍 Recursively scans a directory
- 📂 Supports:
  - JavaScript (`.js`)
  - TypeScript (`.ts`)
  - HTML (`.html`)
  - CSS (`.css`)
- 🤖 Uses GenAI with tool-calling to:
  - Read files
  - Detect bugs, security issues & bad practices
  - Automatically fix issues
  - Write corrected code back to files
- 📊 Generates a final human-readable summary report

---

## 🧠 What It Reviews

### ✅ JavaScript / TypeScript
- Null / undefined errors
- Async-await issues
- Unused variables & console logs
- Bad naming & complex logic
- Security risks (eval, hardcoded secrets)

### ✅ HTML
- Missing `doctype`, `meta` tags
- Accessibility issues (alt attributes, ARIA)
- Broken semantics

### ✅ CSS
- Invalid properties & syntax errors
- Duplicate / unused styles
- Inefficient selectors

---

## 🛠 Tech Stack

- Node.js
- Google Gemini API
- Tool-calling GenAI
- File System APIs (`fs`, `path`)

---

## 📦 Project Structure

```bash
genai-code-reviewer-agent/
│── index.js
│── package.json
│── package-lock.json
│── .env.example
│── README.md
