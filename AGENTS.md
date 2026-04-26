# Dungeon Crawl Stone Soup (DCSS)

## Build commands

```sh
cd crawl-ref/source
make -j4 TILES=y        # tiles build (use without TILES for console)
make debug            # debug build
make catch2-tests     # unit tests (Catch2)
```

## Running tests

```sh
# Lua functional tests (requires DEBUG build)
./crawl -test           # run all
./crawl -test foo       # run tests matching "foo"

# Catch2 unit tests (already compiled by make catch2-tests)
./catch2-test-executable
```

## Lint checks (required before commit)

```sh
cd crawl-ref/source
util/checkwhite -n           # check whitespace
util/unbrace -n             # check braces
util/checkconventionalcommit.py  # check commit format (optional on master)
```

## Key directories

- `crawl-ref/source/` - main C++ source code
- `crawl-ref/source/test/` - Lua functional tests
- `crawl-ref/source/catch2-tests/` - Catch2 unit tests
- `crawl-ref/source/util/` - build/analysis tools
- `crawl-ref/docs/develop/` - developer documentation

## Dependencies

Must run after cloning:
```sh
git submodule update --init
```

## Coding conventions

- 4 spaces indent, 80 column limit
- Use `util/checkwhite` and `util/unbrace` to fix issues before committing
- Commit messages: max 72 chars title, conventional commits welcome
- Reference issues with `#123` or `Resolves #123`