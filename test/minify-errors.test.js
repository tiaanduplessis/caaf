'use strict'

// Run with Node directly; only uglify-js is needed, not caaf's other providers.
// Optional: --cli FILE --minifier-root DIR, or --minifier-entry FILE
// and --minifier-package PACKAGE_JSON. The defaults also work from an npm pack.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const spawnSync = require('child_process').spawnSync

// UglifyJS's bug-report mode bypasses normal parsing and must not affect tests.
delete process.env.UGLIFY_BUG_REPORT

const options = {}
const allowedOptions = ['cli', 'minifier-root', 'minifier-entry', 'minifier-package', 'child', 'fixture-root']
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '')
  assert(allowedOptions.indexOf(key) !== -1, 'Unknown option: ' + process.argv[i])
  assert(process.argv[i + 1], 'Missing value for ' + process.argv[i])
  options[key] = process.argv[i + 1]
}

const cliEntry = path.resolve(options.cli || path.join(__dirname, '..', 'index.js'))
const minifierEntry = options['minifier-entry']
  ? path.resolve(options['minifier-entry'])
  : require.resolve('uglify-js', { paths: [path.resolve(options['minifier-root'] || path.dirname(cliEntry))] })
const minifierPackage = options['minifier-package']
  ? path.resolve(options['minifier-package'])
  : path.resolve(path.dirname(minifierEntry), '..', 'package.json')
const packageInfo = JSON.parse(fs.readFileSync(minifierPackage, 'utf8'))
assert.strictEqual(packageInfo.name, 'uglify-js', 'Select the actual uglify-js package')
const uglify = require(minifierEntry)
const cliSource = fs.readFileSync(cliEntry, 'utf8')
const invalid = 'var broken = ;'
const valid = 'function add (a, b) { return a + b; } console.log(add(1, 2));'
const errorFields = ['name', 'message', 'filename', 'line', 'col', 'pos']

function details (error) {
  const result = {}
  errorFields.forEach(function (key) { result[key] = error && error[key] })
  return result
}

function expectedCode (content) {
  const result = uglify.minify(content, {
    module: false,
    toplevel: false,
    compress: { keep_fargs: true, hoist_funs: true, conditionals: false }
  })
  assert.ifError(result.error)
  assert.strictEqual(typeof result.code, 'string')
  return result.code
}

function makeFixture (args, files, root) {
  root = root || fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'caaf-errors-'))
  const input = path.join(root, args[0] || '')
  const output = args[1] ? path.resolve(root, args[1]) : input
  const inputs = new Map()
  const outputs = new Map()
  files.forEach(function (file) {
    const source = path.join(input, file.name)
    const destination = path.join(output, file.name)
    assert(source.indexOf(root + path.sep) === 0)
    assert(destination.indexOf(root + path.sep) === 0)
    inputs.set(source, file)
    outputs.set(destination, file)
    fs.mkdirSync(path.dirname(source), { recursive: true })
    fs.writeFileSync(source, file.content)
    if (source !== destination && file.output !== undefined) {
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, file.output)
    }
  })
  return { root, args, files, input, output, inputs, outputs }
}

function readInput (fixture, name) {
  const filename = path.join(fixture.input, name)
  assert(fixture.inputs.has(filename))
  return fs.readFileSync(filename, 'utf8')
}

function readOutput (fixture, name) {
  const filename = path.join(fixture.output, name)
  assert(fixture.outputs.has(filename))
  return fs.readFileSync(filename, 'utf8')
}

// Execute only the trusted CLI source. Its require boundary cannot load any
// HTML/CSS/image/native provider, walk a checkout, or use a network provider.
function runCLI (fixture, controls) {
  controls = controls || {}
  const state = { visited: [], writes: [], next: [], minifyCalls: [], errors: [], errorDetails: [] }
  const forbidden = function () { throw new Error('Unexpected non-JavaScript provider invocation') }
  const providers = {
    path,
    'html-minifier': { minify: forbidden },
    'purify-css': forbidden,
    imagemin: forbidden,
    'imagemin-gifsicle': forbidden,
    'imagemin-svgo': forbidden,
    'imagemin-mozjpeg': forbidden,
    'imagemin-pngquant': forbidden,
    'uglify-js': {
      minify: function (content) {
        state.minifyCalls.push(content)
        if (controls.minifierError) throw controls.minifierError
        const result = uglify.minify.apply(uglify, arguments)
        if (result.error) {
          state.errors.push(result.error)
          state.errorDetails.push(details(result.error))
        }
        return result
      }
    },
    filendir: {
      writeFileSync: function (filename, content) {
        assert.strictEqual(arguments.length, 2)
        const destination = path.resolve(fixture.root, filename)
        assert(fixture.outputs.has(destination), 'Writer escaped the fixture allowlist')
        state.writes.push(filename)
        if (controls.writerError) throw controls.writerError
        // Baseline calls the writer with undefined on parse failure. Reject it
        // before touching the file so negative controls cannot destroy data.
        assert.strictEqual(typeof content, 'string', 'Writer received non-string minifier output')
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.writeFileSync(destination, content)
      }
    },
    'node-dir': {
      readFiles: function (input, callback) {
        assert.strictEqual(arguments.length, 2)
        assert.strictEqual(input, fixture.input)
        let index = 0
        function visit () {
          if (index === fixture.files.length) return
          const file = fixture.files[index++]
          const filename = path.join(input, file.name)
          assert(fixture.inputs.has(filename), 'Reader escaped the fixture allowlist')
          state.visited.push(file.name)
          callback(controls.readerError || null, readInput(fixture, file.name), filename, function () {
            state.next.push(file.name)
            if (controls.async) setImmediate(visit)
            else visit()
          })
        }
        if (controls.async) setImmediate(visit)
        else visit()
      }
    }
  }
  const loaded = new Module(cliEntry, module)
  loaded.filename = cliEntry
  loaded.require = function (name) {
    assert(Object.prototype.hasOwnProperty.call(providers, name), 'Unexpected require: ' + name)
    return providers[name]
  }
  const originalArgv = process.argv
  const originalCwd = process.cwd()
  process.argv = [process.execPath, cliEntry].concat(fixture.args)
  process.chdir(fixture.root)
  try {
    loaded._compile(cliSource, cliEntry)
  } catch (error) {
    state.caught = error
  } finally {
    // Async child callbacks must retain the real invocation's argv and cwd.
    if (!controls.async) {
      process.argv = originalArgv
      process.chdir(originalCwd)
    }
  }
  return state
}

function withFixture (args, files, check) {
  const fixture = makeFixture(args, files)
  try {
    check(fixture)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
}

function assertParserError (error, original, snapshot) {
  assert(original, 'The real parser must return an error for the invalid fixture')
  assert.strictEqual(error, original, 'Propagate the original parser error object')
  assert.deepStrictEqual(details(error), snapshot, 'Keep all original parser diagnostics')
  assert.strictEqual(error.name, 'SyntaxError')
  assert(error.message.length > 0)
  assert.strictEqual(error.filename, '0')
  assert.strictEqual(error.line, 1)
  assert.strictEqual(error.col, 13)
  assert.strictEqual(error.pos, 13)
}

function failureFiles () {
  return [
    { name: 'before.js', content: valid, output: 'old before output' },
    { name: 'nested/broken.js', content: invalid, output: 'keep broken output' },
    { name: 'after.js', content: valid, output: 'keep later output' }
  ]
}

function assertFailureFiles (fixture) {
  assert.strictEqual(readOutput(fixture, 'before.js'), expectedCode(valid), 'Keep earlier valid progress')
  assert.strictEqual(readInput(fixture, 'nested/broken.js'), invalid)
  assert.strictEqual(readInput(fixture, 'after.js'), valid)
  if (fixture.input !== fixture.output) {
    assert.strictEqual(readInput(fixture, 'before.js'), valid)
    assert.strictEqual(readOutput(fixture, 'nested/broken.js'), 'keep broken output')
    assert.strictEqual(readOutput(fixture, 'after.js'), 'keep later output')
  }
}

function assertStopped (state, fixture) {
  assert.deepStrictEqual(state.visited, ['before.js', 'nested/broken.js'])
  assert.deepStrictEqual(state.minifyCalls, [valid, invalid])
  assert.deepStrictEqual(state.next, ['before.js'], 'Do not advance after parser failure')
  const outputArg = fixture.args[1] || fixture.input
  assert.deepStrictEqual(state.writes, [path.join(outputArg, 'before.js')], 'Never call the writer for failed minification')
}

// This mode runs only in a fresh child. Monitor the uncaught exception without
// handling it: Node must retain its normal failing exit and parser diagnostic.
if (options.child) {
  assert(options.child === 'separate' || options.child === 'in-place')
  const root = path.resolve(options['fixture-root'])
  assert(path.basename(root).indexOf('caaf-errors-') === 0)
  assert.strictEqual(path.dirname(root), fs.realpathSync(os.tmpdir()))
  const args = options.child === 'separate' ? ['src', 'out'] : ['src']
  const fixture = makeFixture(args, failureFiles(), root)
  let state
  process.on('uncaughtExceptionMonitor', function (error) {
    fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify({
      sameError: error === state.errors[0],
      error: details(error),
      parserError: state.errorDetails[0],
      visited: state.visited,
      writes: state.writes,
      next: state.next,
      minifyCalls: state.minifyCalls
    }))
  })
  state = runCLI(fixture, { async: true })
  assert.ifError(state.caught)
} else {
  let passed = 0
  let failed = 0
  function test (name, check) {
    try {
      check()
      passed++
      console.log('ok - ' + name)
    } catch (error) {
      failed++
      console.error('not ok - ' + name + '\n' + error.stack)
    }
  }

  test('relative output preserves real-parser results, including empty output and text copies', function () {
    const files = [
      { name: 'nested/valid.js', content: valid },
      { name: 'empty.js', content: '' },
      { name: 'comments.js', content: '/* only a comment */\n// another comment\n' },
      { name: 'notes.txt', content: invalid + '\nunchanged text\n' },
      { name: 'upper.JS', content: invalid }
    ]
    withFixture(['src', 'out'], files, function (fixture) {
      const state = runCLI(fixture)
      assert.ifError(state.caught)
      assert.deepStrictEqual(state.minifyCalls, files.slice(0, 3).map(function (file) { return file.content }))
      assert.deepStrictEqual(state.next, files.map(function (file) { return file.name }))
      assert.deepStrictEqual(state.writes, files.map(function (file) { return path.join('out', file.name) }))
      files.forEach(function (file) {
        const expected = path.extname(file.name) === '.js' ? expectedCode(file.content) : file.content
        assert.strictEqual(readOutput(fixture, file.name), expected)
        assert.strictEqual(readInput(fixture, file.name), file.content)
      })
      assert.strictEqual(readOutput(fixture, 'empty.js'), '')
      assert.strictEqual(readOutput(fixture, 'comments.js'), '')
    })
  })

  ;[['src'], []].forEach(function (args) {
    test('valid JavaScript uses default in-place output with ' + args.length + ' CLI arguments', function () {
      withFixture(args, [{ name: 'valid.js', content: valid }], function (fixture) {
        const state = runCLI(fixture)
        assert.ifError(state.caught)
        assert.strictEqual(readInput(fixture, 'valid.js'), expectedCode(valid))
        assert.deepStrictEqual(state.next, ['valid.js'])
        assert.deepStrictEqual(state.writes, [path.join(fixture.input, 'valid.js')])
      })
    })
  })

  ;[['src', 'out'], ['src'], []].forEach(function (args) {
    test('parser error is unchanged and stops writes/iteration with ' + args.length + ' CLI arguments', function () {
      withFixture(args, failureFiles(), function (fixture) {
        const state = runCLI(fixture)
        // Check preservation even when running this suite against the baseline.
        assertFailureFiles(fixture)
        assertParserError(state.caught, state.errors[0], state.errorDetails[0])
        assertStopped(state, fixture)
      })
    })
  })

  test('a parser error creates no output file or output directory', function () {
    withFixture(['src', 'out'], [
      { name: 'nested/broken.js', content: invalid },
      { name: 'after.js', content: valid }
    ], function (fixture) {
      const state = runCLI(fixture)
      assert.strictEqual(fs.existsSync(fixture.output), false)
      assert.strictEqual(readInput(fixture, 'nested/broken.js'), invalid)
      assert.strictEqual(readInput(fixture, 'after.js'), valid)
      assertParserError(state.caught, state.errors[0], state.errorDetails[0])
      assert.deepStrictEqual(state.visited, ['nested/broken.js'])
      assert.deepStrictEqual(state.minifyCalls, [invalid])
      assert.deepStrictEqual(state.writes, [])
      assert.deepStrictEqual(state.next, [])
    })
  })

  ;['readerError', 'writerError', 'minifierError'].forEach(function (kind) {
    test(kind + ' propagates by identity without advancing', function () {
      withFixture(['src', 'out'], [
        { name: 'first.js', content: valid, output: 'keep first' },
        { name: 'later.js', content: valid, output: 'keep later' }
      ], function (fixture) {
        const original = new Error('fixture ' + kind)
        const controls = {}
        controls[kind] = original
        const state = runCLI(fixture, controls)
        assert.strictEqual(state.caught, original)
        assert.deepStrictEqual(state.visited, ['first.js'])
        assert.deepStrictEqual(state.next, [])
        assert.deepStrictEqual(state.minifyCalls, kind === 'readerError' ? [] : [valid])
        assert.deepStrictEqual(state.writes, kind === 'writerError' ? [path.join('out', 'first.js')] : [])
        assert.strictEqual(readInput(fixture, 'first.js'), valid)
        assert.strictEqual(readInput(fixture, 'later.js'), valid)
        assert.strictEqual(readOutput(fixture, 'first.js'), 'keep first')
        assert.strictEqual(readOutput(fixture, 'later.js'), 'keep later')
      })
    })
  })

  ;['separate', 'in-place'].forEach(function (mode) {
    test('async parser failure remains uncaught and preserves files: ' + mode, function () {
      const args = mode === 'separate' ? ['src', 'out'] : ['src']
      withFixture(args, failureFiles(), function (fixture) {
        const env = Object.assign({}, process.env)
        delete env.UGLIFY_BUG_REPORT
        const child = spawnSync(process.execPath, [
          __filename, '--cli', cliEntry,
          '--minifier-entry', minifierEntry, '--minifier-package', minifierPackage,
          '--child', mode, '--fixture-root', fixture.root
        ], { cwd: fixture.root, env, encoding: 'utf8', timeout: 10000 })
        assert.ifError(child.error)
        assert.strictEqual(child.signal, null)
        assert.strictEqual(child.status, 1, 'Uncaught parser errors must fail the process')
        const report = JSON.parse(fs.readFileSync(path.join(fixture.root, 'report.json'), 'utf8'))
        assertFailureFiles(fixture)
        assert.strictEqual(report.sameError, true, 'Uncaught exception must be the original parser error')
        assert.deepStrictEqual(report.error, report.parserError)
        assert.strictEqual(report.error.name, 'SyntaxError')
        assert.strictEqual(report.error.line, 1)
        assert.strictEqual(report.error.col, 13)
        assert.strictEqual(report.error.pos, 13)
        assert(child.stderr.indexOf(report.error.message) !== -1, 'Retain the parser diagnostic on stderr')
        assertStopped(report, fixture)
      })
    })
  })

  console.log(passed + ' passed, ' + failed + ' failed (UglifyJS ' + packageInfo.version + '; ' + process.version + ')')
  if (failed) process.exitCode = 1
}
