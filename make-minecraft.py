#!/usr/bin/env python3

import glob
import shutil
import subprocess

srcfiles = glob.glob('./src/minecraft/*.ts')
cmd = 'tsc --allowJs -m ES6 -t ES6 --outDir dist --sourceMap --alwaysStrict ' + " ".join(srcfiles) + ' ./src/lib/vue/vue.js '
print('Building TypeScript: ' + cmd)
subprocess.run(cmd, shell=True)
shutil.copytree('./src/minecraft/static', './dist', dirs_exist_ok=True)
