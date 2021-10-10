/**
 * Runs an ordered set of commands within each of the build directories.
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const chalk = require('chalk')

const exampleDirs = fs.readdirSync(__dirname).filter(file => {
  return fs.statSync(path.join(__dirname, file)).isDirectory()
})

// Ordering is important here. `npm install` must come first.
const cmdArgs = [{ cmd: 'npm', args: ['ci'] }, { cmd: 'npm', args: ['test'] }]

for (const dir of exampleDirs) {
  if (dir === 'counter-vanilla' || dir === 'universal') continue

  console.log(chalk.bold.yellow('\n\n==> Testing %s...\n\n'), dir)
  for (const cmdArg of cmdArgs) {
    // declare opts in this scope to avoid https://github.com/joyent/node/issues/9158
    const opts = {
      cwd: path.join(__dirname, dir),
      stdio: 'inherit',
      env: { ...process.env, SKIP_PREFLIGHT_CHECK: 'true' }
    }

    let result = {}
    if (process.platform === 'win32') {
      result = spawnSync(cmdArg.cmd + '.cmd', cmdArg.args, opts)
    } else {
      result = spawnSync(cmdArg.cmd, cmdArg.args, opts)
    }
    if (result.status !== 0) {
      console.log(result)
      throw new Error('Building examples exited with non-zero')
    }
  }
}
