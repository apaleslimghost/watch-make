#!/bin/bash

set -e

fswatch --version | grep Enrico > /dev/null || {
	cat <<EOF
fswatch not found or incompatible version

fswatch >1.3 by Enrico Crisostomo is required.
It is available at http://emcrisostomo.github.io/fswatch/
or in Homebrew: `brew install fswatch`
EOF
	exit 1
}

wmake () {
	make $@
	deps=$(make -nBd $@ | grep 'No need' | cut -d '`' -f 2 | cut -d "'" -f 1)
	echo Watching: $(echo $deps | tr "\n" " ")
	fswatch -1 $deps | xargs -n1 -I{} wmake $@
}

export -f wmake

wmake $@
