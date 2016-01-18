## Explaination of States column "state" in RecallEntry

| State               	| Explaination                                                                                                      	|
|---------------------	|-------------------------------------------------------------------------------------------------------------------	|
| new                 	| no services requested for that recall and recall is not done yet                                                  	|
| pending             	| recall is pending                                                                                                 	|
| doneByUser          	| recall is marked as done by user - i.e. User "swiped" on the recall displayed and marked that recall as completed 	|
| doneByRecallMasters 	| recall is marked as done by Recall Masters - i.e. no longer exists in API lookup result from Recall Masters       	|
| wasNew              	| internal state when updating RecallEntry                                                                          	|
| wasPending          	| internal state when updating RecallEntry                                                                          	|

## What happens when adding new RecallEntry

* add a new record in RecallEntry with column "state" and value "new"

## Adding new car

* RecallEntry added with new entries

	* all RecallEntry are in state "new"

## Updating recalls upon routine status check

for all existing recall entries with state "new", set state to "wasNew"

for all existing recall entries with state "pending", set state to "wasPending"

	only updating those with states "new" or pending" so fixed recalls marked by user are not overriten

* if RecallEntry exists in RecallMasters's result, set state back to "new" or "pending" respectively

* if RecallEntry does not exist in RecallMasters's result, state is set to "new"

* set all states of "wasNew" or "wasPending" to "doneByRecallMasters"

* then all recalls no longer exists in result form RecallMasters are set to "doneByRecallMasters"

## Updating recalls upon user behaviour

* client side
	* when user "swipes" / marks the recall displayed as completed

	* set "state" of that recall in RecallEntry to "doneByUser"

## What to be displayed to user

* only recalls with state "new" or "pending"