const ignoreRegex = [
	/^GNU Make/,
	/^Copyright/,
	/^This is free software/,
	/^There is NO warranty/,
	/^PARTICULAR PURPOSE/,
	/^This program built for/,
	/^Reading makefile/,
	/Pruning file/,
	/Updating goal targets/,
	/Considering target/,
	/Must remake target/,
	/Successfully remade target/,
	/Finished prerequisites of target/,
	/always-make flag/,
	/does not exist/,
];

module.exports = line => {
	const [isFile, file] = line.match(/^\s*No need to remake target `(.+)'/) || [];
	const [isTaskError, errorCode] = line.match(/^make: \*\*\* \[.+\] Error (\d+)/) || [];
	const [isMakeError, makeErrorMessage] = line.match(/^make:(?: \*\*\*)? (.+)(?:\. *Stop\.)?/) || [];
	const [isSyntaxError, lineNo, syntaxErrorMsg] = line.match(/^makefile:(\d+):(?: \*\*\*)? (.+)\. *Stop\./) || [];
	const [isDependency, toFile, fromFile] = line.match(/Prerequisite `(.+)' (?:is (?:old|new)er than|of) target `(.+)'/) || [];
	const isEmpty = line.trim() === '';
	const ignore = ignoreRegex.some(regex => regex.test(line));

	return isFile        ? {type: 'file', data: file}
	     : isTaskError   ? {type: 'taskError', data: errorCode}
			 : isMakeError   ? {type: 'makeError', data: makeErrorMessage}
			 : isSyntaxError ? {type: 'syntaxError', data: {lineNo, syntaxErrorMsg}}
	     : isDependency  ? {type: 'dependency', data: {fromFile, toFile}}
	     : isEmpty       ? {type: 'empty', data: line}
	     : !ignore       ? {type: 'line', data: line}
	     : {};
};
