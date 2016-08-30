const {spawn} = require('child_process');
const formatArgs = require('@quarterto/format-cli-args');
const emptyLine = require('@quarterto/print-empty-line');
const nthback = require('@quarterto/nthback');
const chokidar = require('chokidar');
const chalk = require('chalk');
const split = require('split');
const pluralize = require('pluralize');
const path = require('path');
const fs = require('mz/fs');
const debounce = require('lodash.debounce');

const log = require('./logger');
const parseMakeOutput = require('./parse-make-output');

function make(args) {
	const child = spawn('make', formatArgs(args, {equals: true}));
	child.stdout = child.stdout.pipe(split());
	child.stderr = child.stderr.pipe(split());
	return child;
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
		'no-builtin-rules': true,
		'no-builtin-variables': true,
		debug: 'v',
		_: args
	});

	let error;
	const foundPrereqs = new Set();
	const foundTargets = new Set();

	child.stdout.on('data', function(line) {
		const {type, data} = parseMakeOutput(line);
		switch(type) {
			case 'line':
				log.message(data);
				break;
			case 'file':
				foundPrereqs.add(data);
				break;
			case 'taskError':
				error = `make task exited with error ${data}`;
				break;
			case 'syntaxError':
				error = `make syntax error: ${data.errorMsg} on line ${data.lineNo}`;
				break;
			case 'dependency':
				foundTargets.add(data.fromFile);
				break;
		}
	});

	child.stderr.on('data', line => {
		if(line.trim()) log.error(line.trim());
	});

	child.on('exit', code => {
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
				if(code === 0) {
					const noFiles = getAllWatched(watcher.getWatched()).length;
					log.success(`watching ${noFiles} ${pluralize('file', noFiles)}`);
				} else {
					log.failure(error || `make exited with code ${code}`);
				}

				emptyLine();
				currentlyRunning = false;
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
	watcher.on('change', file => {
		log.changed(`changed ${chalk.grey.italic(file)}`);
		debouncedMake();
	});

	debouncedMake();
};
