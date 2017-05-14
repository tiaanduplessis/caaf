#!/usr/bin/env node
'use strict'

const path = require('path')
const dir = require('node-dir')
const filendir = require('filendir')
const html = require('html-minifier')
const js = require('uglify-js')
const purify = require('purify-css')
const imagemin = require('imagemin')
const imageminGifsicle = require('imagemin-gifsicle')
const imageminSvgo = require('imagemin-svgo')
const imageminMozjpeg = require('imagemin-mozjpeg')
const imageminPngquant = require('imagemin-pngquant')
const input = path.join(process.cwd(), process.argv[2] || '')
const output = process.argv[3] || input

dir.readFiles(input, (error, content, filename, next) => {
  if (error) {
    throw error
  }

  let newContent = content
  const ext = path.extname(filename)
  const rel = path.relative(input, filename)

  if (ext === '.html' || ext === '.htm') {
    newContent = html.minify(content, {
      collapseWhitespace: true,
      collapseBooleanAttributes: true,
      minifyCSS: true,
      minifyJS: true,
      removeComments: true,
      useShortDoctype: true
    })
  }

  if (ext === '.js') {
    newContent = js.minify(content).code
  }

  if (ext === '.css') {
    const uses = [`${input}/**/*.js`, `${input}/**/*.html`]

    newContent = purify(uses, content, {
      minify: true
    })
  }

  if (ext.match(/.(png|jpeg|jpg|gif|svg)$/)) {
    imagemin([filename], path.dirname(path.join(output, rel)), {
      plugins: [
        imageminGifsicle(),
        imageminSvgo(),
        imageminMozjpeg(),
        imageminPngquant({ quality: '65-80' })
      ]
    })
    next()
  } else {
    filendir.writeFileSync(path.join(output, rel), newContent)
    next()
  }
})
