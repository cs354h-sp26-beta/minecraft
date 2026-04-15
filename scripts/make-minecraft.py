#!/usr/bin/env python3

import glob
import shutil
import subprocess

srcfiles = glob.glob('./src/minecraft/*.ts')
loaders = glob.glob('./src/lib/threejs/examples/jsm/loaders/*.js')
cmd = (
    # 'tsc --allowJs -m ES6 -t ES6 --outDir dist --sourceMap --alwaysStrict '
    'tsc --allowJs -m ES6 -t ES6 --moduleResolution node --outDir dist --sourceMap --alwaysStrict '
    '--strictPropertyInitialization false '
    + " ".join(srcfiles)
    + ' ./src/lib/vue/vue.js '
    + " ".join(loaders)
)
print('Building TypeScript: ' + cmd)
subprocess.run(cmd, shell=True, check=True)
shutil.copytree('./src/minecraft/static', './dist', dirs_exist_ok=True)