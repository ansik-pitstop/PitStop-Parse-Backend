var recallMasters = require("cloud/recallMasters.js");
var sendgrid = require("sendgrid");
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

/*
Edmunds Service Before save: don't save duplicates

*/
Parse.Cloud.beforeSave("EdmundsService", function(request, response){

    var edmundsId = request.object.get("edmundsId");
    var edmundsQuery = new Parse.Query("EdmundsService");
    edmundsQuery.equalTo("edmundsId", edmundsId);
    edmundsQuery.first({
        success: function(data){
            if (data !== undefined){
                //checks if there is existing object in table with service
                response.error("An EdmundsService with this edmundsId already exists.");
            }else{
                //if there is not existing object with edmundsId, continue with save
                response.success();
            }
        },
        error: function(error){
            console.error(error);
            response.error("EdmundsService BeforeSave query error: "+error);
        }
    })


});

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
    })


});
/*
 Car beforeSave: add recall information
*/

Parse.Cloud.beforeSave("Car", function(request, response){
   // check recalls before save
    var car = request.object;
    
/*    var historyQuery = new Parse.Query("ServiceHistory");
    historyQuery.equalTo("serviceId", 124);
    historyQuery.equalTo("carId", car.id);
    historyQuery.find({
        success: function (services) {
            //function to send services to app

            var serviceIdStrings = services.map(function(s){return s.get("serviceObjectId");});

            var recallQuery = new Parse.Query("EdmundsRecall");
            recallQuery.notContainedIn("objectId", serviceIdStrings);
            recallQuery.equalTo("make", car.get("make"));
            recallQuery.equalTo("model", car.get("model"));
            recallQuery.equalTo("year", car.get("year"));
            recallQuery.find({
                success: function (services) {
                    var serviceIdStrings = services.map(function(s){return s.id;});
                    car.set("pendingRecalls", serviceIdStrings)
                    response.success();
                },
                error: function(error){
                    response.success(); //call success anyway
                }
            });

        },
        error: function (error) {
            console.error("Could not find serviceHistory for car ", car.get("make")+" "+car.get("model"));
            console.error("ERROR: ", error);
            response.error("error with service history - car not saved");
        }
    });
*/
    // was in afterSave for car - think this should be done in beforeSave - Jiawei

    // puttig this part of code after checking isNew() to ensure it runs once only

    if (request.object.isNew()) {
        var query = new Parse.Query("Service");
        query.equalTo("priority", 4);
        query.find({
            success: function (services) {
                //function to send services to app
                serviceStack = services;
                servicesDue = [];
                console.log('services');
                console.log(services)

                for (var i = 0; i < serviceStack.length; i++) {
                    var service = serviceStack[i];
                    if (servicesDue.indexOf(service.get("serviceId")) === -1) servicesDue.push(service.get("serviceId"));
                }
                car.set("serviceDue", true);
                car.set("servicesDue", servicesDue);
            },
            error: function (error) {
                console.error("Could not find services with priority = ", 4);
                console.error("ERROR: ", error);
            }
        });
    }
    response.success()

});

/*

 Car aftersave: load calibration services
 */


Parse.Cloud.afterSave("Car", function(request){
//first time saving the car,
//set calibration services (priority = 4)
    var car = request.object;
    // var serviceHistory = [];

    if (!car.existed()) {
        Parse.Cloud.run("recallMastersWrapper", {
            "vin": car.get("VIN"),
            // passing in the id string, not pointer to car object
            "car": car.id
        })
    }

  // *** Edmunds is no longer used ***

  //   if (!request.object.existed()){
  //
  // // if (!request.object.existed()){
  //
  //      // making a request to Edmunds for makeModelYearId
  //     Parse.Cloud.httpRequest({
  //
  //         url: EDMUNDS_API.requestPaths.makeModelYearId(
  //             car.get('make'),
  //             car.get('model'),
  //             car.get('year')
  //         ),
  //
  //         success: function (results) {
  //
  //             carMakeModelYearId = JSON.parse(results.text).id;
  //
  //             // saving recalls to database
  //             Parse.Cloud.httpRequest({
  //
  //                 url: EDMUNDS_API.requestPaths.recall(carMakeModelYearId),
  //
  //                 success: function (results) {
  //                     var edmundsRecalls = JSON.parse(results.text).recallHolder;
  //                     console.log("got edmunds recalls");
  //
  //
  //
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
  //
  //                 error: function (error) {
  //                     console.error("Could not get recalls from Edmunds for: " + carMakeModelYearId);
  //                     console.error(error);
  //                 }
  //
  //             });
  //
  //         },
  //
  //         error: function (error) {
  //             console.error("Could not get carMakeModelYearId from Edmunds in car aftersave");
  //             console.error("ERROR: ", error);
  //         }
  //
  //     });
  //
  //     return;
  // }

  // var query = new Parse.Query("Service");
  // query.equalTo("priority", 4);
  // query.find({
  //            success: function (services) {
  //            //function to send services to app
  //            serviceStack = services;
  //            servicesDue = [];
  //            console.log('services');
  //            console.log(services);
  //
  //            for (var i = 0; i < serviceStack.length; i++) {
  //               var service = serviceStack[i];
  //               if (servicesDue.indexOf(service.get("serviceId")) === -1) servicesDue.push(service.get("serviceId"));
  //            }
  //            car.set("serviceDue", true);
  //            car.set("servicesDue", servicesDue);
  //            car.save(null, {
  //                     success: function (savedCar) {
  //                     console.log("car saved");
  //                     },
  //                     error: function (saveError) {
  //                     console.log("car not saved");
  //                     console.error(saveError);
  //                     }
  //                     });
  //
  //
  //            },
  //            error: function (error) {
  //            console.error("Could not find services with priority = ", 4);
  //            console.error("ERROR: ", error);
  //            }
  //            });



  //should run job/func here to update services/mileage at an interval



});

 /*
  afterSave Event for Scan Object
  */

Parse.Cloud.afterSave("Scan", function(request) {

    // getting the scan object
    var scan = request.object;

    // stopping the function if not required
    if (scan.get("runAfterSave") !== true) {

    return;
    }

    /*
    Parse.Cloud.httpRequest({
        method: "POST",
        url: "https://api.parse.com/1/jobs/carServiceUpdate",
        headers: {
            "X-Parse-Application-Id": "NdSgPCykUoMT6jQd35LVYjf4MjayAL1PcSvSCxUo",
            "X-Parse-Master-Key": "49F8EaINtWQlpPKTTx4oEiuRn2VfgayyNzy4cpLr",
            "Content-Type": "application/json"
        },
        body: {
            scannerId: scan.get("scannerId"),
            mileage: scan.get("mileage"),
            PIDs: scan.get("PIDs"),
            id: scan.id
        },
        success: function(httpResponse) {
            console.log(httpResponse);
        },
        error: function(error) {
            console.log("ERROR");
        }
    });*/

  //run cloud function

  Parse.Cloud.run("carServicesUpdate", { //run with carServicesUpdate
        scannerId: scan.get("scannerId"),
        mileage: scan.get("mileage"),
        PIDs: scan.get("PIDs"),
        DTCs: scan.get("DTCs"),
        id: scan.id
      }, {
      success: function(result){
        console.log("success: ")
        console.log(result)
      },
      error: function(error){
        console.log(error);
        console.error(error);
      }
    }
);

});



Parse.Cloud.afterSave("Notification", function(request) {
  //push notification
  var notification = request.object;

  var pushQuery = new Parse.Query(Parse.Installation);

          pushQuery.equalTo('deviceType', 'ios');//ios
          pushQuery.equalTo('userId', notification.get("toId"));

          Parse.Push.send({
              where: pushQuery,
              badge: "Increment",
              data:{
                //data for push notification
                alert: notification.get("content"), //to enable ios push
                title: notification.get("title")

              }
          }, {
            success: function(){
              //success, destroy notification
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

    var createEdmundsService = function(service, carObject) {
        var Edmunds = Parse.Object.extend("EdmundsService");
        var eService = new Edmunds();


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
    }
    var services = [];

    for (var i = 0; i < request.params.services.length; i++) {
        services.push(createEdmundsService(request.params.services[i], request.params.carObject) );
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
    }
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
  var edmundsServices = [];
  var newServices = false;
  //var carType = null;

  // query for the car associated with this Scan
  var query = new Parse.Query("Car");
  query.equalTo("scannerId", scan["scannerId"]);
  query.find({
  success: function (cars) {
      if (cars.length > 0){
          foundCar(cars[0]);
      }else{
          response.error("No results for car with ScannerId: "+scan["scannerId"]);
      }
  },
  error: function (error) {
  console.error("Could not find the car with ScannerId: ", scan["scannerId"]);
  console.error("ERROR: ", error);
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

        // setting the car mileage
        if (scan["PIDs"] === undefined) {
        carMileage = scanMileage;
        } else {
        carMileage = scanMileage + car.get("baseMileage");
        }
        car.set("totalMileage", carMileage);

        if (scan["freezeData"] !== undefined){
            //exists
            if (scan["freezeData"] !== "[]"){
                //not empty
                car.AddUnique("storedFreezeFrames", scan["freezeData"]);
            }
        }

        //parse dtcs and create notification
        var dtcData = scan["DTCs"];
        console.log("dtcs")
        console.log(dtcData)

        if ( dtcData !== undefined && dtcData !== ""){

            var dtcs = dtcData.split(",");

            for (var i = 0; i < dtcs.length; i++){
                //check for DTCs
                if (dtcs[i] != ""){
                    car.addUnique("storedDTCs", dtcs[i]);

                    var query = new Parse.Query("DTC");
                    //var dtc = dtcs[i];
                    //console.log("dtc to find");
                    //console.log(dtc);

                    query.equalTo("dtcCode", dtcs[i]);
                    query.find({
                        success: function (data) {

                            if (data.length > 0) {
                                console.log("data")
                                console.log(data)
                                var description = data[0].get("description");
                                var dtc = data[0].get("dtcCode")

                                var Notification = Parse.Object.extend("Notification");
                                var notificationToSave = new Notification();

                                var notificationContent = car.get("make") + " " + car.get("model") + " has DTC Code "+dtc+": "+description;

                                var notificationTitle =  car.get("make") + " " + car.get("model") + " has DTC Code "+dtc;

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
                            }

                        },
                        error: function (error) {
                            console.error("Could not find the dtc with code: ", dtcs[i]);
                            console.error("ERROR: ", error);
                        }
                    });

                }

            }

        }
        //save car
        car.save();
        console.log("car saved")

        // query for the Edmunds Services associated with this Car
        var edmundsQuery = new Parse.Query("EdmundsService");
        edmundsQuery.equalTo("make", car.get("make"));
        edmundsQuery.equalTo("model", car.get("model"));
        edmundsQuery.equalTo("year", car.get("year"));
        edmundsQuery.find({
            success: function (services) {
                if (services.length > 0){
                    edmundsServices = services;
                    console.log('edmundsQuery services: ');
                    console.log(edmundsServices);
                    loadedEdmundsServices();
                }else{
                    console.log("Edmunds Services for "+car.get("make")+" "+car.get("model")+" "+car.get("year")+" not stored in EdmundService table");
                    newServices = true;
                    // making a request to Edmunds for makeModelYearId
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

                                success: function (results) {
                                    edmundsServices = JSON.parse(results.text).actionHolder;
                                    console.log("Calling loadedEdmundsServices with: ");
                                    console.log(edmundsServices);
                                    loadedEdmundsServices();
                                },

                                error: function (error) {
                                    console.error("Could not get services from Edmunds for: " + carMakeModelYearId);
                                    console.error(error);
                                }

                            });

                        },

                        error: function (error) {
                            console.error("Could not get carMakeModelYearId from Edmunds");
                            console.error("ERROR: ", error);
                        }

                    });
                }
            },
            error: function (error) {
                //console.error("Could not find the car with ScannerId: ", scan["scannerId"]);
                console.error("ERROR: ", error);
            }
        });



    };

  /*
  This function gets called when the program is done loading
  services from edmunds
  */

  var loadedEdmundsServices = function () {

    // looping through all the services
      if (newServices){
          //only run this if the services are not already in table
          Parse.Cloud.run("addEdmundsServices", { //run with carServicesUpdate
                  services: edmundsServices,
                  carObject:
                  {
                      make: car.get('make'),
                      model: car.get('model'),
                      year: car.get('year')
                  }
              }, {
                  success: function(result){
                      console.log("success: ")
                      console.log(result)
                  },
                  error: function(error){
                      console.log("addEdmundsServices error:");
                      console.error(error);
                  }
              }
          );
      }



    var counter = 0; // this counter is async but using i isn't.
    for (var i = 0; i < edmundsServices.length; i++) {

        /*var service = createEdmundsService(edmundsServices[i],
            {make: car.get('make'),
            model: car.get('model'),
            year: car.get('year')}
        );*/


      var serviceQuery = new Parse.Query("Service");

      serviceQuery.equalTo("action", edmundsServices[i].action || null);
      serviceQuery.equalTo("item", edmundsServices[i].item || null);
      serviceQuery.find({
      success: function (results) {

      if (results.length === 0) {
      counter++;
      if (i === counter) {
        serviceStackIsFull();
      }
      return;
      }

      // getting the first service found
      var loadedService = results[0];
      // getting the edmunds service from the for loop.
      var toCheckService = edmundsServices[i];

      // quering for service history
      var ServiceHistoryQuery = new Parse.Query("ServiceHistory");
      ServiceHistoryQuery.equalTo("serviceId", loadedService.get("serviceId"));
      ServiceHistoryQuery.equalTo("carId", car.id);
      ServiceHistoryQuery.find({
        success: function (serviceHistoryArray) {

          // if no history found
          if (serviceHistoryArray.length === 0) {
            console.log("NO HISTORY FOUND FOR " + loadedService.get("serviceId") + " || " + counter + " - " + edmundsServices.length);
            serviceStack.push(loadedService);
          } else {
            var history = serviceHistoryArray[serviceHistoryArray.length - 1];

            if (loadedService.get("intervalMileage") !== 1) {
              if (loadedService.get("priority") == 4){
              //high priority items
                  var currentIntervalMileage = carMileage - history.get("mileage");

                  if (currentIntervalMileage - loadedService.get("intervalMileage") > 500 ||
                   loadedService.get("intMileage") - currentIntervalMileage < 500)  {

                      console.log("HISTORY: " + history.get("mileage") + " ||||| INTERVAL: " + loadedService.get("intervalMileage"));
                      serviceStack.push(loadedService);
                  }
                }else{
                //suggested service
                  var currentIntervalMileage = carMileage % loadedService.get("intervalMileage");

                  if (currentIntervalMileage < 1000){
                      serviceStack.push(loadedService);
                  }
               }
            }

          }

          counter++;
          if (i === counter) {
            serviceStackIsFull();
          }

         },
          error: function (error) {

            counter++;
            if (i === counter) {
              serviceStackIsFull();
            }

            console.error(error);

        }

      });

    },
      error: function (error) {

        console.error("Could not find a service with action and Item ");
        console.error("ERROR: ", error);

        }
      });
    }
  // just an event to be fired when the
  // for loop is over.

  };//END loadedEdmundsServices

  /*
  This gets called  when all due services are added to the stack
  */
  var serviceStackIsFull = function () {
    console.log("Service Stack is Full");
    console.log(serviceStack);
    //return subset of services by priority
    serviceStack = serviceStack.sort(function(a,b){return b.get("priority")-a.get("priority")}).slice(0,5);

    var servicesDue = car.get("servicesDue");
    var prioritySum = 0;
    for (var i = 0; i < serviceStack.length; i++) {
      var service = serviceStack[i];
      prioritySum += service.get("priority");
      if (servicesDue.indexOf(service.get("serviceId")) === -1) servicesDue.push(service.get("serviceId"));
    }
    console.log(prioritySum);

    if (prioritySum > 5) {
      //save new notification
      saveNotification(serviceStack);
      car.set("serviceDue", true);
    }

    car.set("servicesDue", servicesDue);
    car.set("totalMileage", carMileage);
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

  }; //END

  //saves new notifications
  var saveNotification = function (servicesDue) {

  //set notifications object
    var notificationCount = servicesDue.length;

    var Notification = Parse.Object.extend("Notification");
    var notificationToSave = new Notification();

    var notificationContent = car.get("make") + " " + car.get("model") + " has "+ servicesDue.length +" services due";
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

    var notificationTitle =  car.get("make") + " " + car.get("model") + " has " + "services due ";

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

                    car.set("baseMileage", mileage);
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

Parse.Cloud.job("carServiceUpdateJob", function(request, status){
    console.log("Starting carServiceUpdateJob");

    //update carServices for one car

    var query = new Parse.Query("Car");
    var car = null;


    query.equalTo( "objectId", request.params.carId);
    query.find({
        success: function(cars){
            console.log("found car: ");

            count = cars.length;

            car = cars[0];
            console.log(car.get("make"));
            foundCar(car)
        },
        error: function (error){
            console.error("Error: ", error);
            status.error("Error, did not find car: ", error);
        }
    });

    /*
     This function is called when the car associated with the
     current scan is found
     */
    var foundCar = function (car) {

        //var car = loadedCar;
        console.log(car.get('make'));

        // making a request to Edmunds for makeModelYearId
        console.log('making request to Edmunds');

        Parse.Cloud.httpRequest({
            url: EDMUNDS_API.requestPaths.makeModelYearId(
                car.get('make'),
                car.get('model'),
                car.get('year')
            ),

            success: function (results) {

                var carMakeModelYearId = JSON.parse(results.text).id;
                console.log(carMakeModelYearId.toString());
                Parse.Cloud.httpRequest({

                    url: EDMUNDS_API.requestPaths.maintenance(carMakeModelYearId),

                    success: function (results) {
                        var edmundsServices = JSON.parse(results.text).actionHolder;
                        console.log("Calling loadedEdmundsServices with: ");
                        console.log(edmundsServices);
                        loadedEdmundsServices(edmundsServices, car);
                    },

                    error: function (error) {
                        console.error("Could not get services from Edmunds for: " + carMakeModelYearId);
                        console.error(error);

                    }

                });

            },

            error: function (error) {
                console.error("Could not get carMakeModelYearId from Edmunds");
                console.error("ERROR: ", error);

            }

        });

    };

    /*
     This function gets called when the program is done loading
     services from edmunds
     */

    var loadedEdmundsServices = function (edmundsServices, car) {
        console.log("loaded edmunds services for: "+car.get('make'));
        var serviceStack = [];
        // looping through all the services
        var counter = 0; // this counter is async but using i isn't.
        for (var i = 0; i < edmundsServices.length; i++) {

            var serviceQuery = new Parse.Query("Service");

            serviceQuery.equalTo("action", edmundsServices[i].action || null);
            serviceQuery.equalTo("item", edmundsServices[i].item || null);
            serviceQuery.find({
                success: function (results) {

                    if (results.length === 0) {
                        counter++;
                        if (i === counter) {
                            serviceStackIsFull(serviceStack);
                        }
                        return;
                    }

                    // getting the first service found
                    var loadedService = results[0];
                    // getting the edmunds service from the for loop.
                    var toCheckService = edmundsServices[i];

                    // quering for service history
                    var ServiceHistoryQuery = new Parse.Query("ServiceHistory");
                    ServiceHistoryQuery.equalTo("serviceId", loadedService.get("serviceId"));
                    ServiceHistoryQuery.equalTo("carId", car.id);
                    ServiceHistoryQuery.find({
                        success: function (serviceHistoryArray) {

                            // if no history found
                            if (serviceHistoryArray.length === 0) {
                                console.log("NO HISTORY FOUND FOR " + loadedService.get("serviceId") + " || " + counter + " - " + edmundsServices.length);
                                serviceStack.push(loadedService);
                            } else {
                                var history = serviceHistoryArray[serviceHistoryArray.length - 1];

                                if (loadedService.get("intervalMileage") !== 1) {
                                    if (loadedService.get("priority") == 4){
                                        //high priority items
                                        var currentIntervalMileage = car.get("mileage") - history.get("mileage");

                                        if (currentIntervalMileage - loadedService.get("intervalMileage") > 500 ||
                                            loadedService.get("intMileage") - currentIntervalMileage < 500)  {

                                            console.log("HISTORY: " + history.get("mileage") + " ||||| INTERVAL: " + loadedService.get("intervalMileage"));
                                            serviceStack.push(loadedService);
                                        }
                                    }else{
                                        //suggested service
                                        var currentIntervalMileage = car.get("mileage") % loadedService.get("intervalMileage");

                                        if (currentIntervalMileage < 1000){
                                            serviceStack.push(loadedService);
                                        }
                                    }
                                }

                            }

                            counter++;
                            if (i === counter) {
                                serviceStackIsFull(serviceStack);
                            }

                        },
                        error: function (error) {

                            counter++;
                            if (i === counter) {
                                serviceStackIsFull(serviceStack);
                            }

                            console.error(error);

                        }

                    });

                },
                error: function (error) {

                    console.error("Could not find a service with action and Item ");
                    console.error("ERROR: ", error);

                }
            });
        }


        // just an event to be fired when the
        // for loop is over.

    };//END loadedEdmundsServices

    /*
     This gets called  when all due services are added to the stack
     */
    var serviceStackIsFull = function (serviceStack) {
        console.log("Service Stack is Full");
        console.log(serviceStack);
        //return subset of services by priority
        //serviceStack = serviceStack.sort(function(a,b){return b.get("priority")-a.get("priority")}).slice(0,5);

        var servicesDue = car.get("servicesDue");
        var prioritySum = 0;
        for (var i = 0; i < serviceStack.length; i++) {
            var service = serviceStack[i];
            prioritySum += service.get("priority");
            if (servicesDue.indexOf(service.get("serviceId")) === -1) servicesDue.push(service.get("serviceId"));
        }
        console.log(prioritySum);

        if (prioritySum > 5) {
            //save new notification
            saveNotification(serviceStack, car);
            car.set("serviceDue", true);
        }

        car.set("servicesDue", servicesDue);
        car.save(null, {
            success: function (savedCar) {
                console.log("car saved");
                status.success("car saved"); // success for cloud function
            },
            error: function (saveError) {
                console.log("car not saved");
                console.error(saveError);
                status.error("car not saved"); //failure for cloud function
            }
        });

    }; //END

    //saves new notifications
    var saveNotification = function (servicesDue, car) {

        //set notifications object
        var notificationCount = servicesDue.length;

        var Notification = Parse.Object.extend("Notification");
        var notificationToSave = new Notification();

        var notificationContent = car.get("make") + " " + car.get("model") + " has the following services due: ";

        for (var i = 0; i < servicesDue.length; i++){
            //add services to string
            var service = servicesDue[i];
            notificationContent += service.get("action") + " " + service.get("item");//description...
            if (i < servicesDue.length - 1){
                notificationContent += ", ";
            }
        }

        var notificationTitle =  car.get("make") + " " + car.get("model") + " has " + "services due ";

        notificationToSave.set("content", notificationContent);
        //notificationToSave.set("scanId", scan.id);
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

Parse.Cloud.define("sendServiceRequestEmail", function(request, response) {
   var params = request.params
   var services = params.services;
   var carVin = params.carVin;
   var userObjectId = params.userObjectId;
   var comments = params.comments;

   function sendEmail (user, car, shop) {
      var emailHtml = "<h2>Customer Information</h2>"
      emailHtml += "<br>"
      emailHtml += "<strong>Service Request By:</strong> " + user.get("name")
      emailHtml += "<br>"
      emailHtml += "<strong>Customer's Phone Number:</strong> " + user.get("phoneNumber")
      emailHtml += "<br>"
      emailHtml += "<strong>Vehicle:</strong> " + car.get("make") + " " + car.get("model")
      emailHtml += "<br>"
      emailHtml += "<strong>Vehicle Year:</strong> " + car.get("year")
      emailHtml += "<br>"
      emailHtml += "<strong>Vehicle VIN:</strong> " + car.get("VIN")
      emailHtml += "<br>"
      emailHtml += "<strong>Vehicle Engine:</strong> " + car.get("engine")
      emailHtml += "<br>"
      emailHtml += "<strong>Vehicle Mileage:</strong> " + car.get("totalMileage")
      emailHtml += "<br>"

      emailHtml += "<h2>Required Services</h2>"
      emailHtml += "<br>"
      emailHtml += "<ul>"

      for (i=0; i < services.length; i++) {
         emailHtml += "<li>"
         emailHtml += services[i]["action"] + " " + services[i]["item"]

         if (services[i]["priority"] == 5) {
            // DTC, add description
            emailHtml += "<br>" + services[i]["itemDescription"]
         }
         emailHtml += "</li>"
      }
      emailHtml += "</ul>"
      emailHtml += "<br>"
      emailHtml += "<h2>Additional Comments</h2>"
      emailHtml += "<br>"
      emailHtml += comments

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
        to: "thebe@ansik.ca",
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
            console.error(httpResponse)
            console.log("Error sending email");
            response.error("Error sending email")
         }
      });
   }

   userQuery = new Parse.Query(Parse.User);
   userQuery.equalTo("objectId", userObjectId);
   userQuery.find({
      success: function (users) {
         user = users[0]

         shopQuery = new Parse.Query("Shop");
         shopQuery.equalTo("objectId", user.get("subscribedShop"))
         shopQuery.find({
            success: function (shops) {
               shop = shops[0]
               console.log("Shop "); console.log(shop);

               var carQuery = new Parse.Query("Car")
               carQuery.equalTo("VIN", carVin)
               carQuery.find({
                  success: function (cars) {
                     car = cars[0]
                     console.log("Car "); console.log(car);
                     sendEmail (user, car, shop);
                  },
                  error: function (error) {
                     console.error(error)
                     response.error()
                  }
               });
            },
            error: function (error) {
              console.log("Error " + error)
              response.error()
            }
         });
      },
      error: function (error) {
         console.error(error)
         response.error()
      }
   });
});
