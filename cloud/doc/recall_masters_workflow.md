## get result from RecallMasters API server

* VIN for car is passed in as a string

* check if result is new

	* check if there is a row in RecallMasters have "forCar" pointer that is the same as the given one

## Adding new RecallMasters result

* save recall entries in RecallEntry

* after all saves are done

	* save the array of pointers to RecallEntry as "recalls"

	* push pointers to new recall into newRecall in Car

## Updating existing RecallMasters object

> this can be refactored since only those were new or pending but no in RecallMasters' result are marked as "doneByRecallmasters"

* for all existing recall entries with state "new", set state to "wasNew"

*  for all existing recall entries with state "pending", set state to "wasPending"

	> only updating those with states "new" or pending" so fixed recalls marked by user are not overriten

* if RecallEntry exists in RecallMasters's result, set state back to "new" or "pending" respectively

* set all states of "wasNew" or "wasPending" to "doneByRecallMasters"

* then all recalls no longer exists in result form RecallMasters are set to "doneByRecallMasters"

* update newRecalls, pendingRecalls, fixedRecalls in Car table

	* this step in unnecessary since update was made when saving RecallEntry objects

## Updating recalls upon user behaviour - changes made in Car

* server side

	* upon save event of Car
	
		* check if newRecals, pendingRecalls or completedRecalls exists in dirtyKeys of Car object being saved

			* fetch all recalls in newRecall, pendingRecall, completedRecall

			* check if state of recalls in RecallEntry matches

				* e.g. for recalls in newRecall, check if state of those recalls are "new", etc.

			* if state does not match, set and save "state" of that recall in RecallEntry to "doneByUser"

			> looping in save events is avoided since both table will have the same state upon save event of each

## Updating recalls upon changes made in RecallEntry

* find out in which array the pointer to that recall is

	* if state does not match

		* remove pointer in that array

		* push pointer to the new array

		* save Car object


## What to be displayed to user

* only recalls with state "new" or "pending"