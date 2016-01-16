var RecallMastersAPI = {
    host : "https://app.recallmasters.com",
    token : "f52404090b6a063a85d619f15bc80d8c85baf194",
    getRequestByVIN: function(vin) {
        var url = RecallMastersAPI.host + "/api/v1/lookup/" + vin + "/?format=json"
        var headers = {
            "Authorization": "Token" + " " + RecallMastersAPI.token
        }

        var req = {
            url: url,
            headers: headers
        }

        return req
    }
}

// TODO: function to verify whether the VIN is valid


Parse.Cloud.define("addUncheckedVIN", function(request, response) {
    requestObject = request.params

    var query = new Parse.Query("UncheckedVIN")
    query.equalTo("vin", requestObject["vin"])

    query.first({
        success: function(result) {
            if (result === undefined) {
                // add new VIN record

                var UncheckedVIN = Parse.Object.extend("UncheckedVIN")
                var newEntry = new UncheckedVIN()

                newEntry.set("vin", request.params.vin)
                newEntry.set("message", request.params.error_description)

                newEntry.save(null, {
                    success: function() {
                        response.success("unchecked VIN added")
                    },
                    error: function(error) {
                        console.log("unchecked VIN " + request.params.vin + " cannot be added")
                        response.error(error)
                    }
                })
            }
            else {
                // VIN exists, no record added
                var message = "unchecked VIN " + request.params.vin + " is in queue - no entry added"
                // console.log(message)
                // response.error(Parse.Error.OTHER_CAUSE, message)
                response.error(message)
            }
        },
        error: function(error) {
            console.log("unchecked VIN " + request.params.vin + " cannot be added")
            response.error(error)
        }
    })
})


Parse.Cloud.define("getRecallMastersResult", function(request, response) {
    var isValid = function(data) {
        // VIN in considered valid if make, model name and model year are non-empty strings in API response
        return (data.make && data.model_name && data.model_year)

    }

    var req = RecallMastersAPI.getRequestByVIN(request.params.vin)

    Parse.Cloud.httpRequest({
        url: req.url,
        headers: req.headers,
        success: function(result) {
            response.success(result)
        },

        error: function(error) {
            var message = "Recall lookup failed for VIN " + request.params.vin
            console.log(message)
            try {
                errCode = error.status

                console.log("error code: " + errCode)

                // handles 400 bad request

                if (errCode = 400) {
                    if (isValid(error.data)) {
                        Parse.Cloud.run("addUncheckedVIN", request.params, {
                            success: function(result) {
                                response.success("VIN " + request.params.vin + " " + "is recorded")
                            },

                            error: function(error) {
                                console.log("VIN " + request.params.vin + " " + "cannot be recorded")
                                response.error(error)
                            }
                        })
                    }
                    else {
                        message = "VIN " + request.params.vin + " " + "is invalid and is not added into UncheckedVIN"
                        console.log(message)
                    }
                }
                else {
                    message = "Recall lookup failed - error code: " + errCode
                    // console.log(message)
                    // response.error(Parse.Error.OTHER_CAUSE, message)
                    response.error(message)
                }
            }

            catch(err) {
                message = "Recall lookup failed - unexpected result from RecallMasters"
                console.log(message)
                console.log(err)
            }

            response.error(message)
        }
    })
})


Parse.Cloud.define("updateRecallEntry", function(request, response) {
    var doUpdate = function(entry, recallObject, isEntryExisting) {
        var message = undefined
        entry.set("nhtsaID", recallObject["nhtsa_id"])
        entry.set("oemID", recallObject["oem_id"])
        entry.set("type", recallObject["type"])
        entry.set("effectiveDate", recallObject["effective_date"])
        entry.set("expirationDate", recallObject["expiration_date"])
        entry.set("partsAvailable", recallObject["parts_available"])
        entry.set("remedyAvailable", recallObject["is_remedy_available"])
        entry.set("name", recallObject["name"])
        entry.set("description", recallObject["description"])
        entry.set("risk", recallObject["risk"])
        entry.set("remedy", recallObject["remedy"])
        entry.set("overallRank", recallObject["overall_rank"])
        entry.set("riskRank", recallObject["risk_rank"])
        entry.set("profitRank", recallObject["profit_rank"])
        entry.set("laborMin", recallObject["labor_min"])
        entry.set("laborMax", recallObject["labor_max"])
        entry.set("laborDifficulty", recallObject["labor_difficulty"])
        entry.set("reimbursement", recallObject["reimbursement"])
        entry.set("forRecallMasters", recallObject["recallMastersPointer"])

        return entry.save()
    }

    var recallObject = request.params
    var isEntryExisting = false
    var entry = undefined
    var entryAt = undefined

    var query = new Parse.Query("RecallEntry")
    query.equalTo("forRecallMasters", recallObject["recallMastersPointer"])

    query.find().then(function(result) {
        for (var i = 0; i < result.length && !isEntryExisting; i++) {
            // find the first entry that matches the new one
            if (
                result[i].get("nhtsaID") === recallObject["nhtsa_id"] ||
                result[i].get("oemID") === recallObject["oem_id"] ||
                result[i].get("name") === recallObject["name"]
            ) {
                isEntryExisting = true
                entryAt = i
            }
        }

        if (isEntryExisting) {
            // entry found - use the existing entry
            entry = result[entryAt]
        }
        else {
            // entry not found - create a new entry
            var RecallEntry = Parse.Object.extend("RecallEntry")
            var newEntry = new RecallEntry()

            entry = newEntry
        }

        doUpdate(entry, recallObject, isEntryExisting).then(function(recallEntryObject) {
            var pointerToRecallEntry = {
                "__type": "Pointer",
                "className": "RecallEntry",
                "objectId": recallEntryObject.id
            }

            if (isEntryExisting) {
                message = "recall record with NHTSA #" + recallObject["nhtsa_id"] + " is updated"
            }
            else {
                message = "recall record with NHTSA #" + recallObject["nhtsa_id"] + " is added"
            }

            response.success(pointerToRecallEntry)
        }, function(error) {
            message = "recall record with NHTSA #" + recallObject["nhtsa_id"] + " cannot be saved"
            console.error(message)
            // response.error(Parse.Error.OTHER_CAUSE, message)
            response.error(message)
        })
    })
})


Parse.Cloud.define("updateRecallMastersResult", function(request, response) {
    var doUpdate = function(entry, recallMastersObject, isEntryExisting) {
        // NOTE: recalls are now saved as nested an array of json - Jan. 7, 2016 - Jiawei

        // // recalls is an arrary of NHTSA IDs for decoupling purpose
        // var recalls = []
        //
        // if (recallMastersObject["recall_count"] > 0) {
        //
        //     for (var i = 0; i < recallMastersObject["recalls"].length; i++) {
        //         var currObject = recallMastersObject["recalls"][i]
        //         // update the recall record when adding a new recall record to the array
        //         // assign the pointer to updated recall record to recall list
        //         recalls.push(currObject["nhtsa_id"])
        //
        //         Parse.Cloud.run("updateRecallEntry", currObject)
        //     }
        // }

        entry.set("vin", recallMastersObject["vin"])
        entry.set("make", recallMastersObject["make"])
        entry.set("modelName", recallMastersObject["model_name"])
        entry.set("modelYear", recallMastersObject["model_year"])
        entry.set("rawRecalls", recallMastersObject["recalls"])
        entry.set("recalls", []) // empty array

        // find car object by id
        query = new Parse.Query("Car")
        query.equalTo("objectId", recallMastersObject["car"])
        query.first().then(function(carObject) {
            if (carObject !== undefined) {
                // car object found
                entry.set("forCar", carObject)
            }
            else {
                message = "Car object with id " + recallMastersObject["car"] + " not found"
                response.error(message)
            }
        }).then(function() {
            // all attrs are set - save the object
            return entry.save()

        }).then(function() {
            var message = undefined
            if (isEntryExisting) {

                message = "Recall Master's result for VIN " + recallMastersObject["vin"] + " is updated"
            }
            else {
                message = "Recall Master's result for VIN " + recallMastersObject["vin"] + " is added"
            }
            response.success(message)

        }).then(function() {}, function(error) {
            message = "query on Car object failed"
            console.error(message)
            response.error(error)
        })
    }

    var recallMastersObject = request.params
    var isEntryExisting = undefined
    var entry = undefined

    var pointerToCar = {
        "__type": "Pointer",
        "className": "Car",
        "objectId": recallMastersObject["car"]
    }

    var query = new Parse.Query("RecallMasters")
    query.equalTo("forCar", pointerToCar)

    query.first({
        success: function(result) {
            isEntryExisting = (result !== undefined)
            if (isEntryExisting) {
                // entry found - use the existing entry
                entry = result
            }
            else {
                // entry not found - create a new entry
                var RecallMastersEntry = Parse.Object.extend("RecallMasters")
                var newEntry = new RecallMastersEntry()

                entry = newEntry
            }

            doUpdate(entry, recallMastersObject, isEntryExisting)
        },
        error: function(error) {
            console.error(error)
            response.error(error)

        }
    })
})


Parse.Cloud.define("recallMastersWrapper", function(request, response) {
    Parse.Cloud.run("getRecallMastersResult", request.params, {
        success: function(result) {
            var input = result.data
            input["car"] = request.params.car
            Parse.Cloud.run("updateRecallMastersResult", input, {
                success: function(result) {
                    response.success(result)
                },
                error: function(error) {
                    response.error(error)
                }
            })
        },

        error: function(error) {
            response.error(error)
        }
    })
})


Parse.Cloud.afterSave("RecallEntry", function(request) {
    var addPendingRecall = function(newRecall) {
        var pointerToRecallEntry = {
            "__type": "Pointer",
            "className": "RecallEntry",
            "objectId": newRecall.id
        }

        newRecall.get("forRecallMasters").fetch().then(function(recallMastersObject) {
            return recallMastersObject.get("forCar").fetch()

        }).then(function(carObject) {
            // car object is found
            var pendingRecalls = carObject.get("pendingRecalls")
            var completedRecalls = carObject.get("recallsCompleted")
            var isPending = undefined
            var isCompleted = undefined

            // check if recall is in pending recalls

            for (var i = 0; i < pendingRecalls.length && !isPending; i++) {
                isPending = (pointerToRecallEntry === pendingRecalls[i])
            }

            if (!isPending) {
                // recall is not in pending recalls - check if recall is done
                for (var i = 0; i < completedRecalls.length && !isCompleted; i++) {
                    isCompleted = (pointerToRecallEntry === completedRecalls[i])
                }

                if (!isCompleted) {
                    // recall is not in pending recalls and is not done yet - push to pending recalls
                    pendingRecalls.push(pointerToRecallEntry)
                    carObject.set("pendingRecalls", pendingRecalls)
                    carObject.save().then(function(success) {
                        console.log("recall " + newRecall.id + " is pushed into pendingRecalls for car " + carObject.id)

                    }, function(error) {
                        console.error("error when pushing new recalls to pending recalls: ")
                        console.error("cannot save car " + carObject.id)
                    })
                }
            }

        }, function(error) {
            console.error("error when pushing new recalls to pending recalls: ")
            console.error("cannot find car " + carObject.id)
        })
    }

    var recallObject = request.object


    if (recallObject.isNew()) {
        // new recall entry should be pushed to pendingRecalls in Car

        addPendingRecall(recallObject)
    }
})


Parse.Cloud.afterSave("RecallMasters", function(request) {
    var updateAllRecallEntry = function(recallMastersObject) {
        // returns a promise of an array of pointers upon success or an empty array upon failure

        var objectId = recallMastersObject.id

        var pointerToRecallMasters = {
            "__type": "Pointer",
            "className": "RecallMasters",
            "objectId": objectId
        }

        var rawRecalls = recallMastersObject.get("rawRecalls")
        var length = rawRecalls.length
        var promises = []
        var recalls = []

        // first time creating the object - create recall entries
        for (var i = 0; i < length; i++) {
            var params = rawRecalls[i]
            params["recallMastersPointer"] = pointerToRecallMasters

            // result of function being pushed is pointer to the saved entry
            promises.push(Parse.Cloud.run("updateRecallEntry", params))
        }

        return Parse.Promise.when(promises).then(function() {
            // NOTE: arguments is a hidden argument that contains all resolved value of promises

            for (var i = 0; i < arguments.length; i++) {
                recalls.push(arguments[i])
            }

            return recalls

        }, function(error) {
            return recalls
        })
    }


    var recallMastersObject = request.object
    var message = undefined

    if (!recallMastersObject.existed()) {
        updateAllRecallEntry(recallMastersObject).then(function(recalls) {
            recallMastersObject.set("recalls", recalls)
            return recallMastersObject.save()

        }).then(function() {
            message = "added list of pointers to Recall Entry"
            console.log(message)

        }, function(error) {
            message = "failed to add list of pointers to Recall Entry"
            console.error(message)
            console.error(error)
        })
    }
})


Parse.Cloud.job("addRecallMastersResultByVIN", function(request, response) {
    Parse.Cloud.run("recallMastersWrapper", request.params, {
        success: function(result) {
            response.success(result)
        },
        error: function(error) {
            response.error(error)
        }
    })
})

// TODO: need after_delete method for RecallMasters and RecallEntry to ensure there is no dangling pointers in Car or RecallMasters
