// environmnet variable update

module.exports = function() {
    if (!process.env.ENVIRONMENT) { process.env.ENVIRONMENT = 'dev'; } // default environment
    if (!process.env.NODE_ENV) { process.env.NODE_ENV = process.env.ENVIRONMENT; }
}
