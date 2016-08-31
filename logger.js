const symbolLogger = require('@quarterto/symbol-logger');
const chalk = require('chalk');

module.exports = symbolLogger({
	running: {
		symbol: '⛭',
		format: 'blue',
	},

	success: {
		symbol: '✔︎',
		format: 'green',
	},

	failure: {
		symbol: '✘',
		format: chalk.red.bold,
	},

	message: {
		symbol: '│',
		formatLine: 'grey',
	},

	error: {
		symbol: '┃',
		format: 'red',
	},

	info: {
		symbol: 'ℹ︎',
		format: 'cyan',
	},

	question: {
		symbol: '?',
		format: chalk.magenta.bold,
	},

	changed: {
		symbol: '✏︎',
		format: 'magenta',
	},

	goodbye: '👋 ',
});
