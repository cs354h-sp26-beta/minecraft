#!/usr/bin/env sh

# usage: ./submit.sh <ARCHIVE NAME>

# Make a temp solution directory.
mkdir -p minecraft

# Copy important things into it.
cp -r src minecraft/
cp make-minecraft.py minecraft/
cp README.md minecraft/
cp biome.json minecraft/
cp project-description.pdf minecraft/


# Make archive and clean up.
tar --exclude='._*' -czvf $1.tgz minecraft/
rm -rf minecraft
