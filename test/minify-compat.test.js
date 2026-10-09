'use strict'

// Only fixed, reviewed fixture programs are evaluated. The CLI's directory and
// asset providers are guarded; filesystem writes are restricted to owned files.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const vm = require('vm')

delete process.env.UGLIFY_BUG_REPORT
const options = {}
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '')
  assert(['cli', 'minifier-root'].indexOf(key) !== -1, 'Unknown option: ' + key)
  assert(process.argv[i + 1], 'Missing option value: ' + key)
  options[key] = process.argv[i + 1]
}
const cliEntry = path.resolve(options.cli || path.join(__dirname, '..', 'index.js'))
const cliSource = fs.readFileSync(cliEntry, 'utf8')
const minifierEntry = require.resolve('uglify-js', {
  paths: [path.resolve(options['minifier-root'] || path.dirname(cliEntry))]
})
const uglify = require(minifierEntry)
const packageInfo = require(path.resolve(path.dirname(minifierEntry), '..', 'package.json'))
assert.strictEqual(packageInfo.name, 'uglify-js')

const fixtures = [
  ['sloppy this', 'var result = (function () { return this === globalThis; })();'],
  ['strict this', '"use strict"; var result = (function () { return this === undefined; })();'],
  ['duplicate sloppy parameters', 'var result = (function (a, a) { return a; })(1, 2);'],
  ['legacy octal script', 'var result = 010;'],
  ['with scope', 'var result; with ({ answer: 7 }) { result = answer; }'],
  ['initialized const', 'const answer = 3; var result = answer * 2;'],
  ['block const scope', 'const answer = 3; var inner; { const answer = 4; inner = answer; } var result = [inner, answer];'],
  ['parameter mutation through arguments', 'function change(value) { arguments[0] = "updated"; return value; } var result = change("original");'],
  ['arguments alias assignment', 'function change(value) { value = "updated"; return arguments[0]; } var result = change("original");'],
  ['getter effects', 'var calls = 0; var object = { get value() { calls++; return calls; } }; var result = [object.value, object.value, calls];'],
  ['function arity', 'function exposed(first, second, third) { return first; } var result = [exposed.length, exposed(3)];'],
  ['public script declarations', 'var publicValue = 4; function publicHandler(first, second) { return publicValue + first; } var result = publicHandler(3);', '[result, publicValue, typeof publicHandler, publicHandler.length, publicHandler(2)]'],
  ['constructor behavior', 'function Thing(value) { this.value = value; } var result = new Thing(9).value;'],
  ['method this', 'var object = { answer: 5, method: function () { return this.answer; } }; var result = object.method();'],
  ['try finally effects', 'var result = []; function run() { try { return 1; } finally { result.push("finally"); } } result.push(run());'],
  ['regexp behavior', 'var pattern = /\\x61/g; var result = [pattern.test("a"), pattern.lastIndex, pattern.test("a")];'],
  ['unicode string', 'var result = "café".length;'],
  ['HTML script comments', '<!-- fixture comment\nvar result = 7;\n//-->'],
  ['external anonymous function arity', 'function create() { return function (one, two, three) { return one; }; } var outputFn = create();', '[outputFn.length, outputFn(4)]'],
  ['shebang script', '#!/usr/bin/env node\nvar result = 8;']
]
// Invoke the compiled public function with accessors outside its minified source.
// Their changing values, repeated reads and thrown errors remain observable.
const subscribeSource = 'function subscribe(subs, name, handler) {' +
  'subs[name] = subs[name] ? subs[name].concat(handler) : (subs[name] = []).concat(handler); }'
const getterCases = [
  ['stable conditional getter', 'return [];'],
  ['changing conditional getter', 'return reads === 1 ? ["first"] : ["second"];'],
  ['null second conditional getter', 'return reads === 1 ? [] : null;'],
  ['throwing second conditional getter', 'if (reads === 2) throw originalError; return [];'],
  ['falsy conditional getter', 'return false;']
]
getterCases.forEach(function (fixture) {
  const observe = [
    '(function () {',
    'var reads = 0; var assigned = []; var error = null;',
    'var originalError = new Error("second read"); var subs = {};',
    'Object.defineProperty(subs, "event", {',
    'get: function () { reads++; ' + fixture[1] + ' },',
    'set: function (value) { assigned.push(value); } });',
    'try { subscribe(subs, "event", ["handler"]); }',
    'catch (caught) { error = [caught.name, caught.message, caught === originalError]; }',
    'return [reads, assigned, error]; })()'
  ].join('\n')
  fixtures.push([fixture[0], subscribeSource, observe])
})

function evaluate (code, expression) {
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false }
  })
  vm.runInContext(code, context, { timeout: 200 })
  return vm.runInContext('JSON.stringify(' + (expression || 'result') + ')', context, { timeout: 200 })
}

function checkFixture (fixture, inPlace) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'caaf-compat-'))
  const input = path.join(root, 'src')
  const output = inPlace ? input : path.join(root, 'out')
  const filename = path.join(input, 'fixture.js')
  const destination = path.join(output, 'fixture.js')
  const content = fixture[1]
  const expected = evaluate(content, fixture[2])
  const forbidden = function () { throw new Error('Unexpected asset provider invocation') }
  let writes = 0
  let nextCalls = 0
  const providers = {
    path,
    'uglify-js': uglify,
    'html-minifier': { minify: forbidden },
    'purify-css': forbidden,
    imagemin: forbidden,
    'imagemin-gifsicle': forbidden,
    'imagemin-svgo': forbidden,
    'imagemin-mozjpeg': forbidden,
    'imagemin-pngquant': forbidden,
    'node-dir': {
      readFiles: function (directory, callback) {
        assert.strictEqual(directory, input)
        callback(null, fs.readFileSync(filename, 'utf8'), filename, function () { nextCalls++ })
      }
    },
    filendir: {
      writeFileSync: function (target, value) {
        assert.strictEqual(path.resolve(root, target), destination, 'Write only the owned fixture output')
        assert.strictEqual(typeof value, 'string', 'Never write an invalid minifier result')
        writes++
        fs.mkdirSync(output, { recursive: true })
        fs.writeFileSync(destination, value)
      }
    }
  }
  const loaded = new Module(cliEntry, module)
  loaded.filename = cliEntry
  loaded.require = function (name) {
    assert(Object.prototype.hasOwnProperty.call(providers, name), 'Unexpected require: ' + name)
    return providers[name]
  }
  const originalCwd = process.cwd()
  const originalArgv = process.argv
  try {
    fs.mkdirSync(input)
    fs.writeFileSync(filename, content)
    process.chdir(root)
    process.argv = [process.execPath, cliEntry, 'src'].concat(inPlace ? [] : ['out'])
    loaded._compile(cliSource, cliEntry)
    assert.strictEqual(writes, 1)
    assert.strictEqual(nextCalls, 1)
    if (!inPlace) assert.strictEqual(fs.readFileSync(filename, 'utf8'), content)
    const minified = fs.readFileSync(destination, 'utf8')
    assert.strictEqual(evaluate(minified, fixture[2]), expected, 'Keep the script behavior observable by its caller')
  } finally {
    process.chdir(originalCwd)
    process.argv = originalArgv
    fs.rmSync(root, { recursive: true, force: true })
  }
}

let passed = 0
let failed = 0
fixtures.forEach(function (fixture) {
  ;[false, true].forEach(function (inPlace) {
    const name = fixture[0] + (inPlace ? ' (in place)' : ' (separate output)')
    try {
      checkFixture(fixture, inPlace)
      passed++
      console.log('ok - ' + name)
    } catch (error) {
      failed++
      console.error('not ok - ' + name + '\n' + error.stack)
    }
  })
})
console.log(passed + ' passed, ' + failed + ' failed (UglifyJS ' + packageInfo.version + '; ' + process.version + ')')
if (failed) process.exitCode = 1
