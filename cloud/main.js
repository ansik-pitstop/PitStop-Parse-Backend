// this is what sends notifications
Parse.Cloud.afterSave("Notification", function(request) {
    function getQuery(recipients) {
        function getAllQuery(recipients) {
            var queries = undefined;
            var result = [];
            var currRecipient, currQuery = undefined;

            for(var i = 0; i < recipients.length; i++) {
                currRecipient = recipients[i];
                console.log("getting query for installtion " + currRecipient);
                currQuery = new Parse.Query(Parse.Installation);
                currQuery.equalTo('installationId', currRecipient);
                result.push(currQuery);
            }

            console.log("# of quieries: " + result.length);

            if (result.length >= 1) {
                console.log("combining query #0");
                queries = result[0];
                for (var i = 1; i < result.length; i++) {
                    console.log("combining query #" + String(i));
                    queries = Parse.Query.or(queries, result[i]);
                }
            }
            return queries;
        }

        // won't send to everyone
        return Parse.Query.or(getAllQuery(recipients));
    }
    //push notification
    var notification = request.object;
    var content = notification.get("content"); //to enable ios push
    var title = notification.get("title");
    var recipients = notification.get("recipients");

    if (!notification.existed()) {
        // send push message only when saving for the first time
        // send the notification to the column 'recipient'

        if (typeof(recipients) !== "object" || recipients.length <= 0) {
            console.log("# of recipients less than 1, push notification request ignored");
            return;
        }
        else {
            return Parse.Push.send({
                where: getQuery(recipients),
                badge: "Increment",
                data: {
                    // you can add more variables here
                    alert: content,
                    title: title
                }
            }, {useMasterKey: true}).then(function(result) {
                console.log("push notification successfully sent to " + recipients.length + " devices");
                console.log("response from Parse: " + JSON.stringify(result));
            }, function(error) {
                console.error("error when sending push notification to device " + recipient);
                console.error(error.stack);
            });
        }
    }
});