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

fswatch >1.3 by Enrico Crisostomo is required.
It is available at http://emcrisostomo.github.io/fswatch/
or in Homebrew: `brew install fswatch`
EOF
	exit 1
}

fswatchversion=$(fswatch --version | head -1 | cut -d ' ' -f 2)

if [ "$fswatchversion" = '1.9.0' ] || [ "$fswatchversion" = '1.9.1' ]; then
	cat <<EOF
You are using fswatch version $fswatchversion.

Early version of fswatch 1.9 have a bug that causes it to
hang when called with --one-event, which watch-make requires.
This issue is fixed in 1.9.2. Please upgrade your version of
fswatch.
EOF
	exit 2
fi

export FORCE_COLOR=1
chalk="$NPM_BIN/chalk"
hr="$NPM_BIN/hr"

makeerror() {
	local exitcode=$1
	local makeargs=$2
	echo "[$(echo error | $chalk red)] $(echo make $makeargs | $chalk gray) exited with code $(echo $exitcode | $chalk red)"
	if [ "$exitcode" = '2' ]; then
		echo "[$(echo error | $chalk red)] this is a problem with your makefile. make probably complained above"
		exit 122
	fi
}

loaddeps() {
	echo "[$(echo make | $chalk blue)]  loading dependencies"
	olddeps=$deps
	out=$(fifo)
	make -nBd $@ > $out || {
		makeerror $? "$@"
	}

	deps=$(grep 'No need' < $fifo | cut -d '`' -f 2 | cut -d "'" -f 1)
	filecount=$(echo $deps | tr " " "\n" | wc -l)
	echo "[$(echo make | $chalk blue)]  loaded" $filecount "dependenc$([ $filecount == '1' ] && echo 'y' || echo 'ies')"
}

fifo() {
	local tmp="$(mktemp -d /tmp/wmake-XXXXXXX)/pipe"
	mkfifo $tmp
	trap "rm -rf $tmp" EXIT
	echo $tmp
}

runmake() {
	echo "[$(echo make | $chalk blue)]  $(echo running | $chalk gray) make $@ $extramakeargs"
	$hr -w $(tput cols) | $chalk gray
	make $@ $extramakeargs || {
		makeerror $? "$@ $extramakeargs"
	}
	extramakeargs=''
}

fswait() {
	echo "[$(echo watch | $chalk green)]" watching $filecount "file"$([ $filecount == '1' ] || echo 's')
	changed=$(fswatch -1 $deps)

	if [ "$changed" == "" ]; then
		echo "[$(echo wat | $chalk magenta)]   fswatch exited without outputting a path. I assume this means it was killed. Goodbye lol"
		exit 129
	fi

	echo "[$(echo watch | $chalk green)] $(echo $changed | $chalk gray) changed"
	$hr -w $(tput cols) | $chalk gray
	if [[ "$changed"  == *makefile ]]; then
		loaddeps $@

	 	if [ "$olddeps" != "$deps" ]; then
			return 0
		else
			noloaddeps='1'
			extramakeargs='-B'
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
