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
        var pointerToRecallMasters = {
            "__type": "Pointer",
            "className": "RecallMasters",
            "objectId": recallObject["recallMastersId"]
        }

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
        entry.set("forRecallMasters", pointerToRecallMasters)
        if (!isEntryExisting) {
            // set "state" to "new" when adding for the first time
            entry.set("state", "new")
        }

        entry.save().then(function(result) {
            var message = undefined
            if (isEntryExisting) {
                message = "recall record with NHTSA #" + recallObject["nhtsa_id"] + " is updated"
            }
            else {
                message = "recall record with NHTSA #" + recallObject["nhtsa_id"] + " is added"
            }
            console.log(message)
            response.success(result)

        }, function(error) {
            message = "recall record with NHTSA #" + recallObject["nhtsa_id"] + " cannot be saved"
            console.error(message)
            console.error(error)
            response.error(error)
        })
    }

    var recallObject = request.params
    var isEntryExisting = false
    var entry = undefined
    var entryAt = undefined

    var pointerToRecallMasters = {
        "__type": "Pointer",
        "className": "RecallMasters",
        "objectId": recallObject["recallMastersId"]
    }


    // for all RecallEntry object with pointer to the RecallMasters Object
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

        doUpdate(entry, recallObject, isEntryExisting)

    }, function(error) {
        console.error(error)
        response.error(error)
    })
})


Parse.Cloud.define("updateRecallMastersResult", function(request, response) {
    var updateRecalls = function(rawRecalls, pointersToRecallObject) {
        // returns an array of rawRecalls that only contains new recalls

        var isEntryExisting = function(recallObject, rawRecalls) {
            // check if data in recallObject matches some recalls in rawRecalls

            var isSame = function(recallObject, rawRecall) {
                var isFound = false
                // not using indexOf method because recallObject is an object
                // i.e. checking attributes of an object

                return (recallObject.get("nhtsaID") === rawRecall["nhtsa_id"] ||
                        recallObject.get("oemID") === rawRecall["oem_id"] ||
                        recallObject.get("name") === rawRecall["name"])
                }

            for (var i = 0; i < rawRecalls.length && !isFound; i++) {
                isFound = isSame(recallObject, rawRecalls[i])
            }

            return isFound

        }
        // rawRecalls: array of raw recalls - json objects
        // pointersToRecallObject: array of pointers to RecallEntry objects

        // fetches all RecallEntry objects

        var promises = []

        for (var i = 0; i < pointersToRecallObject.length; i++) {
            promises.push(pointersToRecallObject[i].fetch())
        }


        rawRecalls = Parse.Promise.when(promises).then(function() {
            var recallObjects = []

            for (var i = 0; i < arguments.length; i++) {
                var pointerToRecallEntry = arguments[i]
                recallObjects.push(pointerToRecallEntry)
            }

            return recallObjects

        }).then(function(recallObjects) {
            // using length as variable sin rawRecalls might mutate
            var length = recallObjects.length

            // for all existing recall entries with state "new", set state to "wasNew"
            // for all existing recall entries with state "pending", set state to "wasPending"
            for (var i = 0; i < length;) {
                var currObject = recallObjects[i]
                var state = recallObjects[i].get("state")

                if (state === "new") {
                    currObject.set("state",  "wasNew")
                    // dont save here - wasNew is internal state
                }
                else if (state === "pending") {
                    currObject.set("state",  "wasPending")
                    // dont save here - wasPending is internal state
                }

                if (isEntryExisting(currObject, rawRecalls)) {
                    // if RecallEntry exists in RecallMasters's result, set state back to "new" or "pending" respectively

                    if (state === "wasNew") {
                        currObject.set("state",  "new")
                        // just dont save here, not yet
                    }
                    else if (state === "wasPending") {
                        currObject.set("state",  "pending")
                        // just dont save here, not yet
                    }

                    // remove the ith (current) item in rawRecalls
                    rawRecalls.splice(i, 1)

                    // not updating counter since current rawRecall is removed
                }
                else {
                    i++
                }

                if (state === "wasNew" || state === "wasPending") {
                    // set all states of "wasNew" or "wasPending" to "doneByRecallMasters"
                    currObject.set("state",  "doneByRecallMasters")
                    // just dont save here, not yet
                }

                // then all recalls no longer exists in result form RecallMasters are set to "doneByRecallMasters"
                currObject.save()
            }

            return rawRecalls
        })

        return rawRecalls


    }

    var doUpdate = function(entry, recallMastersObject, isEntryExisting) {
        var pointerToCar = {
            "__type": "Pointer",
            "className": "Car",
            "objectId": recallMastersObject["car"]
        }

        entry.set("vin", recallMastersObject["vin"])
        entry.set("make", recallMastersObject["make"])
        entry.set("modelName", recallMastersObject["model_name"])
        entry.set("modelYear", recallMastersObject["model_year"])
        entry.set("rawRecalls", recallMastersObject["recalls"])
        entry.set("forCar", pointerToCar)

        if (!isEntryExisting) {
            entry.set("recalls", []) // empty array
        } // else dont make changes

        console.log("DEBUG: " + "saving recallMastersObject")

        entry.save().then(function() {
            var message = undefined
            if (isEntryExisting) {

                message = "Recall Master's result for VIN " + recallMastersObject["vin"] + " is updated"
            }
            else {
                message = "Recall Master's result for VIN " + recallMastersObject["vin"] + " is added"
            }
            response.success(message)

        }, function(error) {
            message = "failed to add Recall Master's result for VIN " + recallMastersObject["vin"]
            console.error(message)
            console.error(error)
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
  var input;
  Parse.Cloud.run("getRecallMastersResult", request.params).then(function(result) {
    input = result.data
    input["car"] = request.params.car
    console.log("DEBUG: " + "attempt 1 of updateRecallMastersResult()")
    return Parse.Cloud.run("updateRecallMastersResult", input)
  }).then(function(result) {
    response.success(result)
  }, function(error) {
    console.error(error)
    // run the function again - might be caused becauses of timeout issue
    console.log("DEBUG: " + "attempt 2 of updateRecallMastersResult()")
    return Parse.Cloud.run("updateRecallMastersResult", input)
  }).then(function(result) {
    response.success(result)
  }, function(error) {
    response.error(error)
  })
})

var updateActiveRecallCountInCar = function(recallMastersObject) {
    var pointerToRecallMasters = {
        "__type": "Pointer",
        "className": "RecallMasters",
        "objectId": recallMastersObject.id
    }

    console.log("updating # of active recalls into Car object")

    query = new Parse.Query("RecallEntry")
    query.equalTo("forRecallMasters", pointerToRecallMasters)
    query.find().then(function(result) {
        var numberOfRecalls = 0

        for (var i = 0; i < result.length; i++) {
            var currState = result[i].get("state")
            if (currState === "new" || currState === "pending") {
                numberOfRecalls += 1
            }
        }

        recallMastersObject.get("forCar").fetch().then(function (carObject) {
            console.log("active recalls: " + numberOfRecalls)
            carObject.set("numberOfRecalls", numberOfRecalls)
            carObject.save()

        }, function(error) {
            console.error("failed to save car when updating # of active recalls")
            return error
        })

    }, function(error) {
        // retry if after 5 second if recieved error code 124: request timed out
        if (error.status === 124) {
            // recusrive call after 5 second
            console.error("failed to update # of active recalls, retry after 5 seconds")
            setTimeout(updateActiveRecallCountInCar(recallMastersObject), 5000)
        }
    }

)
}


Parse.Cloud.afterSave("RecallMasters", function(request) {
    var recallMastersObject = request.object

    var pointerToRecallMasters = {
        "__type": "Pointer",
        "className": "RecallMasters",
        "objectId": recallMastersObject.id
    }

    var rawRecalls = recallMastersObject.get("rawRecalls")

    var message = undefined

    console.log("aftersave of RecallMasters")
    console.log("# of raw recalls: " + rawRecalls.length)

    if (rawRecalls && rawRecalls.length !== 0) {
        // new recalls exists - add new recall entry
        var promises = []

        for (var i = 0; i < rawRecalls.length; i++) {
            var params = rawRecalls[i]
            params["recallMastersId"] = recallMastersObject.id

            // result of function being pushed is pointer to the saved entry
            console.log("updating recall with NHTSA # " + rawRecalls[i]["nhtsa_id"])
            promises.push(Parse.Cloud.run("updateRecallEntry", params))
        }

        Parse.Promise.when(promises).then(function() {
            // NOTE: arguments is a hidden argument that contains all resolved value of promises

            var recalls = recallMastersObject.get("recalls")

            for (var i = 0; i < arguments.length; i++) {
                var pointerToRecallEntry = arguments[i]
                recalls.push(pointerToRecallEntry)
            }

            return recalls

        }).then(function(recalls) {
            recallMastersObject.set("rawRecalls", []) // all update requests are pushed, clean up the rawRecalls
            recallMastersObject.set("recalls", recalls)

            recallMastersObject.save().then(function() {
                console.log("pointers to new RecallEntry objects are added")

                // updateActiveRecallCountInCar(recallMastersObject)

            }, function(error) {
                message = "failed to add pointers to new RecallEntry objects"
                console.error(message)
                console.error(error)
            })
        })
    }
})

Parse.Cloud.afterSave("RecallEntry", function(request, response) {
    var recallEntryObject = request.object

    if (recallEntryObject.existed()) {
        // update # of active recalls only after the first time of creation

        recallEntryObject.get("forRecallMasters").fetch().then(function(recallMastersObject) {
            updateActiveRecallCountInCar(recallMastersObject)
        })
    }
})

Parse.Cloud.job("updateRecallMastersManually", function(request, response) {
    var vin = request.params.vin
    var message = ""

    var query = new Parse.Query("Car")
    query.equalTo("VIN", vin)
    query.find().then(function (result) {
        if (result.length !== 1) {
            if (result.length == 0) {
                message = "no car found with VIN " + vin
            }
            else {
                message = "multiple cars with VIN " + vin + " found"
            }
            response.error(message)
        }
        else {
            return result[0]
        }
    }).then(function (carObject) {

        Parse.Cloud.run("recallMastersWrapper", {
          "vin": vin,
          "car": carObject.id
        })
    })
})

// TODO: need after_delete method for RecallMasters and RecallEntry to ensure there is no dangling pointers in Car or RecallMasters
