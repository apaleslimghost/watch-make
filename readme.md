watch-make
---

## usage

```sh
wmake [targets]
```

watch-make gleans transitive file dependencies from your Makefile and watches them for changes, making `[targets]` when they're modified.

## dependencies

watch-make requires [`fswatch`](https://github.com/emcrisostomo/fswatch) on your `PATH`.

## installation

```sh
npm install -g watch-make
```

## licence

MIT
