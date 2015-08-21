# PitStop-Backend
This repository contains the code for the PitStop’s backend. The PitStop backend is powered by Ruby on Rails and uses [Parse][1] to store the data.

<<<<<<< Updated upstream
=======
This document contains all the details for you to start expanding and debugging the backend. Please read this document carefully.

- [Contribution Guide][2]
	- Documentation
	- Formatting
	- Branches
	- Pull Requests
	- Issues
	- Coding Conventions
- [Data Structures and Classes][3]
	- User Class
	- Shop Class
	- Notification Class
	- NotificationMessage Class
	- Car Class
	- Scan Class
	- Code Class
	- Solution Class
	- FAQ Class
	- Ticket Class
	- TicketMessage Class
- [User Roles][4]
	- Consumer
	- Mechanic
	- Admin
- [REST API][5]
	- POST Requests
	- GET Requests

## Contribution Guide
This section is a must-read. This section goes over all the guidelines of contributing to this project.

### Documentation
You’re supposed to update the documentation whenever you add something new to the codebase or change something in the codebase. We don’t want to end up with non-sense code in the codebase. 

### Formatting
You’re supposed to follow certain formatting when writing the documentation.

**Table of reference:** always append the new entries to the table of reference above. Please make sure that things are added in the right section.

**Correct Headings:** please use the correct headings when writing the documentation. Never go any deeper than H3 (###).

**Use code blocks:** please put your code in code blocks. For example: 

	var myFunction = function () {
	    alert(“My Awesome Function”);
	};

**Use block quotes:** they look fancy

> You've baked a really lovely cake, but then you've used dog shit for frosting. - Steve Jobs

### Branches

** NEVER PUSH TO MASTER BRANCH: ** make a separate development branch for your self and push your changes to that branch.

### Pull Requests
Whenever your code is ready to be merged with rest of the codebase, make a pull request to the master branch and include the following in the pull request.
- What you changed and why you had to do it
- Cite the issues related to the pull request
- Any possible issues that the change can cause

### Issues
We use the Github issue system to both track bugs and assign tasks, please report issues and bugs whenever you encounter them. 
Also always check your Github notifications to keep up with the issues that you were assigned to.

### Coding Conventions

**Variable Naming:** we use the camel-case style with the first character being lowercase. For example `myVariableForSomething` is a good name. Please choose meaningful names.

**Class Naming:** the same rules for variables but the first character should also be uppercase. For example `MyClassName` is a good name.

**USE SEMICOLONS:** Just use them.

**USE BLOCKs: ** use `{ }` blocks for if, for, while, else and etc.

**{ Goes on the same line as statement: ** nobody likes {s on a new line.

**Comment the code: ** this is how you should comment the code

	/*
	 myFunction: this function performs the x task by consuming the Y variable and calculating the Z value.
	
	    TODO: optimize the for loop to reduce memory ussage.
	
	Edit By: Khashayar Pourdeilami
	On: June 16th 2015 at 5:35pm
	
	By: Khashayar Pourdeilami
	On: Jun 15th 2015 at 3:15pm
	 */

**Keep the code legible: ** please don’t leave a mess behind. The following example is a good style of coding.

	var myFunction = function (x, y, callback) {
	    // Initializing
	    var a = someFn(x);
	    var b = someFn(b);
	
	    // Processing
	    performSomeFunction(function (success) {
	        console.log("YAY! Success at myFunction: ", success);
	        callback(success, true);
	    }, function (error) {
	        console.log("No! Error at myFunction: ", error);
	        callback(error, false);
	    }, [a, b]);
	
	    //Finalizing
	    return;
	}

## Data Structures an d Classes
The following are the data structures and classes that PitStop will be using.
The attributes are already provided by the data being returned from the database, the methods only need to be implemented for each platform.

### User Class

**Attributes**
- objectId: String
- username: String 
- password: String
- authData: authData
- emailVerified: Bool
- email: String
- name: String
- phoneNumber: String
- createdAt: Date
- updatedAt: Date 
- ACL: ACL
- activated: Bool
- totalSpent: Float
- totalServies: Integer
- subscribedShop: String
- role: String

**Methods**
- *Constructor (String objectId):* this function will use the objectId provided to load the desired user from database into the memory.
- *getCars ():* this function will use the objectId attribute to get the cars owned by the user.
- *getNotifications ():* this function will use the objectId attribute to get the notifications intended for the user sorted by the notifications’ updatedAt attribute.
- *newCar (String VIN):* this function will use a car’s VIN number and will add it to the database.

**Related Functions**
- *newUser (String name, String email, String phoneNumber, String username, String password):* this function will use the provided data to add a new user to the database.

### Shop Class

**Attributes**
- objectId: String
- createdAt: Date
- updatedAt: Date
- ACL: ACL
- activationDate: Date
- renewalDate: Date
- activated: Bool
- name: String
- email: String
- phoneNumber: String
- totalServices: Integer
- totalMade: Integer
- addressText: String
- addressCoordinates: Array
- reviewPoint: Integer
- reviewCount: Integer

**Methods**
- *Constructor (String objectId):* this function will use the objectId provided to the load the desired shop from database into the memory.
- *getCustomers ():* this function will use the shop’s objectId to get the customers listed on the shop.
- *getNotifications ():* this function will use the objectId attribute to get the notifications intended for the shop sorted by the notifications’ updatedAt attribute.
- *getReview ():* this function will use the objectId attribute to get review of the shop sorted by reviews’ createdAt attribute.
- *addUser (String objectId, String role):* this function will add a new user to the shop.
- *removeUser (String objectId):* this function will remove the given user from the shop.
- *removeCustomer (Sting objectId):* this function will remove the given customer from the shop.

**Related Functions**
- *newShop (String name, String email, String phoneNumber, String addressText, String addressCoordinates): * this function will get the information provided and will add a new shop to the database.

### Notification Class

**Attributes**
- objectId: String
- createdAt: Date
- updatedAt: Date
- ACL: ACL
- type: String
- byId: String
- toId: String
- title: String
- content: String
- scanId: String
- carId: String
- messageCount: Integer

**Methods**
- *Constructor (String objectId):* this function will load the desired notification into the memory.
- *addMessage (String toId, String title, String content):* this function will create a new message and will store it on the database.

**Related Functions**
 - *addNotification (String toId, String type, String title, String content, String DTCs, String carId):* this function will create a new notification and will store it on the database.

### NotificationMessage Class

**Attributes**
- objectId: String
- createdAt: Date
- updatedAt: Date
- ACL: ACL
- title: String
- content: String
- notificationId: String
- byId: String

**Related Functions**
- *addMessage (String toId, String title, String content):* this function will create a new message and will store it on the database.

### Car Class

**Attributes**
- objectId: String
- createdAt: Date
- updatedAt: Date
- ACL: ACL
- model: String
- make: String
- year: Integer
- engine: String
- VIN: String
- owner: String
- scannerUUID: String
- scannerId: String
- serviceDue: Integer
- serviceBy: String
- serviceDate: Date

**Methods**
- *Constructor (String objectId):* this function will get a objectId and will load the desired data into the memory.
- *removeCar ():* this function will remove the car from user’s account.

### Scan Class

**Attributes**
- objectId: String
- createdAt: Date
- updatedAt: Date
- ACL: ACL
- DTCs: Array
- PIDs: Dictionary

**Methods**
- *Constructor (String objectId):* this function will get a objectId and will load the desired data into the memory.

**Related Functions**
- *addScan (String DTCs, Dictionary PIDs):* this function will get the DTCs and other PIDs and will store them on the database.

### Code Class

**Attributes**
- objectId: String
- createdAt: Date
- updatedAt: Date
- ACL: ACL
- code: String
- description: String
- bestSolution: String

**Methods**

- *Constructor (String objectId):* this function will get a objectId and will load the desired data into the memory.
- *addSolution (String content):* this function will get the content and will add a new solution to the code.

 **Related Functions**
- *addCode (String code, String description):* this function will get the code and it’s description then will store it in the database.

### Solution Class

**Attributes**
- objectId: String
- createdAt: Date
- updatedAt: Date
- ACL: ACL
- content: String
- code: String
- karma: Integer
- upVotedBy: Array
- downVotedBy: Array

**Methods**
- *Constructor (String objectId):* this function will get a objectId and will load the desired data into the memory.
- *edit (String newContent):* this function will update the content of the solution.
- *remove ():* this function will remove the solution.

### FAQ Class

### Ticket Class

### TicketMessage

## User Roles
The users will have different roles and hence different access levels on the platform.

### Mechanic
- has access to their own mechanic shop.
- has access to all the consumer features.

### Consumer
- has full access to the app.

### Admin
- PitStop support member to moderate the entire system and provide support.

>>>>>>> Stashed changes
[1]:	http://parse.com
