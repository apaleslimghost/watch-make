#!/bin/bash

set -e
shopt -s nocasematch

if [[ $0 == $(npm bin)* ]]; then
	readonly NPM_BIN="$(npm root)/watch-make/node_modules/.bin"
else
	readonly NPM_BIN="$(npm root -g)/watch-make/node_modules/.bin"
fi

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
chalk="$NPM_BIN/chalk"
hr="$NPM_BIN/hr"

loaddeps() {
	echo "[$(echo make | $chalk blue)]  loading dependencies"
	olddeps=$deps
	deps=$(make -nBd $@ | grep 'No need' | cut -d '`' -f 2 | cut -d "'" -f 1)
	filecount=$(echo $deps | tr " " "\n" | wc -l)
	echo "[$(echo make | $chalk blue)]  loaded" $filecount "dependenc$([ $filecount == '1' ] && 'y' || echo 'ies')"
}

runmake() {
	echo "[$(echo make | $chalk blue)]  $(echo running | $chalk gray) make $@"
	$hr -w $(tput cols) | $chalk gray
	make $@ || {
		exitcode=$?
		echo "[$(echo error | $chalk red)] $(echo make $@ | $chalk gray) exited with code $(echo $exitcode | chalk red)"
	}
}

fswait() {
	echo "[$(echo watch | $chalk green)]" watching $filecount "file"$([ $filecount == '1' ] || echo 's')
	changed=$(fswatch -1 $deps)
	echo "[$(echo watch | $chalk green)] $(echo $changed | $chalk gray) changed"
	$hr -w $(tput cols) | $chalk gray
	if [[ "$changed"  == *makefile ]]; then
		loaddeps $@

	 	if [ "$olddeps" != "$deps" ]; then
			return 0
		else
			noloaddeps='1'
			echo "[$(echo watch | $chalk green)] no change to dependencies, remaking"
			return 1 # signals to the loop to remake
		fi
	else
		return 1
	fi
}

_wmake() {
	if [ "$noloaddeps" == '1' ]; then
		noloaddeps='0'
	else
		loaddeps $@
	fi
	runmake $@

	while fswait $@; do
		:
	done

	_wmake $@
}

_wmake $@
