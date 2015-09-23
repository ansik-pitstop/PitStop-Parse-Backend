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
     }
   }

};

/*
 
 Car aftersave: load calibration services
 */
 

Parse.Cloud.afterSave("Car", function(request){
//first time saving the car,
//set calibration services (priority = 4)
  var car = request.object;
  if (request.object.existed() == true){
      return;
  }
                      
  var query = new Parse.Query("Service");
  query.equalTo("priority", 4);
  query.find({
             success: function (services) {
             //function to send services to app
             serviceStack = services;
             servicesDue = [];
             console.log('services');
             console.log(services);
             
             for (var i = 0; i < serviceStack.length; i++) {
                var service = serviceStack[i];
                if (servicesDue.indexOf(service.get("serviceId")) === -1) servicesDue.push(service.get("serviceId"));
             }
             car.set("serviceDue", true);
             car.set("servicesDue", servicesDue);
             car.save(null, {
                      success: function (savedCar) {
                      console.log("car saved");
                      },
                      error: function (saveError) {
                      console.log("car not saved");
                      console.error(saveError);
                      }
                      });
             
             
             },
             error: function (error) {
             console.error("Could not find services with priority = ", 4);
             console.error("ERROR: ", error);
             }
             });

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

Parse.Cloud.define("addEdmundsService", function(request, status) {

    var createEdmundsService = function(service, carObject){
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

    var service = createEdmundsService(request.params.service, request.params.carObject);

    service.save(null, {
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

Parse.Cloud.define("carServicesUpdate", function(request, status) {
  //request object is scan
  scan = request.params;

  // Initializing variables
  var car = null;
  var carMakeModelYearId = null;
  var carMileage = 0;
  var serviceStack = [];
  var edmundsServices = [];
  //var carType = null;

  // query for the car associated with this Scan
  var query = new Parse.Query("Car");
  query.equalTo("scannerId", scan["scannerId"]);
  query.find({
  success: function (cars) {
  foundCar(cars[0]);
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
                    var dtc = dtcs[i]
                    console.log("dtc to find")
                    console.log(dtc)

                    query.equalTo("dtcCode", dtcs[i]);
                    query.find({
                        success: function (data) {

                            if (data.length > 0) {
                                console.log("data")
                                console.log(data)
                                var description = data[0].get("description");

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
    };

  /*
  This function gets called when the program is done loading
  services from edmunds
  */

  var loadedEdmundsServices = function () {

    // looping through all the services


    var counter = 0; // this counter is async but using i isn't.
    for (var i = 0; i < edmundsServices.length; i++) {

        /*var service = createEdmundsService(edmundsServices[i],
            {make: car.get('make'),
            model: car.get('model'),
            year: car.get('year')}
        );*/

        Parse.Cloud.run("addEdmundsService", { //run with carServicesUpdate
                service: edmundsServices[i],
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
                    console.log("addEdmundsService error:");
                    console.error(error);
                }
            }
        );


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