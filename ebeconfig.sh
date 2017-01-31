case $1 in
staging) 

echo \
$"option_settings:
  aws:elasticbeanstalk:application:environment:
    PARSE_MOUNT: \"/parse\"
    APP_ID: \"ZYOmoKuYsa2LtOKPnBW7dGLNpYbYhZGHb6EBfl3S\"
    MASTER_KEY: \"TuBA6HGyIIut11ugvGjWG19jk9ba6JN8fgzZ6VYc\"
    DATABASE_URI: \"mongodb://parse-production:passwordPitstop@52.22.48.116:21127/push-notification-dev\"
    NODE_ENV: \"staging\"
    SERVER_URL: \"http://parseserverpush-staging.us-west-2.elasticbeanstalk.com/parse\"
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: \"node index.js" > .ebextensions/app.config
    ;;

production)

echo \
$"option_settings: 
  aws:elasticbeanstalk:application:environment: 
    PARSE_MOUNT: \"/parse\" 
    APP_ID: \"uURx2iGflDgd5SUydxUdCUDjL6jfj4qHIPeNcEeb\"
    MASTER_KEY: \"TuBA6HGyIIut11ugvGjWG19jk9ba6JN8fgzZ6VYc\"
    DATABASE_URI: \"mongodb://parse-production:passwordPitstop@52.22.48.116:21127/push-notification-production\"
    NODE_ENV: \"production\"
    SERVER_URL: \"http://parseserverpush-production.us-west-2.elasticbeanstalk.com/\"
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: \"node index.js" > .ebextensions/app.config
    ;;
*) 
echo $"Usage: bash $0 {staging|production}"
exit 1
;;
esac