// Import Admin SDK
var admin = require("firebase-admin");

// GPIO setup
var gpio = require('onoff').Gpio
var sensorIn = new gpio(6, 'in', 'both');

// Alarm sound setup
var player = require("play-sound")(opts = {});

// Set the sound properties
var soundFile = "sound.mp3";
var soundLoaded = false;
var sound = null;

// Set the beacon properties
var beaconFile = "beacon.mp3";
var beaconLoaded = false;
var beacon = null;
var beaconTimeout;
var beaconInterval;

// Fetch the service account key JSON file contents
var serviceAccount = require("./work-play-hard-firebase-adminsdk-mn3qv-961db4282a.json");

// Initialize the app with a service account, granting admin privileges
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://work-play-hard.firebaseio.com"
});

// As an admin, the app has access to read and write all data, regardless of Security Rules
var db = admin.database();

// Alarms array stores timeouts
let alarms = [];

// This property holds true if any alarm in the database has been activated
var anAlarmIsActive = false;

// Access Firebase to get the data
var ref = db.ref("Alarms");
ref.on("value", function(snapshot) {
  // Wrapper for the anAlarmIsActive property
  var isActive = false;
  
  // Cancel all previously scheduled timeouts
  for(var x = 0; x < alarms.length; x++){
    clearTimeout(alarms[x]);
  }
  // Remove all existing alarms
  alarms = [];

  console.log("\n\n\n\n\n========== NEW FIREBASE INSTANCE ==========");

  // Iterate through the database's alarm records
  for (key in snapshot.val()){
    // Get the complete record for the alarm
    var value = snapshot.val()[key];
    value.id = key;

    // Check to see if the alarm is on. Proceed if it is on.
    if (value.isOn) {
      // Let's take the time to update the 'anAlarmIsActive' property
      if (value.active){
        isActive = true;
      }

      // Mark the alarm in the console
      console.log("The following is related to the \"" + value.name + "\" alarm:");

      // Turn the alarm date string into a date object
      let alarmAsDate = new Date(Date.parse(value.time));
      alarmAsDate.setSeconds(0, 0);
      console.log(alarmAsDate);

      // Find each day that this alarm occurs on and convert it to an Number
      var repeatInstances = value.repeat;
      if (repeatInstances != null){
        repeatInstances = [...repeatInstances];
      }
      if (value.repeat != null){
        for (var x = 0; x < repeatInstances.length; x++){
          var day = 0;
          switch (repeatInstances[x]) {
            case "Sunday":
              day = 0;
              break;
            case "Monday":
              day = 1;
              break;
            case "Tuesday":
              day = 2;
              break;
            case "Wednesday":
              day = 3;
              break;
            case "Thursday":
              day = 4;
              break;
            case "Friday":
              day = 5;
              break;
            case "Saturday":
              day = 6;
          }
          repeatInstances[x] = day;
        }
        console.log(repeatInstances)
      }else{
        console.log("No repeat instances");
      }

      // Get the current date object
      var startDate = new Date();

      // Check to see if the alarm time has already occurred on the start date
      if (startDate.getHours() > alarmAsDate.getHours() || (startDate.getHours() >= alarmAsDate.getHours() && startDate.getMinutes() >= alarmAsDate.getMinutes())){
        // If the alarm has already occurred, make the alarm start tomorrow
        startDate.setDate(startDate.getDate() + 1);
      }

      // Check if the alarm repeats
      if (repeatInstances == null){
        // If the alarm does not repeat
        // Set the start date to the alarm time
        startDate.setHours(alarmAsDate.getHours(), alarmAsDate.getMinutes(), 0, 0);
        console.log(startDate);

        // Get the timeout
        var out = getTimeout(startDate.getTime(), value);

        // Add the timeout to the alarms array
        alarms.push(out);

      }else{
        // If the alarm does repeat
        // Find the index of the start date in the repeat repeatInstances
        function getStartIndex(targetValue) {
          var index = -1;
          for (var x = 0; x < repeatInstances.length; x++){
            if (repeatInstances[x] == targetValue){
              index = x;
            }
          }
          if (index != -1){
            return index;
          }else if (targetValue == 6){
            return getStartIndex(0)
          }else{
            return getStartIndex(targetValue + 1);
          }
        }
        let startIndex = getStartIndex(startDate.getDay());

        // Adjust the startDate if necessary
        var dateIsOnTarget = false;
        while (!dateIsOnTarget){
          if(startDate.getDay() != repeatInstances[startIndex]){
            startDate.setDate(startDate.getDate() + 1);
          }else{
            dateIsOnTarget = true;
          }
        }

        // Rotate the repeatInstances array to put the startIndex in order to make the array easier to use
        var repeatInstancesRotated = false;
        while (!repeatInstancesRotated) {
          if (startIndex == 0){
            repeatInstancesRotated = true;
            break;
          }

          if (startIndex == repeatInstances.length - 1){
            startIndex = 0;
          }else{
            startIndex ++;
          }

          var lastElement = repeatInstances.pop();
          repeatInstances.unshift(lastElement);
        }

        // Go through each repeat instance, and get the date where the alarm should occur
        for (var x = 0; x < repeatInstances.length; x++){
          var weekdaysMatch = false
          while (!weekdaysMatch){
            if (startDate.getDay() == repeatInstances[x]){
              weekdaysMatch = true;
            }else{
              startDate.setDate(startDate.getDate() + 1);
            }
          }

          startDate.setHours(alarmAsDate.getHours(), alarmAsDate.getMinutes(), 0, 0);
          repeatInstances[x] = new Date(startDate);
        }

        // Go through each alarm time and create a timeout
        for (var x = 0; x < repeatInstances.length; x++){

          // Get the timeout
          var out = getTimeout(repeatInstances[x], value);

          // Add the timeout to the alarms array
          alarms.push(out);
        }

        console.log(repeatInstances);
      }

      console.log();
    }
  }
  
  anAlarmIsActive = isActive;
  console.log("\n********** ALARMS ARE NOW LIVE, THE FOLLOWING IS THE RETURN FROM SET ALARMS AND PRESSURE MAT OPERATIONS **********\n");
});

function getTimeout(milliseconds, alarm) {
  // Get the current date object (again)
  var now = new Date();

  // Get the number of milliseconds between now and the alarm date
  var timeBetween = milliseconds - now.getTime();

  // Here is the timeout we will call
  var out = setTimeout(function () {
    console.log("Alarm:", alarm.id, "has been triggered");
    var alarmRef = ref.child(alarm.id);
    delete(alarm.id);
    alarm.active = true;
    alarmRef.update(alarm);
    
    soundLoaded = false;
    setAlarmSoundState(pressureApplied);
  }, timeBetween);

  // return the created timeout
  return out;
}
  
var pressureApplied = false;

// Watch for a change in the sensor value
sensorIn.watch( ( err, value ) => {
  if( err ) {
    console.log('Error', err );
  }
    
  if (value == 1){
    pressureApplied = false;
    console.log("Pressure Removed");
    
    setAlarmSoundState(false);
      
  }else if (value == 0){
    pressureApplied = true;
    console.log("Pressure Applied");
    
    setAlarmSoundState(anAlarmIsActive);
  }
});


function setAlarmSoundState(isOn){
  if(isOn){
    if(!soundLoaded){
      soundLoaded = true;
      sound = player.play(soundFile, function(err){
        if (err) throw err;
      });
      beaconLoaded = false;
      beaconTimeout = setTimeout(function() {
        beaconLoaded = true;
        beaconInterval = setInterval(function() {
          beacon = player.play(beaconFile, function(err){
            if (err) throw err;
          });
        }, 4000);
      }, 117000);
    }
  }else{
    if(soundLoaded){
      soundLoaded  = false;
      sound.kill();
      
      clearTimeout(beaconTimeout);
      if(beaconLoaded){
        clearInterval(beaconInterval);
        beacon.kill();
      }
    }
  }
}

function cleanup(){
  sensorIn.unexport();
  process.exit();
}

process.on('SIGINT', cleanup);
