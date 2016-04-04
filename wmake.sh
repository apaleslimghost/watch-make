#!/bin/bash

set -e

command -v fswatch >/dev/null 2>&1 || {
	echo "fswatch not found"
	exit 1
}

wmake () {
	make $@
	deps=$(make -nBd $@ | grep 'No need' | cut -d '`' -f 2 | cut -d "'" -f 1)
	echo Watching: $(echo $deps | tr "\n" " ")
	fswatch -o $deps | xargs -n1 -I{} make $@
}

wmake $@
