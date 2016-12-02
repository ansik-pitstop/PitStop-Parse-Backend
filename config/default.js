const path = require('path');


var config = {};

const environment = process.env.ENVIRONMENT || "staging";


config.environment = environment.toLowerCase();

config.port = process.env.PORT || 10010; // 10010 - default port


config.secrets = {
}


module.exports = {
    globalConfig: config
};
