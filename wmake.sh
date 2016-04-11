#!/bin/bash

set -e

readonly PROGDIR="$(npm root -g)/watch-make"

fswatch --version | grep Enrico > /dev/null || {
	cat <<EOF
fswatch not found or incompatible version

fswatch >1.3 <1.9 by Enrico Crisostomo is required.
It is available at http://emcrisostomo.github.io/fswatch/
or in Homebrew: `brew install fswatch`
EOF
	exit 1
}

fswatch --version | grep 1.9 > /dev/null && {
	cat <<EOF
You are using fswatch version 1.9.x.

fswatch 1.9 has a bug that causes it to hang when called
with --one-event, which watch-make requires. Until
https://github.com/emcrisostomo/fswatch/issues/118
is fixed, downgrade to 1.8.

See http://stackoverflow.com/a/4158763/ for how to install
old versions of a Homebrew package.
EOF
	exit 2
}

export FORCE_COLOR=1
chalk="$PROGDIR/node_modules/.bin/chalk"

_wmake() {
	echo "[$(echo make | $chalk blue)] $(echo running | $chalk gray) make $@"
	hr -w $(tput cols) | $chalk gray
	make $@
	deps=$(make -nBd $@ | grep 'No need' | cut -d '`' -f 2 | cut -d "'" -f 1)
	filecount=$(echo $deps | tr " " "\n" | wc -l)
	echo "[$(echo watch | $chalk green)]" watching $filecount "file"$([ $filecount == '1' ] || echo 's')

	changed=$(fswatch -1 $deps)
	echo "[$(echo watch | $chalk green)] $(echo $changed | $chalk gray) changed"
	hr -w $(tput cols) | $chalk gray
	_wmake $@
}

_wmake $@
