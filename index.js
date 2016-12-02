// Example express application adding the parse-server module to expose Parse
// compatible API routes.

var init = require('./init')();

var express = require('express');
var ParseServer = require('parse-server').ParseServer;
var path = require('path');
var config = require('config');

var options = {
  env: config.get('globalConfig.environment')
};

//console.log(config.get('globalConfig.databaseURI'));
//console.log(config.get('globalConfig.environment'));
//console.log(config.get('globalConfig.appId'));
//console.log(config.get('globalConfig.secrets'));
//console.log(config.get('globalConfig.serverURL'));
//console.log(config.get('globalConfig.ios'));
var api = new ParseServer({
  databaseURI: config.get('globalConfig.databaseURI'),
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',
  appId: config.get('globalConfig.appId'),
  masterKey: config.get('globalConfig.secrets.masterKey'), //Add your master key here. Keep it secret!
  serverURL: config.get('globalConfig.serverURL'), // Don't forget to change to https if needed
  javascriptKey: config.get('globalConfig.secrets.javascriptKey'),
  push: {
    android: config.get('globalConfig.android'),
    ios: config.get('globalConfig.ios')
  }
});
// Client-keys like the javascript key or the .NET key are not necessary with parse-server
// If you wish you require them, you can set them as options in the initialization above:
// javascriptKey, restAPIKey, dotNetKey, clientKey

var app = express();

// Serve static assets from the /public folder
app.use('/public', express.static(path.join(__dirname, '/public')));

// Serve the Parse API on the /parse URL prefix
var mountPath = process.env.PARSE_MOUNT || '/parse';
app.use(mountPath, api);

// Parse Server plays nicely with the rest of your web routes
app.get('/', function (req, res) {
  res.status(200).send('Pistop-parse is ready');
});

var port = process.env.PORT || 10011;

if (options.env == "staging") {
  port = 10011;
} else if (options.env == "production") {
  port = 8081;
}

var httpServer = require('http').createServer(app);
httpServer.listen(port, function () {
  console.log('pistop-parse running on port ' + port + '.');
});