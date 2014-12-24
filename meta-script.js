var server = require('https'),
	fs = require('fs'),
	auth = 'Basic ' + new Buffer(process.env.USER + ':' + process.env.PASS).toString('base64'),
	apiResponses = {},
	hostname = 'api.github.com',
	contentPath = '/repos/weepower/wee/contents/',
	branch = '?ref=2.1.0';

function getData(options, callback) {
	server.get(options, function(res) {
		var data = '';

		res.on('data', function(chunk) {
			data += chunk;
		});

		res.on('end', function() {
			callback(data);
		});
	}).on('error', function(e) {
		console.log('Got error: ' + e.message);
	});
}

function countPaths(filePaths) {
	var fileCount = 0;

	Object.keys(filePaths).forEach(function(type) {
		fileCount += filePaths[type].length;
	});

	return fileCount;
}

// Filter out directories, JSCS, JSHint and other unwanted Files
function filterFilePaths(filePaths) {
	return {
		script: filePaths.script.filter(function(path) {
			var segments = path.split('/');

			return (segments[4] && /.js$/.test(segments[4])) || segments[5];
		}),
		style: filePaths.style.filter(function(path) {
			var segments = path.split('/');

			return segments[4] === 'wee.mixins.less' || segments[4] === 'wee.variables.less';
		})
	};
}

// Find variable names and line numbers in JS files
function parseJSFiles(files) {
	var script = {};

	Object.keys(files).forEach(function(file) {
		script[file] = {};

		var data = files[file].replace(/\t+/g, '').split('\n');

		data.forEach(function(line, i) {
			var parsed = line.split(':');

			if (/^[$a-zA-Z]+$/.test(parsed[0]) && /^ function/.test(parsed[1])) {
				script[file][parsed[0]] = i + 1;
			}
		});
	});

	return script;
}

// Find category titles and line numbers in style files
function parseStyleFiles(file) {
	var data = file.split('\n'),
	variables = {};

	data.forEach(function(line, i) {
		line = line.trim();

		if (/# /.test(line)) {
			var category = line.replace('# ', '');

			variables[category] = i + 1;
		}
	});

	return variables;
}


// Start of script
// Determine SHA number of last commit for desired branch
getData({
	hostname: hostname,
	path: '/repos/weepower/wee/git/refs/heads/' + process.env.BRANCH,
	headers: {
		'user-agent': 'weepower',
		'authorization': auth
	}
}, function(data) {
	var treePath = '/repos/weepower/wee/git/trees/' + JSON.parse(data).object.sha + '?recursive=1';

	getTree(treePath);
});

// Retrieve entire tree path (based on SHA number)
function getTree(treePath) {
	getData({
		hostname: hostname,
		path: treePath,
		headers: {
			'user-agent': 'weepower',
			'authorization': auth
		}
	}, function(data) {
		var filePaths = {
				script: [],
				style: []
			},
			parsed = data.replace(/['"{}[\]]/g, '').split(',');

		parsed.forEach(function(line) {
			var keyValues = line.split(':').map(function(val) {
				return val.trim();
			});

			if (keyValues[0] === 'path' && /^public\/assets\/wee/.test(keyValues[1])) {
				var segments = keyValues[1].split('/'),
					path = keyValues[1],
					type = segments[3];

				if (type === 'script') {
					filePaths.script.push(path);
				} else if (type === 'style') {
					filePaths.style.push(path);
				}
			}
		});

		var filtered = filterFilePaths(filePaths);

		getFiles(filtered);
	});
}

// Retrieve all files from GitHub -- individual request per file needed
function getFiles(filePaths) {
	var jsFiles = {},
		fileCount = countPaths(filePaths),
		counter = 1,
		keys = Object.keys(filePaths);

	keys.forEach(function(fileType) {
		filePaths[fileType].forEach(function(path) {
			getData({
				hostname: 'api.github.com',
				path: contentPath + path + branch,
				headers: {
					'user-agent': 'weepower',
					'authorization': auth,
					'Accept': 'application/vnd.github.v3.raw+json'
				}
			}, function(data) {
				var segments = path.split('/'),
					file = segments[(segments.length - 1)];

				if (/.js$/.test(file)) {
					jsFiles[file] = data;
				} else if (file === 'wee.mixins.less') {
					apiResponses.mixins = data;
				} else if (file === 'wee.variables.less') {
					apiResponses.variables = data;
				}

				if (counter === fileCount) {
					apiResponses.scripts = jsFiles;
					createFile(apiResponses);
				}
				counter++;
			});
		});
	});
}

// Create JSON file with results from parsing
function createFile(responses) {
	var finalJSON = {
		scripts: parseJSFiles(responses.scripts),
		mixins: parseStyleFiles(responses.mixins),
		variables: parseStyleFiles(responses.variables)
	};

	fs.writeFile('line-counts.json', JSON.stringify(finalJSON, null, '\t'), function(err) {
		if (err) {
			console.log(err);
		} else {
			console.log('Wee line counts gathered and file is saved!');
		}
	});
}