const {spawn} = require('child_process');
const formatArgs = require('@quarterto/format-cli-args');
const chokidar = require('chokidar');
const chalk = require('chalk');
const split = require('split');
const pluralize = require('pluralize');
const path = require('path');

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

function runMake(args, watcher) {
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

	child.on('close', function(code) {
		getAllWatched(watcher.getWatched())
		.map(file => path.relative(process.cwd(), file))
		.forEach(target => foundPrereqs.delete(target));

		foundTargets.forEach(target => foundPrereqs.delete(target));

		watcher.add(Array.from(foundPrereqs));

		function finalLine() {
			if(code === 0) {
				const noFiles = getAllWatched(watcher.getWatched()).length;
				log.success(`watching ${noFiles} ${pluralize('file', noFiles)}`);
			} else {
				log.failure(error);
			}

			console.log();
		}

		if(foundPrereqs.size) {
			watcher.once('add', finalLine);
		} else {
			finalLine();
		}
	});
}

function main(targets = []) {
	console.log();
	const watcher = chokidar.watch(['makefile']);
	watcher.on('change', file => {
		log.changed(`changed ${chalk.grey.italic(file)}`);
		runMake(targets, watcher)
	});

	runMake(targets, watcher);
}

main();
