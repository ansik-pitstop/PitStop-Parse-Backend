var globalConfig = {
	port: 8081,
    databaseURI: 'mongodb://parse-production:passwordPitstop@52.22.48.116:21127/push-notification-production',
    serverURL: 'http://localhost:8081/parse',
    appId: 'uURx2iGflDgd5SUydxUdCUDjL6jfj4qHIPeNcEeb',
    secrets: {
        masterKey: 'TuBA6HGyIIut11ugvGjWG19jk9ba6JN8fgzZ6VYc',
        // javascriptKey: 'oryYI9Dj65swekmA6RyYp0zlJ9hBghqU0sAAM4Uj'
    },
    android: {
        clientKey: "android",
        senderId: '309712221750', // The Sender ID of GCM
        apiKey: 'AAAASBxJdjY:APA91bFWLjtUSjYcyKwY7ZsWpXarFEmMjrQRS1VOanKd7HtjUkbtxh68ETOqPDLC650TNOZn_n61oBVRCz3rt4b-qrSlKCQay7m83CR0OCyxHe2_iaXjmxQ9fN3N3pHe8xR8-N_jrEywoSddsQg8vD1FhHIUSbD3bw' // The Server API Key of GCM
    },
    ios: {
        clientKey: "ios",
        pfx: './secrets/prod_push_prod.p12', // Prod PFX or P12
        bundleId: 'pitstop.ansik.ios.appstore',
        production: true // Prod
    }
};

module.exports = {
    globalConfig: globalConfig
};