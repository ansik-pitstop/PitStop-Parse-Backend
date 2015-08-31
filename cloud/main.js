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

  //run cloud function
  Parse.Cloud.run("carServicesUpdate", {
        scannerId: scan.get("scannerId"),
        mileage: scan.get("mileage"),
        PIDs: scan.get("PIDs"),
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

        console.error(
        "Could not find a service with action and Item ",
        {
          action: edmundsServices[i].action,
          item: edmundsServices[i].item
        });
        console.error("ERROR: ", error);
        console.log(edmundsServices[i])
        console.log(edmundsServices)

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
      saveNotification(serviceStack);
      car.set("serviceDue", true);
    }

    car.set("servicesDue", servicesDue);
    car.set("totalMileage", carMileage);
    car.save(null, {
      success: function (savedCar) {
        console.log("car saved");
        status.success("car saved");
      },
      error: function (saveError) {
        console.log("car not saved");
        console.error(saveError);
        status.error("car not saved");
      }
    });

  }; //END

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
