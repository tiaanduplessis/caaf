<h1 align="center">caaf</h1>
<div align="center">
  <strong>CLI tool for minification, purification and optimization of HTML, JS, CSS and image assets</strong>
</div>
<br>
<div align="center">
  <a href="https://npmjs.org/package/caaf">
    <img src="https://img.shields.io/npm/v/caaf.svg?style=flat-square" alt="Package version" />
  </a>
  <a href="https://npmjs.org/package/caaf">
  <img src="https://img.shields.io/npm/dm/caaf.svg?style=flat-square" alt="Downloads" />
  </a>
  <a href="https://github.com/feross/standard">
    <img src="https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square" alt="Standard" />
  </a>
  <a href="https://travis-ci.org/tiaanduplessis/caaf">
    <img src="https://img.shields.io/travis/tiaanduplessis/caaf.svg?style=flat-square" alt="Travis Build" />
  </a>
  <a href="https://github.com/RichardLitt/standard-readme)">
    <img src="https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square" alt="Standard Readme" />
  </a>
  <a href="https://badge.fury.io/gh/tiaanduplessis%2Fcaaf">
    <img src="https://badge.fury.io/gh/tiaanduplessis%2Fcaaf.svg?style=flat-square" alt="GitHub version" />
  </a>
  <a href="https://dependencyci.com/github/tiaanduplessis/caaf">
    <img src="https://dependencyci.com/github/tiaanduplessis/caaf/badge?style=flat-square" alt="Dependency CI" />
  </a>
  <a href="https://github.com/tiaanduplessis/caaf/blob/master/LICENSE">
    <img src="https://img.shields.io/npm/l/caaf.svg?style=flat-square" alt="License" />
  </a>
  <a href="http://makeapullrequest.com">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs" />
  </a>
  <a href="https://www.paypal.me/tiaanduplessis/1">
    <img src="https://img.shields.io/badge/$-support-green.svg?style=flat-square" alt="Donate" />
  </a>
</div>
<br>
<div align="center">
  <a href="https://github.com/tiaanduplessis/caaf/watchers">
    <img src="https://img.shields.io/github/watchers/tiaanduplessis/caaf.svg?style=social" alt="Github Watch Badge" />
  </a>
  <a href="https://github.com/tiaanduplessis/caaf/stargazers">
    <img src="https://img.shields.io/github/stars/tiaanduplessis/caaf.svg?style=social" alt="Github Star Badge" />
  </a>
  <a href="https://twitter.com/intent/tweet?text=Check%20out%20caaf!%20https://github.com/tiaanduplessis/caaf%20%F0%9F%91%8D">
    <img src="https://img.shields.io/twitter/url/https/github.com/tiaanduplessis/caaf.svg?style=social" alt="Tweet" />
  </a>
</div>
<br>
<div align="center">
  Built with ❤︎ by <a href="tiaan.beer">Tiaan</a> and <a href="https://github.com/tiaanduplessis/caaf/graphs/contributors">contributors</a>
</div>

<h2>Table of Contents</h2>
<details>
  <summary>Table of Contents</summary>
  <li><a href="#about">About</a></li>
  <li><a href="#install">Install</a></li>
  <li><a href="#usage">Usage</a></li>
  <li><a href="#contribute">Contribute</a></li>
  <li><a href="#license">License</a></li>
</details>

## About

This basic CLI tool recursively walks a given directory and:
- Minifies HTML using [html-minifier](https://github.com/kangax/html-minifier)
- Minifies and removes unused CSS using [purify-css](https://github.com/purifycss/purifycss)
- Minifies JS using [uglify-js](https://github.com/mishoo/UglifyJS)
- Minifies png, jpeg, jpg, gif & svg images using [imagemin](https://github.com/imagemin/imagemin)

## Install

```sh
$ npm install --global caaf
# OR
$ yarn global add caaf
```

## Usage

After install run `gaaf`.

```sh
$ gaaf
```

This will optimize all assets in the current directory.

You can also specify a input directory:

```sh
$ gaaf inputDir
```

And output directory:

```sh
$ gaaf inputDir outputDir
```

## Contribute

Contributions are welcome. Please open up an issue or create PR if you would like to help out.

Note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

Licensed under the MIT License.
