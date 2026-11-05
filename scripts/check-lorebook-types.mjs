// Focused compiler gate for this feature while the repository-wide tsc has
// pre-existing diagnostics in unrelated modules. Do not treat those as newly
// introduced regressions, and do not silently bypass Lorebook errors.
import ts from 'typescript';

const root = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
if (!root) throw new Error('tsconfig.json not found');
const read = ts.readConfigFile(root, ts.sys.readFile);
if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(read.config, ts.sys, process.cwd());
const program = ts.createProgram(config.fileNames, config.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
const own = [
  '/src/pages/Lorebook.tsx',
  '/src/components/LorebookLogEditor.tsx',
  '/src/lib/lorebookEditing.ts',
  '/src/lib/lorebookEditing.test.ts',
  '/src/lib/lorebookReviewEvents.ts',
  '/src/lib/lorebookReviewEvents.test.ts',
];
const inScope = diagnostics.filter(d =>
  d.file && own.some(path => d.file.fileName.replaceAll('\\', '/').endsWith(path)));
if(inScope.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(inScope, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  process.exit(1);
}
console.log('Lorebook TypeScript: all new/modified feature files passed.');
console.log('Existing diagnostics in other files: '+(diagnostics.length-inScope.length));
