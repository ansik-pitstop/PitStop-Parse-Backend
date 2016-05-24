var recallMasters = require("cloud/recallMasters.js");
// var testCode = require("cloud/testCode.js");
var sendgrid = require("cloud/sendgrid_personal.js");
sendgrid.initialize("ansik", "Ansik.23");

var u = require('underscore');

/*
 Constants + Config
 */
var EDMUNDS_API = {
    host: "api.edmunds.com",
    tail: "fmt=json&api_key=9mu2f8rw93jaxtsj9dqkbtsx",
    requestPaths: {
        makeModelYearId: function(make, model, year) {
            var path = "/api/vehicle/v2/";
            return EDMUNDS_API.host + path + make + "/" + model + "/" + "/" + year + '?' + EDMUNDS_API.tail;
        },
        maintenance: function(Id) {
            console.log("carMakeModelYearId: " + Id);
            var path = "/v1/api/maintenance/actionrepository/findbymodelyearid?modelyearid=";
            return EDMUNDS_API.host + path + Id + '&' + EDMUNDS_API.tail;
        },
        recall: function(Id) {
            console.log("carMakeModelYearId: " + Id);
            var path = "/v1/api/maintenance/recallrepository/findbymodelyearid?modelyearid=";
            return EDMUNDS_API.host + path + Id + '&' + EDMUNDS_API.tail;
        }
    }

};

// this converts the pids from hex to dec, as specified by the device documents.
Parse.Cloud.beforeSave("Scan", function(request, response) {
    var PIDArray = request.object.get("PIDArray");
    // only do for new objects
    if (request.object.isNew() && PIDArray) {
        // pid array is a loop of pid timestamps
        // ex; Pidarray: [[pids:[id: 210d, data: 0000, id:210c, data:FF00], timestamp:unixtime], [pids:....]]
        for (var i = 0; i < PIDArray.length; i++) {
            pids = PIDArray[i]['pids'];
            if (pids) {
                // iterate backwards so we can remove things as we go through
                for (var j = pids.length - 1; j >= 0; j--) {
                    var id = pids[j]['id'];
                    var data = pids[j]['data'];
                    if (data) {
                        // device occasionally dumps repeated data as a large object, so delete that
                        // ex: 1...2....3...4...5...(1,2,3,4,5)
                        if (data.indexOf(',') !== -1) {
                            var index = pids.indexOf(pids[j]);
                            // delete from pids
                            pids.splice(index, 1);
                            continue;
                        }

                        // the first 2 hex bytes as int
                        var x2 = parseInt(data.substring(0, 2), 16);
                        var x1 = 0;
                        if (data.length > 2) {
                            // the second 2 hex bytes as int
                            x1 = parseInt(data.substring(2, 4), 16);
                        }
                        // overall hex as int
                        data = parseInt(data, 16);

                        // see specs for more info on these conversion functions
                        if (id === "2105" || id === "210F") {
                            data = data - 40.0;
                        }
                        else if (id === "210C") {
                            data = ((x2 * 256.0) + x1) / 4.0;
                        }
                        else if (id === "2110") {
                            data = ((x2 * 256.0) + x1) * 0.01;
                        }
                        else if (id === "210E") {
                            data = (data * 127.0 / 255.0) - 64.0;
                        }
                        else if (id === "2104" || id === "2111") {
                            data = data * 100.0 / 255.0;
                        }
                        else if (id === "210A") {
                            data = data * 3.0;
                        }
                        else if (id === "2114" || id === "2115" || id === "2116" || id === "2117" || id === "2118" || id === "2119" || id === "211A" || id === "211B") {
                            data = data * 1.275 / 255.0;
                        }
                        else if (id === "2106" || id === "2150" || id === "2151" || id === "2107" || id === "2108" || id === "2109") {
                            data = (data - 128.0) * 100.0 / 128.0;
                        }
                        else if (id === "211F" || id === "2121") {
                            data = (x2 * 256.0) + x1;
                        }
                        else if (id === "2122") {
                            data = ((x2 * 256.0) + x1) * 0.079;
                        }
                        else if (id === "2123") {
                            data = ((x2 * 256.0) + x1) * 10.0;
                        }
                        else if (id === "2152" || id === "2153" || id === "2154" || id === "2155") {
                            data = ((x2 * 256.0) + x1) * 7.995 / 65535.0;
                        }
                        else if (id === "2124" || id === "2125" || id === "2126" || id === "2127" || id === "2128" || id === "2129" || id === "212A" || id === "212B") {
                            data = ((x2 * 256.0) + x1) * 1.999 / 65535.0;
                        }
                        else if (id === "2101") {
                            data = data % 128;
                        }
                        // save new pid
                        pids[j]['data'] = data;
                    }
                }
            }
            // save new converted pids
            PIDArray[i]['pids'] = pids;
        }
        // save new converted pidarray
        request.object.set('PIDArray', PIDArray);
    }

    // match scannerid to current vin (as it changes over time)
    // scannerid is required (otherwise the scan is useless)
    if (!request.object.get('scannerId')) {
        response.error("Scannerid undefined");
    }
    else {
        var carQuery = new Parse.Query("Car");
        carQuery.equalTo("scannerId", request.object.get("scannerId"));
        // only worry about one.. if there are multiple its not our job to fix it
        carQuery.first({
            success: function(car) {
                if (car) {
                    request.object.set('VIN', car.get("VIN"));
                }
                // if no car matches save anyways
                response.success();
            },
            error: function(error) {
                response.error("Scan BeforeSave query error: " + error);
            }
        });
    }
});

// only save unique recalls
Parse.Cloud.beforeSave("EdmundsRecall", function(request, response) {
    var edmundsId = request.object.get("edmundsId");
    var edmundsQuery = new Parse.Query("EdmundsRecall");
    edmundsQuery.equalTo("edmundsId", edmundsId);
    edmundsQuery.first({
        success: function(data) {
            if (data !== undefined) {
                //checks if there is existing object in table with service
                response.error("An EdmundsRecall with this edmundsId already exists.");
            }
            else {
                //if there is not existing object with edmundsId, continue with save
                response.success();
            }
        },
        error: function(error) {
            console.error(error);
            response.error("EdmundsRecall BeforeSave query error: " + error);
        }
    });
});

// verify mileage is correctt
Parse.Cloud.beforeSave("TripMileage", function(request, response) {
    var trip = request.object;
    if (trip.isNew()) {
        if (trip.get("mileage") <= 0) {
            response.error("mileage must be positive");
        }
        else {
            // dont save multiple trips
            var query = new Parse.Query("TripMileage");
            query.equalTo("tripId", trip.get("tripId"));
            query.equalTo("scannerId", trip.get("scannerId"));
            query.equalTo("rtcTime", trip.get("rtcTime"));
            query.first({
                success: function(data) {
                    if (data) {
                        response.error("Duplicate trip");
                    }
                    else {
                        response.success();
                    }
                },
                error: function(error) {
                    console.error(error);
                    response.error("TripMileage BeforeSave query error: " + error);
                }
            });
        }
    }
});

// update car with new mileage
Parse.Cloud.afterSave("TripMileage", function(request, response) {
    var trip = request.object;
    // talk to mobile devs for the reasons behind tripflag/bluetoothconnection
    if (!trip.existed() && (trip.get("tripFlag") === "9") && (trip.get("bluetoothConnection") === "connected")) {
        var carQuery = new Parse.Query("Car");
        // filter for car
        carQuery.equalTo("scannerId", trip.get("scannerId"));
        carQuery.first({
            success: function(car) {
                if (car) {
                    var newMileage = car.get("totalMileage");
                    // query for similar tripmileages for this car, with same id.
                    var query = new Parse.Query("TripMileage");
                    query.equalTo("tripId", trip.get("tripId"));
                    query.equalTo("scannerId", trip.get("scannerId"));
                    query.notEqualTo("objectId", trip.id);

                    // mobile will post multiple trip mileages for one "trip", with a trip being when you turn car on till you turn it off.
                    // we only want to add the final mileage
                    // ex, you drive 5km total, you get a post of 1km,2km,3km,4km, and then 5km for the trip.
                    // so keep the car updated with the highest mileage of the trip.
                    query.find({
                        success: function(data) {
                            if (data) {
                                // find highest mileage with this tripId so far
                                var maxMileage = 0;
                                for (var i = 0; i < data.length; i++) {
                                    if (data[i].get("mileage") > maxMileage) {
                                        maxMileage = data[i].get("mileage");
                                    }
                                }

                                // if max mileage is less than the current one, we want to increase the cars mileage by the difference between them
                                if (maxMileage < trip.get("mileage")) {
                                    // increase by difference
                                    var diff = trip.get("mileage") - maxMileage;
                                    newMileage += diff;

                                    // this fixes precision issues
                                    car.set("totalMileage", Math.round(newMileage * 100) / 100);
                                }
                                else {
                                    // maxmileage is greater or equal to this trip, so do nothing
                                    return;
                                }
                            }
                            else {
                                // unique tripId, so increase by trip mileage
                                newMileage += trip.get("mileage");
                                // fix precision issues
                                car.set("totalMileage", Math.round(newMileage * 100) / 100);
                            }
                            // save
                            car.save(null, {
                                success: function(savedCar) {
                                    console.log("car saved");
                                    // mileage updated, so run carserviceupdate
                                    Parse.Cloud.run("carServicesUpdate", {
                                        carVin: car.get("VIN")
                                    });
                                },
                                error: function(saveError) {
                                    console.log("car not saved");
                                    console.error(saveError);
                                }
                            });
                        },
                        error: function(error) {
                            console.log("tripmileage query error" + error);
                        }
                    });
                }
                else {
                    console.log("car with scannerId " + trip.get("scannerId") + " didnt exist for trip " + trip.id);
                }
            },
            error: function(error) {
                console.log("car query error" + error);
            }
        });
    }
});

Parse.Cloud.beforeSave("Car", function(request, response) {
    var car = request.object;
    if (car.isNew()) { // car doesnt exist yet
        // set array fields to default values of empty
        car.set("pendingIntervalServices", []);
        car.set("pendingEdmundServices", []);
        car.set("pendingFixedServices", []);
        car.set("storedDTCs", []);

        // if no mileage given set to 0
        if (!car.get("baseMileage")) {
            car.set("baseMileage", 0);
        }

        // set total to base mileage.
        car.set("totalMileage", car.get("baseMileage"));

        // always save the VIN as in uppercase
        // changes O to 0, i to 1, Q to 0
        car.set("VIN", car.get("VIN").toUpperCase().replace(/I/g, "1").replace(/O/g, "0").replace(/Q/g, "0"));

        // check vin is unique
        if (!car.get("VIN")) {
            response.error('vin must exist');
        }
        else if (car.get("VIN").length !== 17) {
            response.error('vin must be 17 chars');
        }
        else {
            var query = new Parse.Query("Car");
            query.equalTo("VIN", request.object.get("VIN"));
            query.first({
                success: function(object) {
                    if (object && object.id !== request.object.id) {
                        response.error("VIN already exists");
                    }
                    else {
                        response.success();
                    }
                },
                error: function(error) {
                    response.error("Could not validate uniqueness for this Car object.");
                }
            });
        }
    }
    else { // car already existed
        // temporary for main branch, to fix old cars before the default above values were set
        if (!car.get("pendingIntervalServices")) {
            car.set("pendingIntervalServices", []);
        }
        if (!car.get("pendingEdmundServices")) {
            car.set("pendingEdmundServices", []);
        }
        if (!car.get("pendingFixedServices")) {
            car.set("pendingFixedServices", []);
        }
        if (!car.get("storedDTCs")) {
            car.set("storedDTCs", []);
        }

        // set number of services every time a car is updated
        // mobile should do this... no reason to have a column for this.
        var numberServices = 0;
        numberServices += car.get("pendingIntervalServices").length +
            car.get("pendingEdmundServices").length +
            car.get("pendingFixedServices").length +
            car.get("storedDTCs").length;
        car.set("numberOfServices", numberServices);
        response.success();
    }
});

// if service history is updated, it means a service for a car was probably marked done
// so we need to run carserviceupdate again, so it is removed from its respective array (pending....services)
Parse.Cloud.afterSave("ServiceHistory", function(request) {
    if (!request.object.existed()) {
        var carQuery = new Parse.Query("Car");
        carQuery.equalTo("objectId", request.object.get("carId"));
        carQuery.first({
            success: function(car) {
                if (car !== undefined) {
                    Parse.Cloud.run("carServicesUpdate", {
                        carVin: car.get("VIN")
                    });
                }
            },
            error: function(error) {
                console.log("service not found");
                console.error(error);
            }
        });
    }
});

Parse.Cloud.afterSave("Car", function(request) {
    var car = request.object;

    // new car
    if (!car.existed()) {
        // send signup notification
        if (!Parse.User.current().get("firstCar")) {
            var Notification = Parse.Object.extend("Notification");
            var notificationToSave = new Notification();
            var notificationContent = "Welcome to Pitstop!";
            var notificationTitle = "Welcome!";

            notificationToSave.set("content", notificationContent);
            notificationToSave.set("title", notificationTitle);
            notificationToSave.set("toId", Parse.User.current().id);
            notificationToSave.save(null, {
                success: function(notificationToSave) {
                    //saved
                },
                error: function(notificationToSave, error) {
                    console.error("Error: " + error.code + " " + error.message);
                }
            });
            Parse.User.current().set("firstCar", true);
            Parse.User.current().save();
        }

        // do recall stuff... ask jiawei whats going on in recallmasterswrapper
        Parse.Cloud.run("recallMastersWrapper", {
            "vin": car.get("VIN"),
            "car": car.id
        });

        // totalMileage should never be undefined
        var mileage = car.get("totalMileage");
        if (mileage === undefined || mileage === 0) {
            mileage = car.get("baseMileage");
        }

        // add edmunds services

        console.log("getting vechicle id from edmunds");

        var edmundServices = undefined;
        var approvedServices = undefined;

        Parse.Cloud.httpRequest({
            url: EDMUNDS_API.requestPaths.makeModelYearId(
                car.get('make'),
                car.get('model'),
                car.get('year')
            )
        }).then(function(result) {
            var carMakeModelYearId = JSON.parse(result.text).id;
            var url = EDMUNDS_API.requestPaths.maintenance(carMakeModelYearId);
            console.log("vechicle id: " + carMakeModelYearId);
            var params = {
                url: url
            }
            console.log("getting edmunds services from: " + url);

            return Parse.Cloud.httpRequest(params);
        }).then(function(services) {
            edmundServices = JSON.parse(services.text).actionHolder;

            var query = new Parse.Query("Service");

            console.log("getting approved edmunds services");

            return query.find();
        }).then(function(services) {
            approvedServices = services;

            console.log("# of edmunds services found: " + edmundServices.length);
            console.log("# of approved services found: " + approvedServices.length);

            var req = {};
            req.params = {
                edmundServices: edmundServices,
                serviceList: approvedServices,
                carObject:
                {
                    make: car.get('make'),
                    model: car.get('model'),
                    year: car.get('year')
                }
            }
            return addEdmundsServices(req);
        })
    }

    //should run job/func here to update services/mileage at an interval
});

Parse.Cloud.afterSave("Scan", function(request) {
    var scan = request.object;

    // if dtcdata, it means their are dtcs for the car, so go do updateDTCS
    var dtcData = scan.get("DTCs");
    if (dtcData !== undefined && dtcData !== "") {
        Parse.Cloud.run("updateDtcs", {
            scannerId: scan.get("scannerId"),
            carVin: scan.get("carVin"),
            DTCs: dtcData,
            id: scan.id
        }, {
            success: function(result) {
                console.log("dtc success: ");
                console.log(result);
            },
            error: function(error) {
                console.log(error);
                console.error(error);
            }
        });
    }

    // real time processing
    if (!request.object.existed()) {
        var scannerValues = {};
        var scanner;
        var owner = undefined;
        var car;
        var carQuery = new Parse.Query("Car");
        carQuery.equalTo("scannerId", request.object.get("scannerId"));
        // need to get car and owner, asynch..
        carQuery.first({
            success: function(data) {
                if (data) {
                    car = data;
                    owner = car.get("owner");
                }
                else {
                    return; // no owner?
                }
            },
            error: function(error) {
                console.error(error);
            }
        }).then(function() {
            // the scanner table is something that keeps track of various running values, for each pid, for each car.
            // for example, it might track the average, high, and low, of a pid such as 210D
            var query = new Parse.Query("Scanner");
            query.equalTo("scannerId", request.object.get("scannerId"));
            query.first({
                success: function(data) {
                    if (data) {
                        scanner = data;
                        var jsonData = data.toJSON();
                        for (var key in jsonData) {
                            // we want to ignore these keys
                            if (key == "scannerId" || key == "objectId" || key == "updatedAt" || key == "createdAt") {
                                continue;
                            }

                            // store all other columns in dictionaries.. we dont know what they are so this is done dynamically
                            scannerValues[key] = data.get(key);
                        }
                    }
                    else {
                        // create a new one scanner if it doesnt exist yet.
                        scanner = new Parse.Object("Scanner");
                        scanner.set("scannerId", request.object.get("scannerId"));
                    }
                },
                error: function(error) {
                    console.error(error);
                }
            }).then(function() {
                // remember this is aftersave scan, so we have a single pidarray we are going to process
                var PIDArray = request.object.get("PIDArray");
                if (PIDArray) {
                    // loop through the individual pids, and "process", them
                    for (var i = 0; i < PIDArray.length; i++) {
                        pids = PIDArray[i]['pids'];
                        if (pids) {
                            processPids(pids, PIDArray[i]["rtcTime"], owner);
                        }
                    }

                    // update scanner to new values.. process pids updates scannervalues async
                    for (var key in scannerValues) {
                        // this creates new columns if they dont exist
                        scanner.set(key, scannerValues[key]);
                    }
                    scanner.save(null, {
                        success: function(saved) {},
                        error: function(saveError) {
                            console.log("not saved");
                            console.error(saveError);
                        }
                    });
                }
            }, function(error) {
                alert("Error: " + error.code + " " + error.message);
            });
        }, function(error) {
            alert("Error: " + error.code + " " + error.message);
        });
    }

    // this processes an indivudal "pids", which is an object in the array PIDArray, a slice of the pid values at a point in time
    function processPids(pids, timestamp, owner) {
        // get all keys, or pid ids, and put them in a dictionary.
        var hash = {};
        for (var j = 0; j < pids.length; j++) {
            var id = pids[j]['id'];
            var data = pids[j]['data'];
            if (data !== undefined && id) {
                hash[id] = data;
            }
        }

        // if these values are 0, the car is not running. shyams words, not mine. rpm and speed i think.
        if ("210D" in hash && "210C" in hash &&
            (hash["210D"] === 0 && hash["210C"] === 0)) {
            // reset all values in scannerValues to 0
            for (var key in scannerValues) {
                // the running values restart everytime you start the car
                scannerValues[key] = 0;
            }
        }
        else {
            // we are still driving, so update the old scannerValues
            for (var key2 in hash) {
                // shyam only wants to track 2106 and 2105 right now, remove that and it will track them all
                // dont track 210d and 210c (they are speed and rpm, they change alot, no indication of problems)
                if (!(key2 === "2106" || key2 === "2105") ||
                    key2 === "210D" || key2 === "210C") { // no need to track speed/rpm
                    continue;
                }
                else {
                    // these are algorithms written by other people, again, talk to shyam if you want to understand it.
                    var runSum, tRunSum, points;

                    // runningSum2106... runningSum2105 is the column name
                    // if it already exists we will add the current value to this 'running sum'
                    if (("runningSum" + key2) in scannerValues) {
                        runSum = scannerValues["runningSum" + key2] + hash[key2];
                    }
                    else {
                        runSum = hash[key2];
                    }

                    // increase the number of points (runningsum/points = average)
                    if (("points" + key2) in scannerValues) {
                        points = scannerValues["points" + key2] + 1;
                    }
                    else {
                        points = 1;
                    }

                    // same thing as running sum
                    if (("tVarRunningSum" + key2) in scannerValues) {
                        var tvar = Math.pow(hash[key2] - (runSum / points), 2);
                        tRunSum = scannerValues["tVarRunningSum" + key2] + tvar;
                    }
                    else {
                        tRunSum = 0;
                    }

                    var variance = tRunSum / (points - 1);
                    var average = runSum / points;
                    var sigma = Math.sqrt(variance);
                    var high = average + (2 * sigma);
                    var low = average - (2 * sigma);

                    // remove key2===2105 to apply this to all keys,along with the part above
                    //send a notification alert if this triggers the conditions
                    if (key2 === "2105" && points > 15 && (hash[key2] > high)) { //looks for rapid changes indicative of leaks
                        if (owner !== undefined) {
                            console.log("out of bounds" + key2 + ", average:" + hash[key2] + "high" + high + " low:" + low);
                            var Notification = Parse.Object.extend("NotificationArchived");
                            var notificationToSave = new Notification();
                            var notificationContent = "key:" + key2 + " value:" + hash[key2] + " high:" + high + " low:" + low + " dataPoints:" + points + " timestamp:" + timestamp + " id:" + request.object.id;
                            var notificationTitle = "Coolant Temp Alert!";
                            notificationToSave.set("content", notificationContent);
                            notificationToSave.set("scanId", request.object.get("scannerId"));
                            notificationToSave.set("title", notificationTitle);
                            // notificationToSave.set("toId", owner); dont notify on prod
                            notificationToSave.save(null, {
                                success: function(notificationToSave) {
                                    //saved
                                },
                                error: function(notificationToSave, error) {
                                    console.error("Error: " + error.code + " " + error.message);
                                }
                            });
                        }
                        else {
                            console.log("out of bounds, scannerId " + request.object.get("scannerId") + " not linked to car. " + key2 + " value:" + hash[key2] + " mean:" + average + " sigma:" + sigma + " dataPoints:" + points + " timestamp:" + timestamp + " id:" + request.object.id);
                        }
                    }

                    // same as above,  different formula
                    if (key2 === "2106" && points > 15 && ((Math.abs(average) > 1.5 && sigma > 5.0) || (sigma > 6.0))) { //accounts for shift of peak
                        if (owner !== undefined) {
                            console.log("out of bounds" + key2 + ", average:" + hash[key2] + " mean:" + average + " sigma:" + sigma);
                            var Notification = Parse.Object.extend("NotificationArchived");
                            var notificationToSave = new Notification();
                            var notificationContent = "key:" + key2 + " value:" + hash[key2] + " mean:" + average + " sigma:" + sigma + " dataPoints:" + points + " timestamp:" + timestamp + " id:" + request.object.id;
                            var notificationTitle = "algorithm alert!";
                            notificationToSave.set("content", notificationContent);
                            notificationToSave.set("scanId", request.object.get("scannerId"));
                            notificationToSave.set("title", notificationTitle);
                            // notificationToSave.set("toId", owner); dont send notifications on production
                            notificationToSave.save(null, {
                                success: function(notificationToSave) {
                                    //saved
                                },
                                error: function(notificationToSave, error) {
                                    console.error("Error: " + error.code + " " + error.message);
                                }
                            });
                        }
                        else {
                            console.log("out of bounds, scannerId " + request.object.get("scannerId") + " not linked to car. " + key2 + " value:" + hash[key2] + " mean:" + average + " sigma:" + sigma + " dataPoints:" + points + " timestamp:" + timestamp + " id:" + request.object.id);
                        }
                    }

                    // set the scannervalues for this key to keep them saved for the future.
                    scannerValues["runningSum" + key2] = runSum;
                    scannerValues["points" + key2] = points;
                    scannerValues["tVarRunningSum" + key2] = tRunSum;
                }
            }
        }
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
    if (carVin === undefined && scannerId === undefined) {
        response.error("No vin or scannerid provided");
    }
    else if (carVin === undefined) {
        query.equalTo("scannerId", scannerId);
    }
    else {
        query.equalTo("VIN", carVin);
    }

    query.first({
        success: function(car) {
            if (car) {
                foundCar(car);
            }
            else {
                response.error("No results for car with VIN: " + carVin + " or scan id " + scannerId);
            }
        },
        error: function(error) {
            response.error("No results for car with VIN: " + carVin + " or scan id " + scannerId);
        }
    });

    // we found the car related to the scan, now update its dtcs
    var foundCar = function(car) {
        // parse dtcs and create notification
        var dtcData = scan["DTCs"];
        console.log("dtcs");
        // dtcs are saved as 'dtc1,dtc2,dtc3'
        var dtcs = dtcData.split(",");
        var dtclst = [];
        for (var i = 0; i < dtcs.length; i++) {
            //check for DTCs
            if (dtcs[i] !== "") {
                // add if new
                if (car.get("storedDTCs").indexOf(dtcs[i]) === -1) {
                    car.addUnique("storedDTCs", dtcs[i]);
                    // this query needs to be run each time... there are too many results for dtcs...
                    var query = new Parse.Query("DTC");
                    query.equalTo("dtcCode", dtcs[i]);
                    query.find({
                        success: function(data) {
                            if (data.length > 0) {
                                dtclst.push(data[0]);
                                //send a notification about the dtc
                                notify(data[0], car);
                            }
                        },
                        error: function(error) {
                            console.error("Could not find the dtc with code: ", dtcs[i]);
                        }
                    });
                }
            }
        }

        // save the car, and then send an email about the dtc to the users dealership.
        car.save(null, {
            success: function(savedCar) {
                console.log("car saved"); // success for cloud function
            },
            error: function(saveError) {
                console.log("car not saved");
                console.error(saveError);
                response.error("car not saved"); //failure for cloud function
                return;
            }
        }).then(function() {
            if (dtclst.length > 0) {
                shopQuery = new Parse.Query("Shop");
                shopQuery.equalTo("objectId", car.get("dealership"));
                shopQuery.first({
                    success: function(shop) {
                        userQuery = new Parse.Query(Parse.User);
                        userQuery.equalTo("objectId", car.get("owner"));
                        userQuery.first({
                            success: function(user) {
                                sendEmail(user, car, shop, dtclst);
                            },
                            error: function(error) {
                                console.error(error);
                                response.error();
                            }
                        });
                    },
                    error: function(error) {
                        console.log("Error " + error);
                        response.error();
                    }
                });
            }
            else {
                response.success();
            }
        }, function(error) {
            response.error("Error: " + error.code + " " + error.message);
        });
    };

    // send email about the dtc sent to the customer
    function sendEmail(user, car, shop, dtclst) {
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

        for (i = 0; i < dtclst.length; i++) {
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

        var email = sendgrid.Email({
            to: [shop.get("email")]
        });
        email.setFrom(user.get("email"));
        email.setSubject("Notification sent to " + user.get("name"));
        // we need to delay the email by 70 hours to give them time to respond - shiva
        // sendat is limited to 72 hours in the future i think.
        email.setSendAt(parseInt(new Date().toUTCString()) + 70 * 60 * 60); // 60 seconds * 60 minutes * 70 hours = 70 hour delay
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

    // send notification about dtc to customer
    var notify = function(data, car) {
        var description = data.get("description");
        var dtc = data.get("dtcCode");
        var Notification = Parse.Object.extend("Notification");
        var notificationToSave = new Notification();
        var notificationContent = car.get("make") + " " + car.get("model") + " has DTC Code " + dtc + ": " + description;
        var notificationTitle = car.get("make") + " " + car.get("model") + " has DTC Code " + dtc;

        notificationToSave.set("content", notificationContent);
        notificationToSave.set("scanId", scan.id);
        notificationToSave.set("title", notificationTitle);
        notificationToSave.set("toId", car.get("owner"));
        notificationToSave.set("carId", car.id);
        notificationToSave.save(null, {
            success: function(notificationToSave) {
                //saved
            },
            error: function(notificationToSave, error) {
                console.error("Error: " + error.code + " " + error.message);
            }
        });
    };
});

// if new user is created we send them a signup email
Parse.Cloud.afterSave(Parse.User, function(request, response) {
    Parse.Cloud.useMasterKey();
    var user = request.object;
    // signupEmail is true if we already sent them an email.
    if (request.object.existed() === false) {
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

// this is what sends notifications
Parse.Cloud.afterSave("Notification", function(request) {
    //push notification
    var notification = request.object;

    var pushQuery = new Parse.Query(Parse.Installation);

    // send the notification to the column 'toId'
    pushQuery.equalTo('userId', notification.get("toId"));

    Parse.Push.send({
        where: pushQuery,
        badge: "Increment",
        data: {
            // you can add more variables here
            alert: notification.get("content"), //to enable ios push
            title: notification.get("title")
        }
    }, {
        success: function() {},
        error: function(error) {
            console.error("Error: " + error.code + " : " + error.message);
        }
    });
});

// we query edmunds then run this function that parses what it sent back and adds rows to the edmundsservice table
var addEdmundsServices = function(request) {
    var serviceList = request.params.serviceList;
    var createEdmundsService = function(service, carObject) {
        var Edmunds = Parse.Object.extend("EdmundsService");
        var eService = new Edmunds();

        eService.set('priority', 0);

        // setting priority based on what we put in the service table.
        if (service["frequency"] === 3 || service["frequency"] === 4) {
            for (var i = 0; i < serviceList.length; i++) {
                // when we find the matching one we stop
                // we dont query specifically for this because in that case you would have a new query for each service
                // this way we only query once for all of them
                if ((service["item"] === serviceList[i][0]) &&
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

    // create the edmundsservices for each of the ones in the array we are given
    for (var i = 0; i < request.params.edmundServices.length; i++) {
        if (request.params.edmundServices[i]["intervalMileage"] === 0) {
            continue;
        }
        // save each result in the services array
        services.push(createEdmundsService(request.params.edmundServices[i], request.params.carObject));
    }

    // save them all at once.
    Parse.Object.saveAll(services, {
        success: function(data) {
            console.log("edmunds service saved");
        },
        error: function(saveError) {
            console.error("service not saved");
            console.error(saveError.message);
        }
    });

}

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
        recalls.push(createEdmundsService(request.params.recalls[i], request.params.carObject));
    }

    Parse.Object.saveAll(recalls, {
        success: function(data) {
            console.log("recall saved");
            status.success("recall saved"); // success for cloud function
        },
        error: function(saveError) {
            console.log("recall not saved");
            console.error(saveError);
            status.error("recall not saved"); //failure for cloud function
        }
    });
});

// function that manages all the services for the car, also the edmunds services (which should be decoupled)
Parse.Cloud.define("carServicesUpdate", function(request, response) {
    scan = request.params;

    // Initializing variables
    var car = null;
    var carMakeModelYearId = null;
    var totalMileage = 0;
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
    if (carVin === undefined && scannerId === undefined) {
        response.error("No vin or scannerid provided");
    }
    else if (carVin === undefined) {
        query.equalTo("scannerId", scannerId);
    }
    else {
        query.equalTo("VIN", carVin);
    }

    query.find({
        success: function(cars) {
            if (cars.length > 0) {
                foundCar(cars[0]);
            }
            else {
                response.error("No results for car with VIN: " + scan['carVin']);
            }
        },
        error: function(error) {
            console.error("Could not find the car with VIN: ", scan['carVin']);
            console.error("ERROR9: ", error);
        }
    });

    /*
    This function is called when the car associated with the
    current scan is found
    */
    var foundCar = function(loadedCar) {
        // assigning the loadedCar to global car
        car = loadedCar;
        pendingInterval = car.get("pendingIntervalServices");
        console.log("checking services for car " + car.get("VIN"));
        console.log("# of pending interval services: " + pendingInterval.length);

        // we pass mileage with the scan object
        var scanMileage = scan["mileage"];
        if (scanMileage === undefined) {
            scanMileage = 0;
        }

        // setting the car mileage
        if (scanMileage !== 0) {
            totalMileage = scanMileage;
        }
        else {
            if (car.get("totalMileage") === undefined ||
                car.get("totalMileage") === 0) {
                totalMileage = car.get("baseMileage");
            }
            else {
                totalMileage = car.get("totalMileage");
            }
        }
        car.set("totalMileage", totalMileage);

        // i dont think anyone knows why this is done
        if (scan["freezeData"] !== undefined) { //exists
            if (scan["freezeData"] !== "[]") { //not empty
                car.AddUnique("storedFreezeFrames", scan["freezeData"]);
            }
        }

        // get history of each of the 3 services for the car
        var ServiceHistoryQuery = new Parse.Query("ServiceHistory");
        ServiceHistoryQuery.equalTo("carId", car.id);
        ServiceHistoryQuery.each(function(history) {
            var type = history.get("type");
            var objID = history.get("serviceObjectId");
            var mileage = history.get("mileage");

            // check whether current service exists in pending services
            if (type === 0) { // edmunds
                edmundsHistory.push([objID, mileage]);
            }
            else if (type === 1) { // fixed
                fixedHistory.push([objID, mileage]);
            }
            else if (type === 2) { // interval
                intervalHistory.push([objID, mileage]);
            }
        }).then(function() {
            // if we have a dealership we do the dealerships services, otherwise we use edmunds
            if (car.get("dealership")) {
                // DEALER FIXED SERVICES
                // NOTE: fixed sericve not supported
                // var fixed = new Parse.Query("ServiceFixed");
                // // filter for same dealership and mileage less than current total
                // fixed.equalTo("dealership", car.get("dealership"));
                // fixed.each(function(service) {
                //     dealerServices = true;
                //     // get the history for this particular service
                //     var saveService = false;
                //     var history = false;
                //     for (var z = 0; z < fixedHistory.length; z++) {
                //         if (fixedHistory[z][0] === service.id) {
                //             history = true;
                //         }
                //     }
                //     // if no history and within the interval(minus 500) than add it to pendingFixed
                //     if (!history) {
                //         var intervalMileage = service.get("mileage");
                //         var serviceMileage = totalMileage % intervalMileage;
                //         if ((totalMileage >= intervalMileage - 500) && (serviceMileage <= 500 || Math.abs(intervalMileage - serviceMileage) <= 500)) {
                //
                //         }
                //     } {
                //
                //     }
                //
                //     if (saveService) {
                //         pendingFixed.push(service.id);
                //         fixedDesc.push([service.get("item"), service.get("action")]);
                //     }
                // });

                // DEALER INTERVAL BASED SERVICE
                var intervals = new Parse.Query("ServiceInterval");
                // filter for same dealership and mileage less than current total
                intervals.equalTo("dealership", car.get("dealership"));
                intervals.each(function(service) {
                    if (u.some(pendingInterval, function(objectId) {
                        return objectId === service.id;
                    })) {
                        console.log("service " + service.id + " is already in pending service, skipping")
                        return; // dont update existing service
                    }

                    var saveService = false;
                    dealerServices = true;
                    // get the history for this particular service
                    // find the mileage of the last time it was done
                    var history = false;
                    var historyMileage = 0;
                    for (var z = 0; z < intervalHistory.length; z++) {
                        if (intervalHistory[z][0] === service.id) {
                            history = true;
                            if (historyMileage < intervalHistory[z][1]) {
                                historyMileage = intervalHistory[z][1];
                            }
                        }
                    }

                    var totalMileage = car.get("totalMileage");
                    var intervalMileage = service.get("mileage");
                    var nextServiceMileage = 0;
                    var multiplier = 0;

                    // if no history and within the interval(minus 500) than add it to pendingFixed
                    // NOTE: historyMileage is 0 if no history found

                    if (history) {
                        multiplier = 1;
                    }
                    else {
                        if (totalMileage > 1) {
                            //multiplier indicates what interval of mileage the next service is in
                            multiplier = Math.round(totalMileage / (intervalMileage - 500 / 2));
                        }
                        else {
                            multiplier = 1;
                        }
                    }

                    multiplier = Math.max(multiplier, 1);

                    nextServiceMileage = intervalMileage * multiplier + historyMileage;

                    if (totalMileage >=  nextServiceMileage - 500) {
                        // save service if total milage is greater than of nextServiceMileage - 500
                        saveService = true;
                    }
                    else {
                        saveService = false;
                    }

                    // console.log("history service found: " + history + ", history mileage: " + historyMileage);
                    // console.log("current mileage: " + totalMileage);
                    // console.log("intervalMileage: " + intervalMileage);
                    // console.log("multiplier: " + multiplier);
                    // console.log("nextServiceMileage: " + nextServiceMileage);
                    // console.log("save service: " + saveService);
                    // console.log("");

                    if (saveService) {
                        console.log("saving service: " + service.id);
                        pendingInterval.push(service.id);
                        intervalDesc.push([service.get("item"), service.get("action")]);
                    }

                }).then(function() {
                    console.log("dealerServices: " + dealerServices);
                    // if no dealership, show edmunds services
                    // XXX there should be a better way to do this: a boolean in shop table?
                    if (!dealerServices) { // car has no dealership or dealership has no services
                        console.log("no dealearship specific service found. checking edmunds services");
                        updateEdmundServices();
                    }
                    else {
                        console.log("dealership specific services found.");
                        carSave(false);
                    }
                }, function(error) {
                    alert("Error: " + error.code + " " + error.message);
                });
            }
            else {
                console.log("no dealearship specific service found. checking edmunds services");
                updateEdmundServices();
            }
        }, function(error) {
            alert("Error: " + error.code + " " + error.message);
        });
    };

    // no dealership or dealership services, so use edmijds
    var updateEdmundServices = function() {
        console.log("getting edmunds services and valid service list");
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
        var promises = [];

        promises.push(edmundsQuery.find());
        promises.push(serviceQuery.find());

        console.log(promises)
        console.log(promises.length)

        Parse.Promise.when(promises).then(function(results) {
            console.log(results)
            var edmundsServices = results[0];
            var approvedServices = results[1];
            console.log(edmundsServices)
            console.log(approvedServices)
            console.log("# of edmunds services: " + edmundsServices.length);
            console.log("# of approved services: " + approvedServices.length);

            if (edmundsServices.length > 0) {
                console.log("# of edmunds services found for " + car.get("VIN") + ": " + edmundsServices.length);
                return getUpdatedRecalls(edmundsServices, approvedServices);

            }
            else {
                console.log("no edmunds services found for " + car.get("VIN") + ", no service updated");
                return;
            }
        })
    };

    var getpendingEdmundServices = function(edmundsServices, serviceList) {
        var pendingEdmundServices = car.get("pendingEdmundServices");
        var isValidService;
        var intervalMileage;
        var totalMileage = car.get("totalMileage");
        var save;
        var serviceEngineCode;
        var carEngineCode = car.get("engine").split(" ");
        var frequency;
        var serviceObjectId;
        var item;
        var action;
        var priority;
        var saveService;

        for (var i = 0; i < edmundsServices.length; i++) {
            var currentService = edmundsServices[i];
            isValidService = false;
            engineCode = currentService.get("engine");
            frequency = currentService.get("frequency");
            serviceObjectId = currentService.id;
            intervalMileage = currentService.get("intervalMileage");
            item = currentService.get("item");
            action = currentService.get("action");
            priority = currentService.get("priority");
            history = false;
            historyMileage = 0;
            saveService = false; // default

            if (engineCode === "0NAE" ||
                engineCode.charAt(0) !== engineCar[1].charAt(1) ||
                engineCode.slice(-3) !== engineCar[0].substring(0, 3)) {
                console.log("invlaid / unsupported engingCode in edmunds service: " + engineCode + ", skipping");
                continue;
            }

            // dont allow mileage <= 0
            if (intervalMileage <= 0) {
                console.log("mileage <= 0 in edmunds service, skipping");
                continue;
            }

            //check if our edmunds is in our allowed list of Services
            for (var x = 0; x < serviceList.length && !isValidService; x++) {
                isValidService = (serviceList[x][0] === item && serviceList[x][1] === action);

            }
            // the edmunds service doesnt exist in our list of approved services, go to next
            if (!isValidService) {
                console.log("unsupported edmunds services, skipping");
                continue;
            }
            if (priority === undefined || priority === 0) {
                console.log("invalid priority: " + priority + ", skipping");
                continue;
            }

            // get the history for this particular service
            // find the mileage of the last time it was done
            for (var z = 0; z < edmundsHistory.length; z++) {
                if (edmundsHistory[z][0] === id) {
                    history = true;
                    if (historyMileage < edmundsHistory[z][1]) {
                        historyMileage = edmundsHistory[z][1];
                    }
                }
            }

            // validation done. checking whether service exists

            if (u.some(pendingEdmundServices, function(objectId) {
                return objectId === serviceObjectId;
            })) {
                console.log("service " + serviceObjectId + " is already in pending edmunds services, skipping")
                continue;
            }

            var saveService = false;
            dealerServices = true;
            // get the history for this particular service
            // find the mileage of the last time it was done
            var history = false;
            var historyMileage = 0;
            for (var z = 0; z < intervalHistory.length; z++) {
                if (intervalHistory[z][0] === service.id) {
                    history = true;
                    if (historyMileage < intervalHistory[z][1]) {
                        historyMileage = intervalHistory[z][1];
                    }
                }
            }

            var nextServiceMileage = 0;
            var multiplier = 0;

            // if no history and within the interval(minus 500) than add it to pendingFixed
            // NOTE: historyMileage is 0 if no history found

            // frequency === 3 -> fixed mileage service
            if (frequency === 3) {
                if (history) {
                    console.log("fixed mileage service " + serviceObjectId + "is alredy done. skipping");
                    continue;
                }
                else {
                    multiplier = 1;
                }
            }
            else {
                // frequency === 4 -> interval mileage service
                if (history) {
                    multiplier = 1;
                }
                else {
                    if (totalMileage > 1) {
                        //multiplier indicates what interval of mileage the next service is in
                        multiplier = Math.round(totalMileage / (intervalMileage - 500 / 2));
                    }
                    else {
                        multiplier = 1;
                    }
                }
            }

            multiplier = Math.max(multiplier, 1);
            nextServiceMileage = intervalMileage * multiplier + historyMileage;

            if (totalMileage >=  nextServiceMileage - 500) {
                // save service if total milage is greater than of nextServiceMileage - 500
                saveService = true;
            }
            else {
                saveService = false;
            }

            console.log("history service found: " + history + ", history mileage: " + historyMileage);
            console.log("current mileage: " + totalMileage);
            console.log("intervalMileage: " + intervalMileage);
            console.log("multiplier: " + multiplier);
            console.log("nextServiceMileage: " + nextServiceMileage);
            console.log("save service: " + saveService);
            console.log("");

            if (saveService) {
                serviceStack.push(edmundsServices[i]);
            }
        }
        carSave(true);
    }

    /*
    This gets called  when all due services are added to the stack
    */
    var carSave = function(edmunds) {
        console.log("saving car");
        console.log(serviceStack);
        var seen = [];
        var highestMileage = 0;
        var pendingEdmundServices = [];
        var prioritySum = 0;
        var maxPriority = 1;
        var changed;
        if (edmunds) { // true = edmunds is used, false = dealer services.

            /* get rid of duplicate services with same mileage
               EX: we might have 3 oil changes in serviceStack right now, 10k, 20k, 30k.
               only keep the one at 30k
               therefore: loop through all services and compare them */
            for (var i = 0; i < serviceStack.length; i++) {
                var notFound = true;
                for (var j = 0; j < seen.length; j++) {
                    // check for services with same action and item
                    if (serviceStack[i].get("action") === seen[j].get("action") &&
                        serviceStack[i].get("item") === seen[j].get("item")) {
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
            serviceStack = serviceStack.sort(function(a, b) {
                return b.get("priority") - a.get("priority");
            });
            serviceStack = serviceStack.slice(0, 5);

            // get rid of any old services
            pendingEdmundServices = car.get("pendingEdmundServices");
            if (pendingEdmundServices === undefined) pendingEdmundServices = [];
            for (i = 0; i < pendingEdmundServices.length; i++) {
                for (var z = 0; z < edmundsHistory.length; z++) {
                    if (pendingEdmundServices[i] === edmundsHistory[z][0]) {
                        pendingEdmundServices.splice(i, 1); // remove element at i
                    }
                }
            }

            // XXX: what if a new service is added to the edmunds service table?
            // right now we only pull that data once per car so it doesnt matter
            // add new services to the pendingEdmundServices array
            for (i = 0; i < serviceStack.length; i++) {
                var service = serviceStack[i];
                if (service.get("priority") > maxPriority) {
                    maxPriority = service.get("priority");
                }
                prioritySum += service.get("priority");
                // if they arent already in it
                if (pendingEdmundServices.indexOf(service.id) === -1 && pendingEdmundServices.length < 5) { // to a limit of 5
                    pendingEdmundServices.push(service.id);
                }
            }
            // see if we are setting new values
            if (car.get("pendingEdmundServices").sort().toString() === pendingEdmundServices.sort().toString()) {
                changed = false;
            }
            else {
                car.set("pendingEdmundServices", pendingEdmundServices);
                car.set("pendingIntervalServices", []);
                car.set("pendingFixedServices", []);
                changed = true;
            }
        }
        else { // edmunds isnt used
            // see if we are setting new values
            console.log("saving car: " + car.get("VIN"));
            if ((car.get("pendingIntervalServices").sort().toString() === pendingInterval.sort().toString()) &&
                (car.get("pendingFixedServices").sort().toString() === pendingFixed.sort().toString())) {
                changed = false;
            }
            else {
                car.set("pendingEdmundServices", []);
                car.set("pendingIntervalServices", pendingInterval);
                car.set("pendingFixedServices", pendingFixed);
                changed = true;
            }
        }

        // if there are services and they are new, send a notification
        if (changed && (pendingFixed.length + pendingInterval.length + pendingEdmundServices.length > 0)) {
            // if services due == 0, then there is a pending fixed or interval
            // thus when checking the priority sum, we know there are services due, so check priority > 5
            if (pendingEdmundServices.length === 0 || prioritySum > 5) {
                saveNotification(pendingEdmundServices, maxPriority);
            }
            car.set("serviceDue", true);
        }
        else {
            car.set("serviceDue", false);
        }

        car.save(null, {
            success: function(savedCar) {
                console.log("car saved");
                response.success("car saved"); // success for cloud function
            },
            error: function(saveError) {
                console.log("car not saved");
                console.error(saveError);
                response.error("car not saved"); //failure for cloud function
            }
        });
    };

    //saves new notifications
    var saveNotification = function(pendingEdmundServices, maxPriority) {
        //set notifications object
        var Notification = Parse.Object.extend("Notification");
        var notificationToSave = new Notification();
        var notificationContent = car.get("make") + " " + car.get("model") + " has " + (pendingEdmundServices.length + pendingFixed.length + pendingInterval.length);
        var notificationTitle = car.get("make") + " " + car.get("model") + " has ";
        if ((pendingEdmundServices.length + pendingFixed.length + pendingInterval.length) != 1) {
            notificationContent += " services due";
            notificationTitle += "services due";
        }
        else {
            notificationContent += " service due";
            notificationTitle += "a service due";
        }

        // severity based on https://github.com/ansik-pitstop/Pitstop-Wiki/wiki/Priority-and-Severity
        if (maxPriority == 1) {
            notificationTitle += " (Low)";
        }
        else if (maxPriority == 2) {
            notificationTitle += " (Medium)";
        }
        else if (maxPriority == 3) {
            notificationTitle += " (High)";
        }
        else if (maxPriority > 3) {
            notificationTitle += " (Severe)";
        }

        /*
        for (var i = 0; i < pendingEdmundServices.length; i++){
              //add services to string
            if (notificationContent.length < 60){
                var service = pendingEdmundServices[i];
                notificationContent += service.get("action") + " " + service.get("item");//description...
                if (i < pendingEdmundServices.length - 1){
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
            success: function(notificationToSave) {
                //saved
            },

            error: function(notificationToSave, error) {
                console.error("Error: " + error.code + " " + error.message);
            }
        });

        // pendingEdmundServices.length === 0 means that there are no edmunds services, which means there are dealerservices
        // we dont notify anyone about edmunds services
        // so if below condition is true, there are dealer services and we will send an email to the dealer about it
        if (pendingEdmundServices.length === 0) {
            shopQuery = new Parse.Query("Shop");
            shopQuery.equalTo("objectId", car.get("dealership"));
            shopQuery.first({
                success: function(shop) {
                    userQuery = new Parse.Query(Parse.User);
                    userQuery.equalTo("objectId", car.get("owner"));
                    userQuery.first({
                        success: function(user) {
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

                            for (i = 0; i < fixedDesc.length; i++) {
                                emailHtml += "<li>";
                                emailHtml += fixedDesc[i][1] + " " + fixedDesc[i][0] + "<br>";
                                emailHtml += "</li>";
                            }
                            for (i = 0; i < intervalDesc.length; i++) {
                                emailHtml += "<li>";
                                emailHtml += intervalDesc[i][1] + " " + intervalDesc[i][0] + "<br>";
                                emailHtml += "</li>";
                            }
                            emailHtml += "</ul>";
                            emailHtml = emailHtml.replace(/undefined/g, "~missing~");

                            console.log("sendEmail html");
                            console.log(emailHtml);

                            var email = sendgrid.Email({
                                to: [shop.get("email")]
                            });
                            email.setFrom(user.get("email"));
                            email.setSubject("Notification sent to " + user.get("name"));

                            // we need to delay the email by 70 hours to give them time to respond - shiva
                            // sendat is limited to 72 hours in the future i think.
                            // see sengrid.js for the code that implements all this. we use a modified version of it to allow for this
                            email.setSendAt(Math.floor(Date.now() / 1000) + 70 * 60 * 60); // 60 seconds * 60 minutes * 70 hours = 70 hour delay
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
                        error: function(error) {
                            console.error(error);
                            response.error();
                        }
                    });
                },
                error: function(error) {
                    console.log("Error " + error);
                    response.error();
                }
            });
        }
    };
}); // END CAR SERVICES UPDATE

// is no longer run, used to update cars mileage every week
Parse.Cloud.job("autoMileageUpdate", function(request, status) {
    Parse.Cloud.useMasterKey;
    //var config = Parse.Config.current();
    var mileageAddition = (parseInt(request.params.biWeeklyAverageMiles) / 2);
    status.message("mileage addition " + mileageAddition);
    var query = new Parse.Query("Car");
    // Week Ago: Date
    var d = new Date();
    var time = (7 * 24 * 3600 * 1000);
    var weekAgoDate = new Date(d.getTime() - (time));
    // find cars that haven't been updated in at least a week
    query.lessThanOrEqualTo("updatedAt", weekAgoDate);
    query.find({
        success: function(cars) {
            //update all car mileage
            status.message(cars.toString());
            for (var i = 0; i < cars.length; i++) {
                var car = cars[i];
                status.message(car.toString());
                var mileage = car.get("baseMileage") + mileageAddition; // add baseMileage
                car.set("totalMileage", mileage);
            }
            Parse.Object.saveAll(cars, {
                success: function(data) {
                    console.log("autoMileageUpdate Success");
                    status.success("Mileage for cars saved");
                },
                error: function(error) {
                    console.error("Error updating mileage from autoMileageUpdate: ", error);
                    status.error("Mileage for cars not saved");
                }
            });
        },
        error: function(error) {
            console.error("Could not find cars updated before ", weekAgoDate);
            console.error("Error: ", error);
        }
    });
});

// if they press service request on phone this is what is run
Parse.Cloud.define("sendServiceRequestEmail", function(request, response) {
    var params = request.params;
    var services = params.services;
    var carVin = params.carVin;
    var userObjectId = params.userObjectId;
    var comments = params.comments;

    function sendEmail(user, car, shop) {
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

        for (i = 0; i < services.length; i++) {
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

    // this gets all the params needed to run above function, then runs it.
    var carQuery = new Parse.Query("Car");
    carQuery.equalTo("VIN", carVin);
    carQuery.find({
        success: function(cars) {
            car = cars[0];

            shopQuery = new Parse.Query("Shop");
            shopQuery.equalTo("objectId", car.get("dealership"));
            shopQuery.find({
                success: function(shops) {
                    shop = shops[0];
                    console.log("Shop ");
                    console.log(shop);

                    userQuery = new Parse.Query(Parse.User);
                    userQuery.equalTo("objectId", userObjectId);
                    userQuery.find({
                        success: function(users) {
                            user = users[0];
                            sendEmail(user, car, shop);
                        },
                        error: function(error) {
                            console.error(error);
                            response.error();
                        }
                    });
                },
                error: function(error) {
                    console.log("Error " + error);
                    response.error();
                }
            });
        },
        error: function(error) {
            console.error(error);
            response.error();
        }
    });
});
