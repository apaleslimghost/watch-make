const spawn = require('cross-spawn');
const formatArgs = require('@quarterto/format-cli-args');
const emptyLine = require('@quarterto/print-empty-line');
const nthback = require('@quarterto/nthback');
const chokidar = require('chokidar');
const chalk = require('chalk');
const pluralize = require('pluralize');
const path = require('path');
const fs = require('mz/fs');
const debounce = require('lodash.debounce');
const highland = require('highland');
const readline = require('readline');
const wordwrap = require('wordwrap');

const log = require('./logger');
const parseMakeOutput = require('./parse-make-output');

const makeEnv = Object.assign({
	FORCE_COLOR: '1'
}, process.env);

function make(args) {
	return spawn('make', formatArgs(args, {equals: true}), {env: makeEnv});
}

const getAllWatched = watched => Object.keys(watched).reduce(
	(files, dir) => files.concat(watched[dir].map(file => path.join(dir, file))),
	[]
).map(
	file => path.relative(process.cwd(), file)
);

let currentlyRunning = false;
let wrap;

const rewrap = () => {
 wrap = wordwrap(process.stdout.columns - 4);
};

process.stdout.on('resize', rewrap);
rewrap();

const logWrapped = (level, data) => {
	wrap(data).split('\n').forEach(log[level]);
};

const printWatched = (watched) => {
	const files = watched.length;
	log.watching(`watching ${files} ${pluralize('file', files)}`);
};

function runMake(args, watcher) {
	if(currentlyRunning) return;
	currentlyRunning = true;

	const makeCommand = chalk.grey.italic(`make ${formatArgs({_: args})}`.trim());
	log.running(`running ${makeCommand}`);

	const child = make({
		debug: 'v',
		_: args
	});

	let error;
	let fatal = false;
	const foundPrereqs = new Set();
	const foundTargets = new Set();

	highland(child.stdout).split().each(line => {
		const {type, data} = parseMakeOutput(line);
		switch(type) {
			case 'line':
				logWrapped('message', data);
				break;
			case 'file':
				foundPrereqs.add(data);
				break;
			case 'dependency':
				foundTargets.add(data.fromFile);
				break;
		}
	});

	highland(child.stderr).split().each(line => {
		const {type, data} = parseMakeOutput(line);
		switch(type) {
			case 'line':
				logWrapped('error', data);
				break;
			case 'taskError':
				error = `${makeCommand} exited with error ${data}`;
				break;
			case 'makeError':
				error = data;
				fatal = true;
				break;
			case 'syntaxError':
				error = `make syntax error: ${data.syntaxErrorMsg} on line ${data.lineNo}`;
				break;
		}
	});

	child.on('close', (code, signal) => {
		const watched = getAllWatched(watcher.getWatched());

		watched.forEach(target => foundPrereqs.delete(target));
		foundTargets.forEach(target => foundPrereqs.delete(target));

		Promise.all(
			Array.from(foundPrereqs).map(file => fs.stat(file).then(stat => ({file, dir: stat.isDirectory()})))
		).then(files => {
			const nonDirs = files.filter(({dir}) => !dir).map(({file}) => file);

			function finalLine() {
				if(signal) {
					log.failure(`make died with signal ${signal}`);
					fatal = true;
				} else {
					if(code === 0) {
						log.success(`${makeCommand}`);
					} else {
						log.failure(error || `${makeCommand} exited with code ${code}`);
					}

					printWatched(getAllWatched(watcher.getWatched()));
				}

				currentlyRunning = false;
				emptyLine();

				if(fatal) {
					return process.exit(1);
				}
			}

			if(nonDirs.length) {
				let calls = 0;
				watcher.on('add', function onAdd() {
					if(++calls === nonDirs.length) {
						watcher.removeListener('add', onAdd);
						finalLine();
					}
				});
				watcher.add(nonDirs);
			} else {
				finalLine();
			}
		})
	});

	child.on('error', err => {
		if(err.stack) {
			const lines = err.stack.split('\n');
			log.failure(lines[0]);
			log.error(lines.slice(1));
		} else {
			log.failure(err.message || err.toString());
		}

		currentlyRunning = false;
	});
}

module.exports = function(targets = [], options) {
	emptyLine();

	const watcher = chokidar.watch(['makefile']);
	const debouncedMake = debounce(() => runMake(targets, watcher), 50);

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: chalk.cyan('  ❯ '),
	});

	const commands = {
		help(command) {
			if(command) log.question(`i don't know ${chalk.grey.italic(command)}`);
			log.info('commands you can enter');
			log.message(Object.keys(commands));
			rl.prompt();
		},

		rebuild() {
			debouncedMake();
		},

		files() {
			const watched = getAllWatched(watcher.getWatched());
			printWatched(watched);
			log.message(watched);
			rl.prompt();
		},

		exit() {
			process.stdout.write('\r');
			log.goodbye('goodbye');
			process.exit(0);
		}
	}

	rl.on('SIGINT', () => {
		commands.exit();
	});

	rl.on('line', line => {
		emptyLine();
		const command = line.trim();
		commands[command] ? commands[command]() : commands.help(command);
	});

	watcher.on('change', file => {
		process.stdout.write('\r');
		log.changed(`changed ${chalk.grey.italic(file)}`);
		debouncedMake();
	});

	debouncedMake();
};
