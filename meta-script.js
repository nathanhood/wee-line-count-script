var server = require('https');
var fs = require('fs');

var options = {
	key: fs.readFileSync('./ssl/key.pem'),
	cert: fs.readFileSync('./ssl/cert.pem')
};

server.createServer(options, function (req, res) {
}).listen(3000);

console.log('Node server listening. Port: ' + 3000);

var apiResponses = {};

retrieveMixinFile();
retrieveVariablesFile();

// Retrieve all JS file names from wee/script directory
server.get({
	hostname: 'api.github.com',
	path: '/repos/weepower/wee/contents/public/assets/wee/script',
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
		var jsFileNames = [],
			parsed = data.replace(/['"{}[\]]/g, '').split(',');

		parsed.forEach(function(line) {
			var keyValues = line.split(':').map(function(val) {
				return val.trim();
			});

			if (keyValues[0] === 'name') {
				jsFileNames.push(keyValues[1]);
			}
		});

		retrieveJsFiles(jsFileNames);
	});
}).on('error', function(e) {
	console.log("Got error: " + e.message);
});


// Retrieve and format JS file contents
function retrieveJsFiles(fileNames) {
	var counter = 1,
		jsFiles = {};

	fileNames.forEach(function(file) {
		server.get({
			hostname: 'api.github.com',
			path: '/repos/weepower/wee/contents/public/assets/wee/script/' + file,
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
				jsFiles[file] = data;

				if (counter === fileNames.length) {
					apiResponses.scripts = jsFiles;
					if (requestsComplete(apiResponses)) {
						createFile(apiResponses);
					} else {
						return;
					}
				}
				counter++;
			});
		}).on('error', function(e) {
			console.log("Got error: " + e.message);
		});
	});
}

// retrieve mixin file from github
function retrieveMixinFile() {
	server.get({
		hostname: 'api.github.com',
		path: '/repos/weepower/wee/contents/public/assets/wee/style/wee.mixins.less',
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
			apiResponses.mixins = data;

			if (requestsComplete(apiResponses)) {
				createFile(apiResponses);
			} else {
				return;
			}
		});
	});
}

// retrieve variables file from github
function retrieveVariablesFile() {
	server.get({
		hostname: 'api.github.com',
		path: '/repos/weepower/wee/contents/public/assets/wee/style/wee.variables.less',
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
			apiResponses.variables = data;

			if (requestsComplete(apiResponses)) {
				createFile(apiResponses);
			} else {
				return;
			}
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

// find variable names and line numbers in Mixin file
function parseMixins(file) {
	// var data = fs.readFileSync('assets/wee/style/wee.mixins.less', 'utf8').split('\n');
	var data = file.split('\n'),
		mixins = {};

	data.forEach(function(line, index) {
		if (index > 2) {
			if (/^\/\/ /.test(line)) {
				var mixinCat = line.replace('\/\/ ', '').replace(' \/\/', '');

				mixins[mixinCat] = index + 1;
			}
		}
	});

	return mixins;
}

// find variable names and line numbers in variable files
function parseVariables(file) {
	// var data = fs.readFileSync('assets/wee/style/wee.variables.less', 'utf8').split('\n');
	var data = file.split('\n'),
		variables = {};

	data.forEach(function(line, index) {
		var parsed = line.split(':');

		if (index > 2) {
			if (/\/\/ /.test(parsed[0]) && / \/\//.test(parsed[0])) {
				var varSubject = parsed[0].replace('// ', '').replace(' //', '');
				variables[varSubject] = index + 1;
			}
		}
	});

	return variables;
}

// create JSON file with results from parsing
function createFile(responses) {
	var finalJSON = {};

	finalJSON.scripts = parseJSFiles(responses.scripts);
	finalJSON.mixins = parseMixins(responses.mixins);
	finalJSON.variables = parseVariables(responses.variables);

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