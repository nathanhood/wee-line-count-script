var server = require('https');
var fs = require('fs');

var options = {
	key: fs.readFileSync('./ssl/key.pem'),
	cert: fs.readFileSync('./ssl/cert.pem')
};

server.createServer(options, function () {
}).listen(3000);

console.log('Node server listening. Port: ' + 3000);

var apiResponses = {},
	hostname = 'api.github.com',
	treePath = '/repos/weepower/wee/git/trees/7b1207b95e345651eb25d17eee13fff42bd7bc72?recursive=1',
	contentPath = '/repos/weepower/wee/contents/',
	branch = '?ref=2.1.0',
	fileCount = 0;
	// scriptPath = rootPath + '/assets/wee/script',
	// stylePath = rootPath + '/assets/wee/style';


// retrieveMixinFile();
// retrieveVariablesFile();

// Retrieve entire tree path (based on SHA number)
server.get({
	hostname: hostname,
	path: treePath,
	headers: {
		'user-agent': 'weepower'
	}
}, function(res) {
	var data = "";

	res.on('data', function (chunk) {
		data += chunk;
	});

	res.on('end', function(){
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
					path = keyValues[1];

				if (segments[3] === 'script') {
					filePaths.script.push(path);
				} else if (segments[3] === 'style') {
					filePaths.style.push(path);
				}
			}
		});

		var filtered = filterFilePaths(filePaths);
		countPaths(filtered);
		getFiles(filtered);
	});
}).on('error', function(e) {
	console.log("Got error: " + e.message);
});

function countPaths(filePaths) {
	var keys = Object.keys(filePaths);

	keys.forEach(function(type) {
		fileCount += filePaths[type].length;
	});
}

// filter out directories, JSCS, JSHint and other unwanted Files
function filterFilePaths(filePaths) {
	filePaths.script = filePaths.script.filter(function(path) {
		var segments = path.split('/');
		if (segments[4] && /.js$/.test(segments[4])) {
			return true;
		} else if (segments[5]) {
			return true;
		} else {
			return false;
		}
	});

	filePaths.style = filePaths.style.filter(function(path) {
		var segments = path.split('/');

		if (segments[4] === 'wee.mixins.less') {
			return true;
		} else if (segments[4] === 'wee.variables.less') {
			return true;
		} else {
			return false;
		}
	});

	return filePaths;
}

// retrieve all files from github -- individual request per file needed
function getFiles(filePaths) {
	var counter = 1,
		jsFiles = {},
		keys = Object.keys(filePaths);

	keys.forEach(function(fileType) {
		filePaths[fileType].forEach(function(path) {
			server.get({
				hostname: 'api.github.com',
				path: contentPath + path + branch,
				headers: {
					'user-agent': 'weepower',
					'Accept': 'application/vnd.github.v3.raw+json'
				}
			}, function(res) {
				var data = "";

				res.on('data', function (chunk) {
					data += chunk;
				});

				res.on('end', function(){
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
			}).on('error', function(e) {
				console.log("Got error: " + e.message);
			});
		});
	});
}

// check to see if all github responses have been received
function requestsComplete(responses) {
	var resNames = Object.keys(responses);

	if (resNames.length === 3) {
		return true;
	} else {
		return false;
	}
}

// find variable names and line numbers in JS files
function parseJSFiles(files) {
	var fileNames = Object.keys(files),
		script = {};

	fileNames.forEach(function(file) {
		script[file] = {};

		var data = files[file].replace(/\t+/g, '').split('\n');

		data.forEach(function(line, index) {
			var parsed = line.split(':');

			if (/^[$a-zA-Z]+$/.test(parsed[0]) && /^ function/.test(parsed[1])) {
				script[file][parsed[0]] = index + 1;
			}
		});
	});
	return script;
}

// find category titles and line numbers in style files
function parseStyleFiles(file) {
	var data = file.split('\n'),
		variables = {};

	data.forEach(function(line, index) {
		line = line.trim();

		if (/# /.test(line)) {
			var category = line.replace('# ', '');
			variables[category] = index + 1;
		}
	});

	return variables;
}

// create JSON file with results from parsing
function createFile(responses) {
	var finalJSON = {};

	finalJSON.scripts = parseJSFiles(responses.scripts);
	finalJSON.mixins = parseStyleFiles(responses.mixins);
	finalJSON.variables = parseStyleFiles(responses.variables);

	fs.writeFile('line-counts.json', JSON.stringify(finalJSON, null, 4), function (err) {
		if (err) {
			console.log(err);
			process.exit();
		} else {
			console.log('Wee line counts gathered and file is saved!');
			process.exit();
		}
	});
}