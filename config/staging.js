var globalConfig = {
	port: 8081,
    databaseURI: 'mongodb://parse-production:passwordPitstop@52.22.48.116:21127/push-notification-dev',
    serverURL: 'http://localhost:8081/parse',
    appId: 'ZYOmoKuYsa2LtOKPnBW7dGLNpYbYhZGHb6EBfl3S',
    secrets: {
        masterKey: 'TuBA6HGyIIut11ugvGjWG19jk9ba6JN8fgzZ6VYc',
        javascriptKey: 'Vp0B93iCy8km2nvUYAJUcqUjlIpuEmXs5eUCvZzN'
    },
    android: {
        senderId: '309712221750', // The Sender ID of GCM
        apiKey: 'AAAASBxJdjY:APA91bFWLjtUSjYcyKwY7ZsWpXarFEmMjrQRS1VOanKd7HtjUkbtxh68ETOqPDLC650TNOZn_n61oBVRCz3rt4b-qrSlKCQay7m83CR0OCyxHe2_iaXjmxQ9fN3N3pHe8xR8-N_jrEywoSddsQg8vD1FhHIUSbD3bw' // The Server API Key of GCM
    },
    ios: {
        pfx: './secrets/dev_push_dev2.p12', // Dev PFX or P12
        bundleId: 'com.ansik.pitstop2',
        production: false // Dev
    }
};

module.exports = {
    globalConfig: globalConfig
};