import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { pluginTypeDefs } from './plugin-lib-types';

const program = new Command();

interface PluginAnswers {
    name: string;
    type: 'ui' | 'middleware' | 'hybrid';
    slots?: string[];
    middlewarePoints?: string[];
    typescript: boolean;
}

program
    .name('create-remix-plugin')
    .description('CLI to scaffold Remix plugins')
    .version('1.0.0');

program
    .command('create', { isDefault: true })
    .description('Create a new plugin')
    .action(async () => {
        const answers = await inquirer.prompt<PluginAnswers>([
            {
                type: 'input',
                name: 'name',
                message: 'Plugin name:',
                default: 'my-bolt-plugin',
                validate: (input) => {
                    if (input.match(/^[a-z0-9-]+$/)) return true;
                    return 'Name must contain only lowercase letters, numbers, and dashes';
                }
            },
            {
                type: 'list',
                name: 'type',
                message: 'Plugin type:',
                choices: ['ui', 'middleware', 'hybrid']
            },
            {
                type: 'checkbox',
                name: 'slots',
                message: 'Select UI slots (if applicable):',
                when: (answers) => answers.type !== 'middleware',
                choices: ['app-header', 'workbench-healder', 'settings-tab']
            },
            {
                type: 'checkbox',
                name: 'middlewarePoints',
                message: 'Select middleware points (if applicable):',
                when: (answers) => answers.type !== 'ui',
                choices: [
                    'beforeUserInput',
                    'afterUserInput',
                    'beforeAssistantOutput',
                    'afterAssistantOutput',
                ]
            },
            {
                type: 'confirm',
                name: 'typescript',
                message: 'Use TypeScript?',
                default: true
            }
        ]);

        await createPluginFiles(answers);
    });

async function createPluginFiles(answers: PluginAnswers) {
    const pluginDir = path.join(process.cwd(), answers.name);

    // Create directory structure
    await fs.ensureDir(pluginDir);
    await fs.ensureDir(path.join(pluginDir, 'src'));

    // Create manifest
    const manifest = {
        id: answers.name,
        version: '1.0.0',
        type: answers.type,
        entryPoint: `dist/index.js`,
        permissions: [],
        slots: answers.slots,
        middlewarePoints: answers.middlewarePoints
    };

    await fs.writeJSON(path.join(pluginDir, 'plugin.json'), manifest, { spaces: 2 });

    // Create pack.js
    const packJs = `
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');

async function packPlugin() {
    const zip = new AdmZip();
    const manifest = require('../plugin.json');
    const outputFile = \`\${ pkg.name }-\${ pkg.version }.zip\`;

    // Add files specified in package.json 'files' array
    for (const file of pkg.files) {
        if (fs.existsSync(file)) {
            zip.addLocalFile(file);
        } else {
            console.warn(\`Warning: File \${ file } specified in package.json 'files' does not exist\`);
        }
    }

    // Create the zip file
    zip.writeZip(outputFile);
    console.log(\`Plugin packed successfully: \${ outputFile }\`);
}

packPlugin().catch(console.error);
`
    await fs.ensureDir(path.join(pluginDir, 'scripts'));

    // Write the pack script
    await fs.writeFile(
        path.join(pluginDir, 'scripts', 'pack.js'),
        packJs
    );

    // Create README.md
    await fs.writeFile(
        path.join(pluginDir, 'README.md'),
        `# ${answers.name}\n\nA plugin for bolt.diy`
    );


    // Create package.json
    const packageJson = {
        name: answers.name,
        version: '1.0.0',
        main: 'dist/index.js',
        scripts: {
            "build": answers.typescript ?
                "esbuild src/index.tsx --bundle --external:react --external:react-dom --outfile=dist/index.js --platform=browser --format=esm --minify" :
                "esbuild src/index.jsx --bundle --external:react --external:react-dom --outfile=dist/index.js --platform=browser --format=esm --minify",
            "watch": answers.typescript ?
                "esbuild src/index.tsx --bundle --external:react --external:react-dom --outfile=dist/index.js --platform=browser --format=esm --watch" :
                "esbuild src/index.jsx --bundle --external:react --external:react-dom --outfile=dist/index.js --platform=browser --format=esm --watch",
            "type-check": answers.typescript ? "tsc --noEmit" : "echo \"No type checking needed\"",
            "prepack": "npm run build",
            "pack": "node scripts/pack.js"
        },
        dependencies: {
            'react': '^18.2.0',
            'react-dom': '^18.2.0'
        },
        devDependencies: {
            'esbuild': '^0.19.0',
            'adm-zip': '^0.5.10',
            ...(answers.typescript ? {
                'typescript': '^5.0.0',
                '@types/node': '^20.0.0',
                '@types/react': '^18.2.0',
                '@types/react-dom': '^18.2.0'
            } : {})
        },
        files: [
            "dist/index.js",
            "plugin.json",
            "README.md",
            // "LICENSE"
        ]
    };

    await fs.writeJSON(path.join(pluginDir, 'package.json'), packageJson, { spaces: 2 });

    // Create tsconfig.json if using TypeScript
    if (answers.typescript) {
        const tsConfig = {
            compilerOptions: {
                target: 'es2020',
                module: 'esnext',
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                forceConsistentCasingInFileNames: true,
                outDir: './dist',
                declaration: true,
                jsx: 'react',
                moduleResolution: 'node',
                lib: ['dom', 'dom.iterable', 'esnext'],
                // Don't emit files since esbuild will handle that
                noEmit: true
            },
            include: ['src'],
            exclude: ['node_modules', 'dist']
        };

        await fs.writeJSON(path.join(pluginDir, 'tsconfig.json'), tsConfig, { spaces: 2 });
    }

    // Create plugin source file
    if (answers.typescript) {
        const sourceTypesFile = generatePluginTypes(answers);
        await fs.writeFile(
            path.join(pluginDir, 'src', `types.ts`),
            sourceTypesFile
        );
    }
    const sourceFile = generatePluginSource(answers);
    await fs.writeFile(
        path.join(pluginDir, 'src', `index.${answers.typescript ? 'tsx' : 'jsx'}`),
        sourceFile
    );

    console.log(chalk.green('\nPlugin scaffolding complete! 🎉'));
    console.log('\nNext steps:');
    console.log(chalk.cyan(`1. cd ${answers.name}`));
    console.log(chalk.cyan('2. npm install'));
    console.log(chalk.cyan('3. npm run build'));
}

function generatePluginTypes(answers: PluginAnswers): string {
    const ext = answers.typescript ? 'ts' : 'js';
    let source = pluginTypeDefs;

    if (answers.typescript) {
        source += `
export interface PluginContext{
    api: CoreAPI;
}

export interface UIPluginContext {
    slot: string;
    api: CoreAPI;
}

export interface MiddlewareContext {
    point: string;
    data: any;
    api: CoreAPI;
    next: (data: any) => Promise<any>;
}

export type UIPluginMount = (context: UIPluginContext) => Promise<ReactElement>; 
export type MiddlewareProcess = (context: MiddlewareContext) => Promise<any>;

export interface UIPlugin {
    mount: UIPluginMount;
    unmount?: () => Promise<void>;
}

export interface MiddlewarePlugin {
    process: MiddlewareProcess;
}

export interface HybridPlugin extends UIPlugin, MiddlewarePlugin {}

export type Plugin = UIPlugin | MiddlewarePlugin | HybridPlugin;

export type CreatePlugin = (context: PluginContext) => Plugin;

`;
    }
    return source;
}

function generatePluginSource(answers: PluginAnswers): string {
    const imports = answers.typescript ?
        `import React, { ReactElement } from 'react';
import { PluginContext, UIPluginContext, MiddlewareContext, CreatePlugin } from './types';` :
        `import React from 'react';`;

    let source = `${imports}

const createPlugin${answers.typescript ? ': CreatePlugin' : ''} = (options${answers.typescript ? ': PluginContext' : ''}) => {
  return {
    ${answers.type !== 'middleware' ? `
    mount: async (context${answers.typescript ? ': UIPluginContext' : ''})${answers.typescript ? ': Promise<ReactElement>' : ''} => {
      return (
        <div className="p-4">
          <h2 className="text-lg font-bold">Plugin UI</h2>
          <p>This is a sample plugin UI for slot: {context.slot}</p>
        </div>
      );
    },
    unmount: async (slot${answers.typescript ? ': string' : ''}) => {
      // Cleanup code
    },
    ` : ''}
    ${answers.type !== 'ui' ? `
    process: async (context${answers.typescript ? ': MiddlewareContext' : ''}) => {
      const { data, next } = context;
      // Modify data here
      return next(data);
    },` : ''}
  };
}
export default createPlugin;`

    return source;
}

program.parse();