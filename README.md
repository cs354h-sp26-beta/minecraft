# minecraft

> Group Beta Pruning
>
> CS 354H: Spring 2026

## Setup

As a one-time setup, I recommend that you all run `./scripts/init-hooks.sh` to set up a formatter commit hook.
I guess it's not required, but it'd be nice if our code was uniform-ish.

You will also need a new-ish [`python3`](https://www.python.org/downloads/), [`node`](https://nodejs.org/en/download), [`tsc`](https://www.typescriptlang.org/download/), and [`http-server`](https://www.npmjs.com/package/http-server).
I am also going to assume that you are on a unix-based system.

## Build

To build, the easiest way is to use the provided script:

```sh
# From the project root (here).
./scripts/build-and-serve.sh
```

This will rebuild using `./scripts/make-minecraft.py` and then serve the result using `http-server`.
