const path = require('path');


var config = {};

const environment = process.env.ENVIRONMENT || "staging";


config.environment = environment.toLowerCase();


config.secrets = {
}


module.exports = {
    globalConfig: config
};
