var recallMasters = require("cloud/recallMasters.js");
// var testCode = require("cloud/testCode.js");
var sendgrid = require("cloud/sendgrid_personal.js");
sendgrid.initialize("ansik", "Ansik.23");

/*
 Constants + Config
 */

var EDMUNDS_API = {

   host: "api.edmunds.com",
   tail: "fmt=json&api_key=9mu2f8rw93jaxtsj9dqkbtsx",
    requestPaths: {
        makeModelYearId: function (make, model, year) {
            var path = "/api/vehicle/v2/";
            return EDMUNDS_API.host + path + make + "/" + model + "/" + "/" + year + '?' + EDMUNDS_API.tail;
        },
        maintenance: function (Id) {
            console.log("carMakeModelYearId: " + Id);
            var path = "/v1/api/maintenance/actionrepository/findbymodelyearid?modelyearid=";
            return EDMUNDS_API.host + path + Id + '&' + EDMUNDS_API.tail;
        },
        recall: function (Id) {
            console.log("carMakeModelYearId: " + Id);
            var path = "/v1/api/maintenance/recallrepository/findbymodelyearid?modelyearid=";
            return EDMUNDS_API.host + path + Id + '&' + EDMUNDS_API.tail;
        }
    }

};

Parse.Cloud.beforeSave("EdmundsRecall", function(request, response){
    var edmundsId = request.object.get("edmundsId");
    var edmundsQuery = new Parse.Query("EdmundsRecall");
    edmundsQuery.equalTo("edmundsId", edmundsId);
    edmundsQuery.first({
        success: function(data){
            if (data !== undefined){
                //checks if there is existing object in table with service
                response.error("An EdmundsRecall with this edmundsId already exists.");
            }else{
                //if there is not existing object with edmundsId, continue with save
                response.success();
            }
        },
        error: function(error){
            console.error(error);
            response.error("EdmundsRecall BeforeSave query error: "+error);
        }
    });
});

/*
 Car beforeSave: add recall information
*/
Parse.Cloud.beforeSave("Car", function(request, response){
    var car = request.object;
    if (car.isNew()) { // car doesnt exist yet
      car.set("pendingIntervalServices", []);
      car.set("pendingEdmundServices", []);
      car.set("pendingFixedServices", []);
      car.set("storedDTCs", []);

      if (!car.get("baseMileage")) {
        car.set("baseMileage", 0);
      }

      car.set("totalMileage", car.get("baseMileage"));

      // always save the VIN as in uppercase
      // changes oh to 0, i to 1
      car.set("VIN", car.get("VIN").toUpperCase().replace(/I/g, "1").replace(/O/g, "0").replace(/Q/g, "0"));

      // check vin is unique
      if (!car.get("VIN")) {
        response.error('vin must exist');
      } else if (car.get("VIN").length !== 17) {
        response.error('vin must be 17 chars');
      } else {
        var query = new Parse.Query("Car");
        query.equalTo("VIN", request.object.get("VIN"));
        query.first({
          success: function(object) {
            if (object && object.id !== request.object.id) {
              response.error("VIN already exists");
            } else {
              response.success();
            }
          },
          error: function(error) {
            response.error("Could not validate uniqueness for this Car object.");
          }
        });
      }
    } else { // car already existed
      // temporary for main branch
      if(!car.get("pendingIntervalServices")){
        car.set("pendingIntervalServices", []);
      }
      if(!car.get("pendingEdmundServices")){
        car.set("pendingEdmundServices", []);
      }
      if(!car.get("pendingFixedServices")){
        car.set("pendingFixedServices", []);
      }
      if(!car.get("storedDTCs")){
        car.set("storedDTCs", []);
      }

      var numberServices = 0;
      numberServices += car.get("pendingIntervalServices").length +
        car.get("pendingEdmundServices").length +
        car.get("pendingFixedServices").length +
        car.get("storedDTCs").length;
      car.set("numberOfServices", numberServices);
      response.success();
    }
});

/*
 servicehistory aftersave: update services
 */
Parse.Cloud.afterSave("ServiceHistory", function(request){
  if (!request.object.existed()) {
    var carQuery = new Parse.Query("Car");
    carQuery.equalTo("objectId", request.object.get("carId"));
    carQuery.first({
      success: function (car) {
        if(car !== undefined){
          Parse.Cloud.run("carServicesUpdate", {
            carVin: car.get("VIN")
          });
        }
      },
      error: function (error) {
        console.log("service not found");
        console.error(error);
      }
    });
  }
});


/*
 Car aftersave: load calibration services
 */
Parse.Cloud.afterSave("Car", function(request){
    var car = request.object;

    if (!car.existed()) {
      // notification
      if(!Parse.User.current().get("firstCar")){
        var Notification = Parse.Object.extend("Notification");
        var notificationToSave = new Notification();
        var notificationContent = "Welcome to Pitstop!";
        var notificationTitle = "Welcome!";

        notificationToSave.set("content", notificationContent);
        notificationToSave.set("title", notificationTitle);
        notificationToSave.set("toId", Parse.User.current().id);
        notificationToSave.save(null, {
          success: function(notificationToSave){
            //saved
          },
          error: function(notificationToSave, error){
            console.error("Error: " + error.code + " " + error.message);
          }
        });
        Parse.User.current().set("firstCar", true)
        Parse.User.current().save()
      }


      // do recall stuff
      Parse.Cloud.run("recallMastersWrapper", {
        "vin": car.get("VIN"),
        "car": car.id
      });

      var mileage = car.get("totalMileage");
      if (mileage === undefined || mileage === 0) {
        mileage = car.get("baseMileage");
      }

      // do service stuff
      Parse.Cloud.run("carServicesUpdate", {
        carVin: car.get("VIN"),
        mileage: mileage
      }, {
        success: function(result){
          console.log("success: ");
          console.log(result);
        },
        error: function(error){
          console.log(error);
          console.error(error);
        }
      });
    }

  // *** Edmunds is no longer used ***
  //   if (!request.object.existed()){
  // // if (!request.object.existed()){
  //      // making a request to Edmunds for makeModelYearId
  //     Parse.Cloud.httpRequest({
  //         url: EDMUNDS_API.requestPaths.makeModelYearId(
  //             car.get('make'),
  //             car.get('model'),
  //             car.get('year')
  //         ),
  //         success: function (results) {
  //             carMakeModelYearId = JSON.parse(results.text).id;
  //             // saving recalls to database
  //             Parse.Cloud.httpRequest({
  //                 url: EDMUNDS_API.requestPaths.recall(carMakeModelYearId),
  //                 success: function (results) {
  //                     var edmundsRecalls = JSON.parse(results.text).recallHolder;
  //                     console.log("got edmunds recalls");
  //                     Parse.Cloud.run("addEdmundsRecalls", {
  //                             recalls: edmundsRecalls,
  //                             carObject:
  //                             {
  //                                 make: car.get('make'),
  //                                 model: car.get('model'),
  //                                 year: car.get('year')
  //                             }
  //                         }, {
  //                             success: function(result){
  //                                 console.log("success: ")
  //                                 console.log(result)
  //                             },
  //                             error: function(error){
  //                                 console.log("addEdmundsServices error:");
  //                                 console.error(error);
  //                             }
  //                         }
  //                     );
  //
  //                 },
  //                 error: function (error) {
  //                     console.error("Could not get recalls from Edmunds for: " + carMakeModelYearId);
  //                     console.error(error);
  //                 }
  //             });
  //         },
  //         error: function (error) {
  //             console.error("Could not get carMakeModelYearId from Edmunds in car aftersave");
  //             console.error("ERROR: ", error);
  //         }
  //     });
  //     return;
  // }

  //should run job/func here to update services/mileage at an interval
});

 /*
  afterSave Event for Scan Object
  */
// XXX this is a slightly stupid way to do it and should probably be changed
Parse.Cloud.afterSave("Scan", function(request) {

  // getting the scan object
  var scan = request.object;

  // stopping the function if not required
  if (scan.get("runAfterSave") !== true) {
    return;
  }

  var dtcData = scan.get("DTCs");
  if ( dtcData !== undefined && dtcData !== ""){
    Parse.Cloud.run("updateDtcs", {
      scannerId: scan.get("scannerId"),
      carVin: scan.get("carVin"),
      DTCs: dtcData,
      id: scan.id
      }, {
      success: function(result){
        console.log("dtc success: ");
        console.log(result);
      },
      error: function(error){
        console.log(error);
        console.error(error);
      }
    });
  }
});

Parse.Cloud.define("updateDtcs", function(request, response) {
  var scan = request.params;
  var scannerId = scan["scannerId"];
  var carVin = scan["carVin"];

  // query for the car associated with this Scan
  var query = new Parse.Query("Car");

  // currently vin is preferred, but if vin isnt provided we are forced to use scannerid
  // which sometimes isnt filled, or unique.
  if(carVin === undefined && scannerId === undefined){
    response.error("No vin or scannerid provided");
  } else if (carVin === undefined) {
    query.equalTo("scannerId", scannerId);
  } else {
    query.equalTo("VIN", carVin);
  }

  query.first({
    success: function(car) {
      if (car){
        foundCar(car);
      } else {
        response.error("No results for car with VIN: "+ carVin + " or scan id "+scannerId);
      }
    },
    error: function (error) {
      response.error("No results for car with VIN: "+ carVin + " or scan id "+scannerId);
    }
  });

  var foundCar = function (car) {
    // parse dtcs and create notification
    var dtcData = scan["DTCs"];
    console.log("dtcs");
    var dtcs = dtcData.split(",");
    var dtclst = [];
    for (var i = 0; i < dtcs.length; i++){
      //check for DTCs
      if (dtcs[i] !== ""){
        // add if new
        if (car.get("storedDTCs").indexOf(dtcs[i]) === -1){
          car.addUnique("storedDTCs", dtcs[i]);
          // this needs to be run each time... there are too many results for dtcs...
          var query = new Parse.Query("DTC");
          query.equalTo("dtcCode", dtcs[i]);
          query.find({
            success: function (data) {
              if (data.length > 0) {
                dtclst.push(data[0]);
                notify(data[0], car);
              }
            },
            error: function (error) {
              console.error("Could not find the dtc with code: ", dtcs[i]);
            }
          });
        }
      }
    }

    car.save(null, {
      success: function (savedCar) {
        console.log("car saved"); // success for cloud function
      },
      error: function (saveError) {
        console.log("car not saved");
        console.error(saveError);
        response.error("car not saved"); //failure for cloud function
        return;
      }
    }).then(function() {
      if(dtclst.length > 0){
        shopQuery = new Parse.Query("Shop");
        shopQuery.equalTo("objectId", car.get("dealership"));
        shopQuery.first({
          success: function(shop){
              userQuery = new Parse.Query(Parse.User);
              userQuery.equalTo("objectId", car.get("owner"));
              userQuery.first({
                success: function(user){
                   sendEmail (user, car, shop, dtclst);
                },
                error: function (error) {
                  console.error(error);
                  response.error();
                }
              });
           },
           error: function (error) {
             console.log("Error " + error);
             response.error();
           }
        });
      } else {
        response.success();
      }
    }, function(error) {
      response.error("Error: " + error.code + " " + error.message);
    });
  };

  function sendEmail (user, car, shop, dtclst ) {
      var emailHtml = "<h2>Notification sent to customer</h2>";
      emailHtml += "<strong>DTC alert for:</strong> " + user.get("name");
      emailHtml += "<br>";
      emailHtml += "<strong>Customer's Phone Number:</strong> " + user.get("phoneNumber");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle:</strong> " + car.get("make") + " " + car.get("model");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle Year:</strong> " + car.get("year");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle VIN:</strong> " + car.get("VIN");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle Engine:</strong> " + car.get("engine");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle Mileage:</strong> " + car.get("totalMileage");
      emailHtml += "<br>";

      emailHtml += "<h2>Alerts</h2>";
      emailHtml += "<ul>";

      for (i=0; i < dtclst.length; i++) {
        var description = dtclst[i].get("description");
        var dtc = dtclst[i].get("dtcCode");
        emailHtml += "<li>";
        emailHtml += dtc;
        emailHtml += "<br>" + description;
        emailHtml += "</li>";
      }
      emailHtml += "</ul>";

      console.log("sendEmail html");
      console.log(emailHtml);

      var email = sendgrid.Email({to: [shop.get("email")]});
      email.setFrom(user.get("email"));
      email.setSubject("Notification sent to " + user.get("name"));
      email.setSendAt(parseInt(new Date().toUTCString()) + 70*60*60); // 70 hour delay
      email.setHTML(emailHtml);

      sendgrid.sendEmail(email, {
         success: function(httpResponse) {
            console.log(httpResponse);
            console.log("Email sent!");
            response.success("Email sent!");
         },
         error: function(httpResponse) {
            console.error(httpResponse);
            console.log("Error sending email");
            response.error("Error sending email");
         }
      });
   }


  var notify = function(data, car) {
    var description = data.get("description");
    var dtc = data.get("dtcCode");
    var Notification = Parse.Object.extend("Notification");
    var notificationToSave = new Notification();
    var notificationContent = car.get("make") + " " + car.get("model") + " has DTC Code " + dtc + ": "+description;
    var notificationTitle =  car.get("make") + " " + car.get("model") + " has DTC Code "+ dtc;

    notificationToSave.set("content", notificationContent);
    notificationToSave.set("scanId", scan.id);
    notificationToSave.set("title", notificationTitle);
    notificationToSave.set("toId", car.get("owner"));
    notificationToSave.set("carId", car.id);
    notificationToSave.save(null, {
      success: function(notificationToSave){
        //saved
      },
      error: function(notificationToSave, error){
        console.error("Error: " + error.code + " " + error.message);
      }
    });
  };
});


Parse.Cloud.afterSave(Parse.User, function(request, response) {
  Parse.Cloud.useMasterKey();
  var user = request.object;
  // signupEmail is true if we already sent them an email.
  if (request.object.existed() === false){
    // get the html we want to send them
    Parse.Cloud.httpRequest({
        // request the transactional template (see https://sendgrid.com/templates to modify)
        url: 'https://api.sendgrid.com/v3/templates/51576748-6cc8-4f85-b12f-aeff3dca37d4',
        headers: {
          // our api key
          'Authorization': 'Bearer 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',
          'Content-Type': 'application/json',
        },
        success: function(httpResponse) {
          sendgrid.sendEmail({
            to: user.get("email"),
            from: "Pitstop@getpitstop.io",
            subject: "Welcome to Pitstop!",
            html: JSON.parse(httpResponse.text).versions[0].html_content,
            text: ' '
          }, {
             success: function(email) {
                console.log(email);
                console.log("Email sent!");
             },
             error: function(email) {
                console.error(email);
                console.log("Error sending email");
             }
          });
        },
        error: function(httpResponse) {
          console.error(httpResponse);
        }
    });
  }
});


Parse.Cloud.afterSave("Notification", function(request) {
  //push notification
  var notification = request.object;

  var pushQuery = new Parse.Query(Parse.Installation);

  pushQuery.equalTo('userId', notification.get("toId"));

  Parse.Push.send({
    where: pushQuery,
    badge: "Increment",
    data:{
        alert: notification.get("content"), //to enable ios push
        title: notification.get("title")
      }
    }, {
      success: function(){
    },
    error: function(error){
      console.error("Error: "+ error.code + " : " + error.message);
    }
  });

    /*
    var userQuery = new Parse.Query(Parse.User);

    userQuery.equalTo('objectId', notification.get("toId"));
    userQuery.find({
        success: function(userData){
            //send notification email to users

            var email = userData[0]["email"];
            var name = userData[0]["name"];


            var sendgrid = require("sendgrid");
            sendgrid.initialize("ansik", "Ansik.23");

            sendgrid.sendEmail({
                to: [email],
                from: "yashin@ansik.ca",
                subject: notification.get("title"),
                text: notification.get("content"),
                replyto: "yashin@ansik.ca"
            }).then(function(httpResponse) {
                console.log(httpResponse);
                response.success("Email sent");
            },function(httpResponse) {
                console.error(httpResponse);
                response.error("error");
            });

        },
        error: function(error){
            console.error("Could not find user with objectId", notification.get("toId"));
            console.error("ERROR: ", error);
        }
      });*/
});

Parse.Cloud.define("addEdmundsServices", function(request, status) {
    var serviceList = request.params.serviceList;
    var createEdmundsService = function(service, carObject) {
      var Edmunds = Parse.Object.extend("EdmundsService");
      var eService = new Edmunds();

      eService.set('priority', 0);

      // setting priority based on what we put in the service table.
      if (service["frequency"] === 3 || service["frequency"] === 4) {
        for(var i = 0; i < serviceList.length; i++) {
          if((service["item"] === serviceList[i][0]) &&
             (service["action"] === serviceList[i][1])) {
            eService.set('priority', serviceList[i][2]);
          break;
          }
        }
      }

      //set values from carObject
      eService.set("make", carObject["make"]);
      eService.set("model", carObject["model"]);
      eService.set("year", carObject["year"]);
      //set values from service
      eService.set('edmundsId', service["id"]);
      eService.set('engineCode', service["engineCode"]);
      eService.set('transmissionCode', service["transmissionCode"]);
      eService.set('intervalMileage', service["intervalMileage"]);
      eService.set('intervalMonth', service["intervalMonth"]);
      eService.set('frequency', service["frequency"]);
      eService.set('action', service["action"]);
      eService.set('item', service["item"]);
      eService.set('itemDescription', service["itemDescription"]);
      eService.set('laborUnits', service["laborUnits"]);
      eService.set('partUnits', service["partUnits"]);
      eService.set('driveType', service["driveType"]);
      //eService.set('modelYear', service["modelYear"]); //edmunds web api string

      return eService;
    };
    var services = [];

    for (var i = 0; i < request.params.edmundServices.length; i++) {
        if(request.params.edmundServices[i]["intervalMileage"] === 0){
          continue;
        }
        services.push(createEdmundsService(request.params.edmundServices[i], request.params.carObject) );
    }

    Parse.Object.saveAll(services, {
        success: function (data) {
            console.log("service saved");
            status.success("service saved"); // success for cloud function
        },
        error: function (saveError) {
            console.log("service not saved");
            console.error(saveError);
            status.error("service not saved"); //failure for cloud function
        }
    });

});

Parse.Cloud.define("addEdmundsRecalls", function(request, status) {
    var createEdmundsService = function(recall, carObject) {
        var Edmunds = Parse.Object.extend("EdmundsRecall");
        var eRecall = new Edmunds();

        //set values from carObject
        eRecall.set("make", carObject["make"]);
        eRecall.set("model", carObject["model"]);
        eRecall.set("year", carObject["year"]);
        //set values from service
        eRecall.set('edmundsId', recall["id"]);
        eRecall.set('recallNumber', recall["recallNumber"]);
        eRecall.set('componentDescription', recall["componentDescription"]);
        eRecall.set('manufacturerRecallNumber', recall["manufacturerRecallNumber"]);
        eRecall.set('manufacturedTo', recall["manufacturedTo"]);
        eRecall.set('numberOfVehiclesAffected', recall["numberOfVehiclesAffected"]);
        eRecall.set('influencedBy', recall["influencedBy"]);
        eRecall.set('defectConsequence', recall["defectConsequence"]);
        eRecall.set('defectCorrectiveAction', recall["defectCorrectiveAction"]);
        eRecall.set('defectDescription', recall["defectDescription"]);
        //eService.set('modelYear', recall["modelYear"]); //edmunds web api string

        return eRecall;
    };
    var recalls = [];

    for (var i = 0; i < request.params.recalls.length; i++) {
        recalls.push(createEdmundsService(request.params.recalls[i], request.params.carObject) );
    }

    Parse.Object.saveAll(recalls, {
        success: function (data) {
            console.log("recall saved");
            status.success("recall saved"); // success for cloud function
        },
        error: function (saveError) {
            console.log("recall not saved");
            console.error(saveError);
            status.error("recall not saved"); //failure for cloud function
        }
    });
});

Parse.Cloud.define("carServicesUpdate", function(request, response) {
  //request object is scan
  scan = request.params;

  // Initializing variables
  var car = null;
  var carMakeModelYearId = null;
  var carMileage = 0;
  var serviceStack = [];
  var newServices = false;
  var pendingFixed = [];
  var fixedDesc = [];
  var pendingInterval = [];
  var intervalDesc = [];
  var scannerId = scan["scannerId"];
  var carVin = scan["carVin"];
  var edmundsHistory = [];
  var fixedHistory = [];
  var intervalHistory = [];
  var dealerServices = false;
  var serviceList = [];

  // query for the car associated with this Scan
  var query = new Parse.Query("Car");

  // currently vin is preferred, but if vin isnt provided we are forced to use scannerid
  // which sometimes isnt filled, or unique.
  if(carVin === undefined && scannerId === undefined){
    response.error("No vin or scannerid provided");
  } else if (carVin === undefined) {
    query.equalTo("scannerId", scannerId);
  } else {
    query.equalTo("VIN", carVin);
  }

  query.find({
    success: function (cars) {
      if (cars.length > 0){
        foundCar(cars[0]);
      }else{
        response.error("No results for car with VIN: "+scan['carVin']);
      }
    },
    error: function (error) {
      console.error("Could not find the car with VIN: ", scan['carVin']);
      console.error("ERROR9: ", error);
    }
  });

  /*
  This function is called when the car associated with the
  current scan is found
  */
  var foundCar = function (loadedCar) {
    // assigning the loadedCar to global car
    car = loadedCar;
    var scanMileage = scan["mileage"];
    if (scanMileage === undefined){
      scanMileage = 0;
    }

    // setting the car mileage
    if (scanMileage !== 0) {
      carMileage = scanMileage;
    } else {
      if (car.get("totalMileage") === undefined ||
          car.get("totalMileage") === 0) {
        carMileage = car.get("baseMileage") + scanMileage;
      } else {
        carMileage = car.get("totalMileage") + scanMileage;
      }
    }
    car.set("totalMileage", carMileage);

    if (scan["freezeData"] !== undefined){   //exists
      if (scan["freezeData"] !== "[]"){  //not empty
        car.AddUnique("storedFreezeFrames", scan["freezeData"]);
      }
    }

    var ServiceHistoryQuery = new Parse.Query("ServiceHistory");
    ServiceHistoryQuery.equalTo("carId", car.id);
    ServiceHistoryQuery.each(function (history) {
      var type = history.get("type");
      var objID = history.get("serviceObjectId");
      var mileage = history.get("mileage");
      if (type === 0) { // edmunds
        edmundsHistory.push([objID, mileage]);
      } else if (type === 1) { // fixed
        fixedHistory.push([objID, mileage]);
      } else if (type === 2) { // interval
        intervalHistory.push([objID, mileage]);
      }
    }).then(function(){
      if(car.get("dealership")) {
        // DEALER FIXED SERVICES
        var fixed = new Parse.Query("ServiceFixed");
        // filter for same dealership and mileage less than current total
        fixed.equalTo("dealership", car.get("dealership"));
        fixed.each(function (service) {
          dealerServices = true;
          // get the history for this particular service
          var history = false;
          for (var z = 0; z < fixedHistory.length; z++) {
            if (fixedHistory[z][0] === service.id){
              history = true;
            }
          }

          // if no history and within the interval(minus 500) than add it to pendingFixed
          if (!history){
            if(carMileage > service.get("mileage") - 500) {
              pendingFixed.push(service.id);
              fixedDesc.push([service.get("item"),service.get("action")]);
            }
          }
        }).then(function() {
          car.set("pendingFixedServices", pendingFixed);
        }, function(error) {
          alert("Error: " + error.code + " " + error.message);
        });

        // DEALER INTERVAL BASED SERVICE
        var intervals = new Parse.Query("ServiceInterval");
        // filter for same dealership and mileage less than current total
        intervals.equalTo("dealership", car.get("dealership"));
        intervals.each(function (service) {
          dealerServices = true;
          var intMileage = service.get("mileage");
          // get the history for this particular service
          // find the mileage of the last time it was done
          var history = false;
          var historyMileage = 0;
          for (var z = 0; z < intervalHistory.length; z++) {
            if (intervalHistory[z][0] === service.id){
              history = true;
              if (historyMileage < intervalHistory[z][1]){
                historyMileage = intervalHistory[z][1];
              }
            }
          }

          // if no history and within the interval(minus 500) than add it to pendingFixed
          if (!history){
            if(carMileage > intMileage - 500) {
              pendingInterval.push(service.id);
              intervalDesc.push([service.get("item"),service.get("action")]);
            }
          // if history, check interval(minus 500) based on the last time it was done,
          } else {
            console.log(historyMileage + "HISTORY MILEAGE");
            var currentIntervalMileage = carMileage - historyMileage;
            if (currentIntervalMileage - intMileage > -500) {
              pendingInterval.push(service.id);
              intervalDesc.push([service.get("item"),service.get("action")]);
            }
          }
        }).then(function() {
          car.set("pendingIntervalServices", pendingInterval);
          // if no dealership, show edmunds services
          // XXX there should be a better way to do this: a boolean in shop table?
          if (!dealerServices) { // has no dealer or no dealershsips
            console.log("dealership but no dealer services");
            readEdmundsServices();
          } else {
            console.log("dealership and dealer services");
            carSave(false);
          }
        }, function(error) {
          alert("Error: " + error.code + " " + error.message);
        });
      } else {
        console.log("no dealership, edmunds");
        readEdmundsServices();
      }
    }, function(error) {
      alert("Error: " + error.code + " " + error.message);
    });
};

   var readEdmundsServices = function () {
    // query for the Edmunds Services associated with this Car
    var edmundsQuery = new Parse.Query("EdmundsService");
    edmundsQuery.equalTo("make", car.get("make"));
    edmundsQuery.equalTo("model", car.get("model"));
    edmundsQuery.equalTo("year", car.get("year"));
    edmundsQuery.notEqualTo("intervalMileage", 0);
    // we only want freq = 4 or 3, and you cant do || with equalTo
    edmundsQuery.lessThanOrEqualTo("frequency", 4);
    edmundsQuery.greaterThanOrEqualTo("frequency", 3);
    var serviceQuery = new Parse.Query("Service");
    serviceQuery.each(function (service) {
      serviceList.push([service.get("item"), service.get("action"), service.get("priority")]);
    }).then(function() {
      edmundsQuery.find({
        success: function (services) {
          // if services have already been pulled to our database, continue to loadedEdmundServices
          if (services.length > 0){
            console.log(car.get("make") + " " + car.get("model") + " " + car.get("year") + " " + "edmundsQuery services: ");
            console.log(services);
            loadedEdmundsServices(services, serviceList);
          // otherwise we pull edmund services
          }else{
            console.log("Edmunds Services for " + car.get("make") + " " + car.get("model") + " " + car.get("year") + " not stored in EdmundService table");
            // if the edmunds services have already been grabbed and there are still no services, then end the function and save the car
            if(newServices){
              carSave(false);
            }
            newServices = true;
            // making a request to Edmunds based on makeModelYearId
            Parse.Cloud.httpRequest({
              url: EDMUNDS_API.requestPaths.makeModelYearId(
                  car.get('make'),
                  car.get('model'),
                  car.get('year')
              ),
              success: function (results) {
                carMakeModelYearId = JSON.parse(results.text).id;
                Parse.Cloud.httpRequest({
                  url: EDMUNDS_API.requestPaths.maintenance(carMakeModelYearId),
                  success: function (loaded) {
                    var edmundsServices = JSON.parse(loaded.text).actionHolder;
                    console.log("Calling loadedEdmundsServices with: ");
                    console.log(edmundsServices);
                    // go save the edmunds to the database
                    Parse.Cloud.run("addEdmundsServices", { //run with carServicesUpdate
                      edmundServices: edmundsServices,
                      serviceList: serviceList,
                      carObject:
                        {make: car.get('make'),
                         model: car.get('model'),
                         year: car.get('year')}
                    },{
                      success: function(result){
                        // if it works we call this same function recursively, as now length of history will be > 0, and we want to query them
                        // properly, as right now edmundsServices is a json object instead of a query
                        readEdmundsServices();
                      },
                      error: function(error){
                        console.error(error);
                        carSave(false);
                      }
                    });
                  },
                  error: function (error) {
                    console.error("Could not get services from Edmunds for: " + carMakeModelYearId);
                    console.error(error);
                    carSave(false);
                  }
                });
              },
              error: function (error) {
                console.error("Could not get carMakeModelYearId from Edmunds");
                console.error("ERROR7: ", error);
                carSave(false);
              }
            });
          }
        },
        error: function (error) {
          //console.error("Could not find the car with ScannerId: ", scan["scannerId"]);
          console.error("ERROR6: ", error);
          carSave(false);
        }
      });
    }, function(error) {
      console.error(error);
    });
  };

  /*
  This function gets called when the program is done loading
  services from edmunds
  */
  var loadedEdmundsServices = function (edmundsServices, serviceList) {
    // loop through all the edmundsServices and see if they are valid
    for (var i = 0; i < edmundsServices.length; i++) {
      var save = false;
      var engineEdm = edmundsServices[i].get("engineCode");
      var freq = edmundsServices[i].get("frequency");
      var id = edmundsServices[i].id;
      var intMileage = edmundsServices[i].get("intervalMileage");
      var item = edmundsServices[i].get("item");
      var action = edmundsServices[i].get("action");
      var priority = edmundsServices[i].get("priority");
      var ignore = true;
      var engineCar = ["  ","    "];

      if (car.get("engine") !== undefined){
        engineCar = car.get("engine").split(" ");
      }

      /* dont allow no engine, check that the engine code matches ours.
         our format: 1.6L V3 blah blah blah
         theirs: 3Vabc1.6 (currently not checking V = V, or inline...) */
      if (engineEdm === "0NAE" ||
          engineEdm.charAt(0) !== engineCar[1].charAt(1) ||
          engineEdm.slice(-3) !== engineCar[0].substring(0,3)) {
        continue;
      }

      // dont allow mileage = 0
      if (intMileage === 0){
        continue;
      }

      //check if our edmunds is in our allowed list of Services
      for (var x = 0; x < serviceList.length; x++) {
        if (serviceList[x][0] === item &&
            serviceList[x][1] === action) {
          ignore = false; // double breaking for loops is hard
          break;
        }
      }
      // the edmunds service doesnt exist in our list of approved services, go to next
      if (ignore) continue;
      if (priority === undefined || priority === 0){
        continue;
      }

      // get the history for this particular service
      // find the mileage of the last time it was done
      var history = false;
      var historyMileage = 0;
      for (var z = 0; z < edmundsHistory.length; z++) {
        if (edmundsHistory[z][0] === id){
          history = true;
          if (historyMileage < edmundsHistory[z][1]){
            historyMileage = edmundsHistory[z][1];
          }
        }
      }

      /* frequency 3 means the service is done once
         if it is freq 3 and there is history we dont show it(it was already done)
         if there isnt history we show it if it passed the interval(minus 500)
         the .4 is to only show services on a new car that are recent
         EX: so if you put in your car at 100K, we dont show services that should have been done from 0-60k */
      if (freq === 3 && !history){
        if((carMileage*0.4) > (carMileage - intMileage) > -500){
          save = true;
        }
      // frequency 4 means the service is done repeatedly at intervals of the specified intervalMileage
      // no history means we show it if within 500
      // history means we show it based on the last time it was done
      } else if (freq === 4 && !history) {
        if (carMileage > intMileage - 500) {
          save = true;
        }
      } else if (freq === 4 && history) {
        var currentIntervalMileage = carMileage - historyMileage;
        if (currentIntervalMileage - intMileage > -500) {
          save = true;
        }
      }

      if (save) {
        serviceStack.push(edmundsServices[i]);
      }
    }
    carSave(true);
  };//END loadedEdmundsServices

  /*
  This gets called  when all due services are added to the stack
  */
  var carSave = function (edmunds) {
    console.log("car save");
    console.log(serviceStack);
    var seen = [];
    var highestMileage = 0;
    var servicesDue = [];
    var prioritySum = 0;
    if (edmunds) { // true = edmunds is used, false = dealer services.

      /* get rid of duplicate services with same mileage
         EX: we might have 3 oil changes in serviceStack right now, 10k, 20k, 30k.
         only keep the one at 30k
         therefore: loop through all services and compare them */
      for(var i = 0; i < serviceStack.length; i++){
        var notFound = true;
        for (var j = 0; j < seen.length; j++) {
          // check for services with same action and item
          if (serviceStack[i].get("action") === seen[j].get("action") &&
              serviceStack[i].get("item") === seen[j].get("item")){
            // if we find one then set notFound to false so we dont add duplicates
            notFound = false;
            // compare mileage and keep the highest one
            if (serviceStack[i].get("intervalMileage") > seen[j].get("intervalMileage")) {
              seen[j] = serviceStack[i];
              break;
            }
          }
        }
        // if we didnt see anything like them in seen, add to seen
        if (notFound) {
          seen.push(serviceStack[i]);
        }
      }

      // update serviceStack
      serviceStack = seen;

      // return subset(5) of services by priority
      serviceStack = serviceStack.sort(function(a,b){
        return b.get("priority")-a.get("priority");
      });
      serviceStack = serviceStack.slice(0,5);

      // get rid of any old services
      servicesDue = car.get("pendingEdmundServices");
      if (servicesDue === undefined) servicesDue = [];
      for  (i = 0; i < servicesDue.length; i++) {
        for (var z = 0; z < edmundsHistory.length; z++) {
          if (servicesDue[i] === edmundsHistory[z][0]) {
            servicesDue.splice(i, 1); // remove element at i
          }
        }
      }

      // XXX: what if a new service is added to the edmunds service table?
      // right now we only pull that data once per car so it doesnt matter
      // add new services to the servicesDue array
      for (i = 0; i < serviceStack.length; i++) {
        var service = serviceStack[i];
        prioritySum += service.get("priority");
        // if they arent already in it
        if (servicesDue.indexOf(service.id) === -1 && servicesDue.length < 5){ // to a limit of 5
          servicesDue.push(service.id);
        }
      }
      car.set("pendingEdmundServices", servicesDue);
      car.set("pendingIntervalServices", []);
      car.set("pendingFixedServices", []);
    } else { // edmunds isnt used
      car.set("pendingEdmundServices", []);
    }

    if (pendingFixed.length + pendingInterval.length + servicesDue.length > 0) {
      // if services due == 0, then there is a pending fixed or interval
      // thus when checking the priority sum, we know there are services due, so check priority > 5
      if(servicesDue.length === 0 || prioritySum > 5) {
        saveNotification(servicesDue);
      }
      car.set("serviceDue", true);
    } else {
      car.set("serviceDue", false);
    }

    car.save(null, {
      success: function (savedCar) {
        console.log("car saved");
        response.success("car saved"); // success for cloud function
      },
      error: function (saveError) {
        console.log("car not saved");
        console.error(saveError);
        response.error("car not saved"); //failure for cloud function
      }
    });
  };

  //saves new notifications
  var saveNotification = function (servicesDue) {
    //set notifications object
    var Notification = Parse.Object.extend("Notification");
    var notificationToSave = new Notification();
    var notificationContent = car.get("make") + " " + car.get("model") + " has " + (servicesDue.length + pendingFixed.length + pendingInterval.length);
    var notificationTitle =  car.get("make") + " " + car.get("model") + " has ";
    if((servicesDue.length + pendingFixed.length + pendingInterval.length) != 1) {
      notificationContent+= " services due";
      notificationTitle+= "services due";
    }else{
      notificationContent+= " service due";
      notificationTitle+= "a service due";
    }

    /*
    for (var i = 0; i < servicesDue.length; i++){
          //add services to string
        if (notificationContent.length < 60){
            var service = servicesDue[i];
            notificationContent += service.get("action") + " " + service.get("item");//description...
            if (i < servicesDue.length - 1){
                notificationContent += ", ";
            }
        }

    }*/

    notificationToSave.set("content", notificationContent);
    notificationToSave.set("scanId", scan.id);
    notificationToSave.set("title", notificationTitle);
    notificationToSave.set("toId", car.get("owner"));
    notificationToSave.set("carId", car.id);
    notificationToSave.save(null, {
      success: function(notificationToSave){
        //saved
      },

      error: function(notificationToSave, error){
        console.error("Error: " + error.code + " " + error.message);
      }
    });

    if(servicesDue.length === 0){
      shopQuery = new Parse.Query("Shop");
      shopQuery.equalTo("objectId", car.get("dealership"));
      shopQuery.first({
        success: function (shop) {
          userQuery = new Parse.Query(Parse.User);
          userQuery.equalTo("objectId", car.get("owner"));
          userQuery.first({
            success: function(user){
              var emailHtml = "<h2>Notification sent to customer</h2>";
              emailHtml += "<strong>Service alert for:</strong> " + user.get("name");
              emailHtml += "<br>";
              emailHtml += "<strong>Customer's Phone Number:</strong> " + user.get("phoneNumber");
              emailHtml += "<br>";
              emailHtml += "<strong>Vehicle:</strong> " + car.get("make") + " " + car.get("model");
              emailHtml += "<br>";
              emailHtml += "<strong>Vehicle Year:</strong> " + car.get("year");
              emailHtml += "<br>";
              emailHtml += "<strong>Vehicle VIN:</strong> " + car.get("VIN");
              emailHtml += "<br>";
              emailHtml += "<strong>Vehicle Engine:</strong> " + car.get("engine");
              emailHtml += "<br>";
              emailHtml += "<strong>Vehicle Mileage:</strong> " + car.get("totalMileage");
              emailHtml += "<br>";

              emailHtml += "<h2>Alerts</h2>";
              emailHtml += "<ul>";

              for (i=0; i < fixedDesc.length; i++) {
                emailHtml += "<li>";
                emailHtml += fixedDesc[i][1] + " " + fixedDesc[i][0] + "<br>";
                emailHtml += "</li>";
              }
              for (i=0; i < intervalDesc.length; i++) {
                emailHtml += "<li>";
                emailHtml += intervalDesc[i][1] + " " + intervalDesc[i][0] + "<br>";
                emailHtml += "</li>";
              }
              emailHtml += "</ul>";
              emailHtml = emailHtml.replace(/undefined/g, "~missing~");

              console.log("sendEmail html");
              console.log(emailHtml);

              var email = sendgrid.Email({to: [shop.get("email")]});
              email.setFrom(user.get("email"));
              email.setSubject("Notification sent to " + user.get("name"));
              email.setSendAt(Math.floor(Date.now() / 1000) + 70*60*60); // 70 hour delay
              email.setHTML(emailHtml);

              sendgrid.sendEmail(email, {
                 success: function(httpResponse) {
                    console.log(httpResponse);
                    console.log("Email sent!");
                 },
                 error: function(httpResponse) {
                    console.error(httpResponse);
                    console.log("Error sending email");
                 }
              });
            },
            error: function (error) {
              console.error(error);
              response.error();
            }
          });
        },
        error: function (error) {
          console.log("Error " + error);
          response.error();
        }
      });
    }
  };
}); // END CAR SERVICES UPDATE

Parse.Cloud.job("autoMileageUpdate", function(request, status) {
  Parse.Cloud.useMasterKey;
  //var config = Parse.Config.current();
  var mileageAddition = (parseInt(request.params.biWeeklyAverageMiles) / 2);
  status.message("mileage addition "+mileageAddition);
  var query = new Parse.Query("Car");
  // Week Ago: Date
  var d = new Date();
  var time = (7 * 24 * 3600 * 1000);
  var weekAgoDate = new Date(d.getTime() - (time));
  // find cars that haven't been updated in at least a week
  query.lessThanOrEqualTo( "updatedAt", weekAgoDate);
  query.find({
      success: function (cars) {
          //update all car mileage
          status.message(cars.toString());
          for (var i = 0; i < cars.length; i++) {
              var car = cars[i];
              status.message(car.toString());
              var mileage = car.get("baseMileage") + mileageAddition; // add baseMileage
              car.set("totalMileage", mileage);
          }
          Parse.Object.saveAll(cars, {
              success: function(data){
                  console.log("autoMileageUpdate Success");
                  status.success("Mileage for cars saved");
              },
              error: function(error){
                  console.error("Error updating mileage from autoMileageUpdate: ", error);
                  status.error("Mileage for cars not saved");
              }
          });
      },
      error: function (error){
          console.error("Could not find cars updated before ", weekAgoDate);
          console.error("Error: ", error);
      }
  });
});

Parse.Cloud.define("sendServiceRequestEmail", function(request, response) {
   var params = request.params;
   var services = params.services;
   var carVin = params.carVin;
   var userObjectId = params.userObjectId;
   var comments = params.comments;

   function sendEmail (user, car, shop) {
      var emailHtml = "<h2>Customer Information</h2>";
      emailHtml += "<strong>Service Request By:</strong> " + user.get("name");
      emailHtml += "<br>";
      emailHtml += "<strong>Customer's Phone Number:</strong> " + user.get("phoneNumber");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle:</strong> " + car.get("make") + " " + car.get("model");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle Year:</strong> " + car.get("year");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle VIN:</strong> " + car.get("VIN");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle Engine:</strong> " + car.get("engine");
      emailHtml += "<br>";
      emailHtml += "<strong>Vehicle Mileage:</strong> " + car.get("totalMileage");
      emailHtml += "<br>";

      emailHtml += "<h2>Required Services</h2>";
      emailHtml += "<ul>";

      for (i=0; i < services.length; i++) {
         emailHtml += "<li>";
         emailHtml += services[i]["action"] + " " + services[i]["item"];

         if (services[i]["priority"] == 5) {
            // DTC, add description
            emailHtml += "<br>" + services[i]["itemDescription"];
         }
         emailHtml += "</li>";
      }
      emailHtml += "</ul>";
      emailHtml += "<br>";
      emailHtml += "<h2>Additional Comments</h2>";
      emailHtml += "<br>";
      emailHtml += comments;

      // Add FF here
      /*emailHtml += "<ul>"
      emailHtml += ("<br><strong>Freeze Frame</strong>")
      emailHtml += ("<li>" + "Trouble Code:       P0442</li>")
      emailHtml += ("<li>" + "Fuel System 1:      Open1</li>")
      emailHtml += ("<li>" + "Fuel System 2:      Open1</li>")
      emailHtml += ("<li>" + "Calc Load (%):          0</li>")
      emailHtml += ("<li>" + "Coolant (C):           84</li>")
      emailHtml += ("<li>" + "ST Fuel Trim 1 (%):     0</li>")
      emailHtml += ("<li>" + "LT Fuel Trim 1 (%):  -7.0</li>")
      emailHtml += ("<li>" + "ST Fuel Trim 2 (%):     0</li>")
      emailHtml += ("<li>" + "LT Fuel Trim 2 (%):  -9.4</li>")
      emailHtml += ("<li>" + "Engine Speed (rpm):     0</li>")
      emailHtml += ("<li>" + "Vehicle Speed (km/h):   0</li>")
      emailHtml += ("<li>" + "Ignition Advance:       6</li>")
      emailHtml += ("<li>" + "Intake Air Temp (C):   39</li>")
      emailHtml += ("<li>" + "Mass Air Flow (g/s): 2.26</li>")
      emailHtml += ("<li>" + "Absolute TPS (%):    17.6</li>")
      emailHtml += "<br></ul>"*/

      console.log("sendEmail html");
      console.log(emailHtml);

      sendgrid.sendEmail({
        to: shop.get("email"),
        from: user.get("email"),
        subject: "Service Request from " + user.get("name"),
        html: emailHtml
      }, {
         success: function(httpResponse) {
            console.log(httpResponse);
            console.log("Email sent!");
            response.success("Email sent!");
         },
         error: function(httpResponse) {
            console.error(httpResponse);
            console.log("Error sending email");
            response.error("Error sending email");
         }
      });
   }


   var carQuery = new Parse.Query("Car");
   carQuery.equalTo("VIN", carVin);
   carQuery.find({
      success: function (cars) {
         car = cars[0];

         shopQuery = new Parse.Query("Shop");
         shopQuery.equalTo("objectId", car.get("dealership"));
         shopQuery.find({
            success: function (shops) {
               shop = shops[0];
               console.log("Shop "); console.log(shop);

               userQuery = new Parse.Query(Parse.User);
               userQuery.equalTo("objectId", userObjectId);
               userQuery.find({
                  success: function (users) {
                     user = users[0];

                     sendEmail (user, car, shop);
                  },
                  error: function (error) {
                     console.error(error);
                     response.error();
                  }
               });
            },
            error: function (error) {
              console.log("Error " + error);
              response.error();
            }
         });
      },
      error: function (error) {
         console.error(error);
         response.error();
      }
   });
});
