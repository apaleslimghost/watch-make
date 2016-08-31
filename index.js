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

const log = require('./logger');
const parseMakeOutput = require('./parse-make-output');

function make(args) {
	return spawn('make', formatArgs(args, {equals: true}));
}

const getAllWatched = watched => Object.keys(watched).reduce(
	(files, dir) => files.concat(watched[dir].map(file => path.join(dir, file))),
	[]
);

let currentlyRunning = false;

function runMake(args, watcher) {
	if(currentlyRunning) return;
	currentlyRunning = true;

	log.running(`running ${chalk.grey.italic(`make ${args.join(' ')}`.trim())}`);

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
				log.message(data);
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
				log.error(data);
				break;
			case 'taskError':
				error = `make task exited with error ${data}`;
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
		const watched = getAllWatched(watcher.getWatched()).map(
			file => path.relative(process.cwd(), file)
		);

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
				} else if(code === 0) {
					const noFiles = getAllWatched(watcher.getWatched()).length;
					log.success(`watching ${noFiles} ${pluralize('file', noFiles)}`);
				} else {
					log.failure(error || `make exited with code ${code}`);
				}

				emptyLine();
				currentlyRunning = false;

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
		prompt: '  ❯ ',
	});

	const commands = {
		help() {
			log.info('Commands you can enter');
			log.message(Object.keys(commands));
			rl.prompt();
		},

		rebuild() {
			debouncedMake();
		},

		files() {
			log.info('Currently watched files');
			log.message(getAllWatched(watcher.getWatched()));
			rl.prompt();
		}
	}

	rl.on('line', line => {
		emptyLine();
		const command = line.trim();
		commands[command] ? commands[command]() : commands.help();
	});

	watcher.on('change', file => {
		emptyLine();
		log.changed(`changed ${chalk.grey.italic(file)}`);
		debouncedMake();
	});

	debouncedMake();
};
