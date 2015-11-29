#!/bin/sh

set -e

wmake () {
	make $@
	deps=$(make -nBd $@ | grep 'No need' | cut -d '`' -f 2 | cut -d "'" -f 1)
	echo Watching: $(echo $deps | tr "\n" " ")
	fswatch -o $deps | xargs -n1 -I{} make $@
}

wmake $@
