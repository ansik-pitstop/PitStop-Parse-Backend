var http = require("http");
var Parse = require("Parse").Parse;

// initialize the Parse
Parse.initialize("zLnXL3QTYZ7SSkdIuS7rAo2EmwCA0Tm4kfgpP8SU", "Fk0RC4Lj1wwWWyUJZooS60HOe5i8UPWraJoozHFL");
var Service = Parse.Object.extend("Service");

// config
var API_KEY = "dfzumkss4nmcp6pu2uh8gssv";
var id_counter = 0;

var saveToDatabase = function (carID) {

    // the http call options
var options = {
    host: "api.edmunds.com",
    path: "/v1/api/maintenance/actionrepository/findbymodelyearid?modelyearid=" + carID + "&fmt=json&api_key=" + API_KEY
}

http.request(options, function (response) {

  var str = '';
  //another chunk of data has been recieved, so append it to `str`
  response.on('data', function (chunk) {
    str += chunk;
  });

  //the whole response has been recieved, so we just print it out here
  response.on('end', function () {
    storeInDatabase(JSON.parse(str))
  });
    
}).end();

// storing the stuff in the database
var storeInDatabase = function (json) {
 console.log(json);
    for (var i = 0; i < json.actionHolder.length; i++) {
        
        var serviceObject = new Service();
        serviceObject.set("item",  json.actionHolder[i].item);
        serviceObject.set("action",  json.actionHolder[i].action);
        serviceObject.set("description",  json.actionHolder[i].itemDescription);
        serviceObject.set("intervalMileage",  json.actionHolder[i].intervalMileage);
        serviceObject.set("Id",  id_counter);
        serviceObject.set("EdmundsId", json.actionHolder[i].id);
        id_counter++;
        
            serviceObject.save(null, {
        
        success: function(serviceObject) {
            console.log("Success");
        },
        error: function (serviceObject, error) {
            console.log(error);
        }
            
    }); 
        

    }

    
}
    
};


var options = {
    host: "api.edmunds.com",
    path: "/v1/api/maintenance/actionrepository/findmodelyearidswithmaintenanceschedule?fmt=json&api_key=" + API_KEY
}

http.request(options, function (response) {

  var str = '';
  //another chunk of data has been recieved, so append it to `str`
  response.on('data', function (chunk) {
    str += chunk;
  });

  //the whole response has been recieved, so we just print it out here
  response.on('end', function () {
      
      var json = JSON.parse(str);
      console.log(json.longListHolder.length);
      
      for (var i = 0; i < json.longListHolder.length;i++) {
        if (i % 3000 == 0) {
            saveToDatabase(json.longListHolder[i]);
        }
      }
      
  });
    
}).end();
