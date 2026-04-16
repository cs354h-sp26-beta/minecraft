# minecraft

> Group Beta Pruning
>
> CS 354H: Spring 2026

## Known Issues/Quirks

- Though the spec says to use the constants 9.8 units/sec and 10 units/sec for gravity and jump acceleration, we found these numbers to lead to strange-feeling results for the player. So, we tuned these manually.
- Mining on top of large structures (i.e., mountains) is known to be slow due to our undermined block detection algorithm.

## Build

To build, the easiest way is to use the provided script:

```sh
./scripts/build-and-serve.sh
```

This will rebuild using [`./scripts/make-minecraft.py`](./scripts/make-minecraft.py) and then serve the result using `http-server`.
