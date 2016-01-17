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
  afterSave Event for Scan Object
  */

Parse.Cloud.afterSave("Scan", function(request) {

  // getting the scan object
  var scan = request.object;

  // stopping the function if not required
  if (scan.get("runAfterSave") !== true) {
    return;
  }

  // Initializing variables
  var car = null;
  var carMakeModelYearId = null;
  var carMileage = 0;
  var serviceStack = [];
  var edmundsServices = [];

  // query for the car associated with this Scan
  var query = new Parse.Query("Car");
  query.equalTo("scannerId", scan.get('scannerId'));
  query.find({
    success: function (cars) {
      foundCar(cars[0]);
    },
    error: function (error) {
      console.error("Could not find the car with ScannerId: ", scan.get('scannerId'));
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
    var scanMileage = scan.get("mileage");
    var mileageThreshold = 100 //put something reasonable here

    // setting the car mileage
    if (scan.get("PIDs") === undefined) {
      carMileage = scanMileage;
    } else {
      carMileage = scanMileage + car.get("baseMileage");
    }

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

        var serviceQuery = new Parse.Query("Service");
        serviceQuery.equalTo("action", edmundsServices[i].action);
        serviceQuery.equalTo("item", edmundsServices[i].item);
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
            ServiceHistoryQuery.equalTo("serviceId", loadedService.get("Id"));
            ServiceHistoryQuery.equalTo("carId", car.id);
            ServiceHistoryQuery.find({
              success: function (serviceHistoryArray) {

                // if no history found
                if (serviceHistoryArray.length === 0) {
                  console.log("NO HISTORY FOUND FOR " + loadedService.get("Id") + " || " + counter + " - " + edmundsServices.length);
                  serviceStack.push(loadedService);
                } else {
                  var history = serviceHistoryArray[serviceHistoryArray.length - 1];
                  var currentIntervalMileage = carMileage - history.get("mileage");
                  // If service is due
                  if (loadedService.get("intMileage") !== 1) {
                    if (currentIntervalMileage - loadedService.get("intMileage") > 50 ||
                        loadedService.get("intMileage") - currentIntervalMileage < 50)  {
                      console.log("HISTORY: " + history.get("mileage") + " ||||| INTERVAL: " + loadedService.get("intMileage"));
                        serviceStack.push(loadedService);
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

            console.error(
              "Could not find a service with action and Item ",
              {
                action: edmundsServices[i].action,
                item: edmundsServices[i].item
              });
            console.error("ERROR: ", error);

          }
        });
      }


      // just an event to be fired when the
      // for loop is over.

   };

   /*
    This gets called  when all due services are added to the stack
    */
    var serviceStackIsFull = function () {
      console.log("Service Stack is Full");
      console.log(serviceStack);

      var servicesDue = car.get("servicesDue");
      var prioritySum = 0;
      for (var i = 0; i < serviceStack.length; i++) {
        var service = serviceStack[i];
        prioritySum += service.get("priority");
        if (servicesDue.indexOf(service.get("Id")) === -1) servicesDue.push(service.get("Id"));
      }
      console.log(prioritySum);

      if (prioritySum > 2) {
        //save new notification
        saveNotification(serviceStack);
        car.set("serviceDue", true);
      }

      car.set("servicesDue", servicesDue);
      car.set("totalMileage", carMileage);
      car.save(null, {
          success: function (savedCar) {
            console.log("car saved");
          },
          error: function (saveError) {
            console.log("car not saved");
             console.error(saveError);
          }
      });

    };

    //saves new notifications
    var saveNotification = function (servicesDue) {

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

Parse.Cloud.afterSave("Notification", function(request) {
  //push notification
  var notification = request.object;

  var pushQuery = new Parse.Query(Parse.Installation);

          pushQuery.equalTo('deviceType', 'ios');//ios
          pushQuery.equalTo('userId', notification.get("toId"));

          Parse.Push.send({
            where: pushQuery,
            data:{
              //data for push notification
              alert: notification.get("content"),
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

});
