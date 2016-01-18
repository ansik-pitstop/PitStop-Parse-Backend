## when user presses refresh button

* do query on RecallEntry table

	> all arrays saved in here should be saved in the local db of app, not in backend server. these arrays are used for caching purpose only thus they should not be guaranteed with data consistency.

	> for now the arrays are saved in Car table

	| state in RecallEntry | save to        |
	|----------------------|----------------|
	| new                  | newRecalls     |
	| pending              | pendingRecalls |
	| doneByUser           | fixedRecalls   |
	| doneByRecallMasters  | fixedRecalls   |

## when user presses "service request"

* fetch the recalls in newRecalls

* set "state" to "pending" and save those recalls

* pop those recalls and push them into pendingRecalls

## when user marks a recall as fixed

* fetch that recall in pendingRecalls

* set "state" to "doneByUser" and save that recall

* pop that recall and push it into fixedRecalls

## [feature in the future] when user marks a fixed recall as new

i.e. undo behaviour (e.g. recall is marked as fixed by mistake)

* fetch that recall in fixedRecalls

* set "state" to "new" and save that recall

* pop that recall and push it into newRecalls

# Why doing this

* simplifies business logic for both frontend and backend

	* frontend

		* just let the backend know what should be updated and how should the update be done
		
		> frontend is not totally free from interacting with the database directly due to the lack of Data Access layer.

		* keep arrays in local db so frontend don't need to worry about data consistency

	* backend

		* just update state of recalls as requested, don't care if data in newRecalls, pendingRecalls, etc. are consistent since they only serve the purpose of a temp storage of data to be displayed

		* simple logic, avoids extra transactions

		> logic is complicated since data consistency is required for newRecalls, pendingRecalls and fixedRecalls. It is acceptable for now but it will get worse easily when adding new features.