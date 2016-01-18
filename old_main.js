Parse.Cloud.afterSave("Scan", function(request) {
    var toPush = false;

    var query = new Parse.Query("Car");
    query.find({
    success: function(cars){
        var car;

        for (var i = 0; i < cars.length; i++)
            if (cars[i].get('scannerId') == request.object.get('scannerId'))
                car = cars[i];

        var edmunds_api_key = 'dfzumkss4nmcp6pu2uh8gssv';
        var reqUrl = 'api.edmunds.com' + '/api/vehicle/v2/' + car.get('make') + '/' + car.get('model') + '/' + car.get('year') + '?fmt=json&api_key=' + edmunds_api_key;

        Parse.Cloud.httpRequest({
            url: reqUrl,
            success: function (response){
                var maintenanceReqUrl = "api.edmunds.com" + "/v1/api/maintenance/actionrepository/findbymodelyearid?modelyearid=" + JSON.parse(response.text).id + "&fmt=json&api_key=" + edmunds_api_key;

                    Parse.Cloud.httpRequest({
                        url: maintenanceReqUrl,
                        success: function (res){
                            var servicevar s = JSON.parse(res.text).actionHolder;
                            var carMil = request.object.get("mileage");
                            var totalPriority = 0;

                            var serviceString = Array.apply(null, Array(48)).map(Number.prototype.valueOf,0);
                            var oldServiceString = [];
                            var temp = car.get("serviceString");
                            for (var i = 0; i < temp.length; i++) {
                              oldServiceString.push(temp[i]);
                            }


                            var Notification = Parse.Object.extend("Notification")
                            var notficationToSave = new Notification;
                            var notString = car.get('make') + " " + car.get('model') + " needs the following services: ";
                            var intvervalMileageZeroString = "";
                            var totalServicesPushed = 0;

                            // if (carMil != undefined){ car.set('totalMileage', carMil); }

                            var query = new Parse.Query("Service");
                            query.find({
                                success: function(sersStack){
                                    var servicesInRange;

                                    var serviceHistoryQuery = new Parse.Query("ServiceHistory");

                                    query.find({
                                    	success: function (sH){
                                    		var tempCarMil = carMil;
                                    		for (var i = 0; i < services.length; i++){
		                                        for (var j = 0; j < sersStack.length; j++){
		                                        	tempCarMil = carMil;
		                                            if (services[i].action == sersStack[j].get("action") && services[i].item == sersStack[j].get("item")){

		                                            	for (var k = 0; k < sH.length; k++)
		                                            		if (sersStack[j].get("Id") == sH[k].get("serviceId"))
		                                            			tempCarMil -= sH[k].get("mileage");

		                                                if (tempCarMil % services[i].intervalMileage <= 50 || tempCarMil % services[i].intervalMileage >= services[i].intervalMileage - 50){
		                                                    if (services[i].intervalMileage != 0){
		                                                        notString += services[i].action + " " + services[i].item + ", ";
		                                                        toPush = true;
		                                                        totalServicesPushed += 1;
		                                                        totalPriority += sersStack[j].get("priority");

		                                                        console.log("oldServiceString: ", oldServiceString);
		                                                        oldServiceString[sersStack[j].get("Id")] = "1";


		                                                        // serviceString += "1";
		                                                    } else if (services[i].intervalMileage == 0){
		                                                        intvervalMileageZeroString += services[i].action + " " + services[i].item + ", ";
		                                                    }
		                                                }
		                                            }
		                                        }
		                                    }

		                                    temp = oldServiceString;
		                                    oldServiceString = "";
		                                    for (var i = 0; i < temp.length; i++) {
		                                      oldServiceString += temp[i];
		                                    }


		                                    if (toPush && totalPriority >= 3){
		                                        notString += intvervalMileageZeroString;
		                                        notString[notString.length - 1] = "."

		                                        notficationToSave.set("content", notString);
		                                        notficationToSave.set("scanId", request.object.get("objectId"));
		                                        notficationToSave.set("title", "You have " + totalServicesPushed + " service(s) due!");
		                                        notficationToSave.set("toId", car.get("owner"));



		                                        notficationToSave.save(null, {
		                                            success: function(ns){  },
		                                            error: function (saveError){ console.error(saveError); }
		                                        });
		                                    }

		                                    car.set("serviceString", oldServiceString);
		                                    car.set("totalMileage", carMil);
		                                    if (toPush) {
		                                      car.set("serviceDue", true);
		                                    }
		                                    car.save(null, {
		                                        success: function(savedCar){ console.log("car saved"); },
		                                        error: function (saveError){ console.log("car not saved"); console.error(saveError); }
		                                    });
                                    	},
                                    	error: function (eR){
                                    		console.error(eR);
                                    	}
                                    });


                                },
                                error: function (serError){ console.error(serError); }
                            });
                        },
                        error: function (error){ console.error(error); }
                    });
            },
            error: function(err){ console.error(err); }
        });
    },
    error: function(error){ console.error("Error finding car!"); }
  })
});
