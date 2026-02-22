import { GoogleGenAI,Type } from "@google/genai";
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

async function listFiles({directory}){
    const files=[];
    const extensions=['.js','.jsx','.ts','.tsx','.html','.css'];

    function scan(dir){
        const items=fs.readdirSync(dir);

        for(const item of items){
            const fullPath=path.join(dir,item);

            if(fullPath.includes('node_modules') || fullPath.includes('dist') || fullPath.includes('build'))continue;

            const stat=fs.statSync(fullPath);

            if(stat.isDirectory()){
                scan(fullPath);
            }
            else if(stat.isFile()){
                const ext=path.extname(item);
                if(extensions.includes(ext)){
                    files.push(fullPath);
                }
            }
        }
    }

    scan(directory);
    return {files};
}

async function readFile({file_path}){
    const content=fs.readFileSync(file_path,'utf-8');
    return {content};
}

async function writeFile({file_path,content}){
    fs.writeFileSync(file_path,content,'utf-8');
    return {success:true};
}

const tools={
  'list_files':listFiles,
    'read_file':readFile,
    'write_file':writeFile
};

const listFilesTool = {
  name: 'list_files',
  description: 'This makes list of all files present in a folder',
  parameters: {
    type: Type.OBJECT,
    properties: {
      directory: {
        type: Type.STRING,
        description: 'DIRECTORY path to scan',
      },
    },
    required: ['directory'],
  },
};


const readFileTool = {
  name: 'read_file',
  description: 'This will read the content present in a file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      file_path: {
        type: Type.STRING,
        description: 'Directory path to scan',
      },
    },
    required: ['file_path'],
  },
};


const writeFileTool = {
  name: 'write_file',
  description: 'This will write in a file . eg this can modify a file and do changes which llm tell',
  parameters: {
    type: Type.OBJECT,
    properties: {
      file_path: {
        type: Type.STRING,
        description: 'Directory path to scan',
      },
      content:{
        type: Type.STRING,
        description: 'the fixed corrected content',
      },
    },
    required: ['file_path','content'],
  },
};


export async function runAgent(directoryPath){

    const History=[{
        role: 'user', 
        parts: [{ text: `review and fix all the js code in ${directoryPath}`}]
    }];

    while (true) {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents:History,
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
            5. After fixing all files, respond with a summary report in TEXT format

            **Summary Report Format:**
            📊 CODE REVIEW COMPLETE

            Total Files Analyzed: X
            Files Fixed: Y

            🔴 SECURITY FIXES:
            - file.js:line - Fixed hardcoded API key
            - auth.js:line - Removed eval() usage
            
            🟠 BUG FIXES:
            - app.js:line - Added null check for user object
            - index.html:line - Added missing alt attribute
            
            🟡 CODE QUALITY IMPROVEMENTS:
            - styles.css:line - Removed duplicate styles
            - script.js:line - Removed console.log statements

            Be practical and focus on real issues. Actually FIX the code, don't just report.`,
            tools: [{
                functionDeclarations: [listFilesTool,readFileTool ,writeFileTool]
            }],

        },
      });

      if (result.functionCalls && result.functionCalls.length > 0) {
        for(const functionCall of result.functionCalls){

          const { name, args } = functionCall;

          if (!tools[name]) {
            throw new Error(`Unknown function call: ${name}`);
          }

          // Call the function and get the response.
          const toolResponse =await tools[name](args);

          const functionResponsePart = {
            name: functionCall.name,
            response: {
              result: toolResponse,
            },
          };

      // Send the function response back to the model.
          History.push({
            role: "model",
            parts: [
              {
                functionCall: functionCall,
              },
            ],
          });
          History.push({
            role: "user",
            parts: [
              {
                functionResponse: functionResponsePart,
              },
            ],
          });
        }
      } else {
        // No more function calls, break the loop.\
        break;
      }
    }
}

const directory=process.argv[2] ||'' ;

await runAgent(directory);