#!/usr/bin/env node
// Launches electron-vite dev with ELECTRON_RUN_AS_NODE stripped from env.
// Background: VSCode's Electron host exports ELECTRON_RUN_AS_NODE=1 to spawned
// terminals. Any non-empty value (including "") makes the electron binary boot
// as plain Node, breaking electron-vite's main process launch
// ("TypeError: Cannot read properties of undefined (reading 'isPackaged')").
// cross-env cannot truly unset, so we delete the key from process.env here.

import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('electron-vite', ['dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
