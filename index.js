const AWS = require('aws-sdk');
const Papa = require('papaparse')
const UssdMenu = require('ussd-menu-builder');
const menu = new UssdMenu();
const fs = require('fs');
const os = require('os');
const path = require('path');

AWS.config.update({ region: 'us-east-1' });
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = 'UssdSessions';
const provinces = [
            "Humphrey", "Kzn", "Eastern Cape",
            "Northern Cape", "Western Cape", "Gauteng",
            "Free state", "North west", "Mpumalanga"
        ];
        
var service;
var communication;
var turnaroundTime;
var comment;
var province;
var mySessionId;
var myPhoneNumber;


const s3 = new AWS.S3();
const filePath = path.join(os.tmpdir(), 'temp.csv');


exports.handler = async (event, context, callback) => {
    const { sessionId, phoneNumber, serviceCode, text } = event;
    const args = { phoneNumber, sessionId, serviceCode, text };
    myPhoneNumber = phoneNumber;
    mySessionId = sessionId;

    // Fetch or initialize session data from DynamoDB
    let sessionData;
    try {
        sessionData = await getSession(sessionId);
    }
    catch (error) {
        console.error('Error fetching session data:', error);
        callback(null, { statusCode: 500, body: 'Failed to fetch session data' });
        return;
    }

    // Define menu states
    menu.startState({
        run: () => {
            if (sessionData) {
               // Resume the session from where it left off
                //menu.con(`Welcome back! You left off at: ${sessionData.state}` +
                //   '\n--------------' +
                //    '\n1. Continue back to NPS Survey' +
                //  '\n0. Exit');
                province = sessionData.province;
                service = sessionData.service;
                communication = sessionData.communication;
                turnaroundTime = sessionData.turnaroundTime;
                comment = sessionData.comment;
                menu.go(sessionData.state);
                
                  
            }
            else {
                // New session
                menu.con('you are not Welcome to the GEPF NPS survey, where your voice matters. Please help us serve you better.' +
                    '\n--------------' +
                    '\n1. Continue to NPS Survey' +
                    '\n0. Exit');
            }
        },
        next: {
            '1': 'Continue to NPS Survey',
            '0': 'Exit'
        }
    });
    
menu.state('Continue to NPS Survey', {
    run: async () => {
        
        menu.con('Which Province do you reside in' +
            '\n1. ' + provinces[0] +
            '\n2. ' + provinces[1] +
            '\n3. ' + provinces[2] +
            '\n4. ' + provinces[3] +
            '\n5. ' + provinces[4] +
            '\n6. ' + provinces[5] +
            '\n7. ' + provinces[6] +
            '\n8. ' + provinces[7] +
            '\n9. ' + provinces[8]
        );
        await saveSession(sessionId, { state: 'Question 1', dataMethod: 'USSD', phoneNumber:phoneNumber });
    },
    next: {
        '1': 'Question 1',
        '2': 'Question 1',
        '3': 'Question 1',
        '4': 'Question 1',
        '5': 'Question 1',
        '6': 'Question 1',
        '7': 'Question 1',
        '8': 'Question 1',
        '9': 'Question 1'
    }
});

menu.state('Question 1', {
    run: async () => {
        menu.con('On a scale of 1 to 10, how satisfied are you with the service provided by the staff?');
        province = provinces[parseInt(menu.val,10) - 1];
        await saveSession(sessionId, { state: 'Question 2', province: provinces[menu.val - 1] });
    },
    next: {
        '1': 'Question 2',
        '2': 'Question 2',
        '3': 'Question 2',
        '4': 'Question 2',
        '5': 'Question 2',
        '6': 'Question 2',
        '7': 'Question 2',
        '8': 'Question 2',
        '9': 'Question 2',
        '10': 'Question 2'
    }
});

menu.state('Question 2', {
    run: async () => {
        menu.con('On a scale of 1 to 10, how satisfied are you with the level of communication?');
        service = menu.val;
        await saveSession(sessionId, { state: 'Question 3', service: menu.val });
    },
    next: {
        '1': 'Question 3',
        '2': 'Question 3',
        '3': 'Question 3',
        '4': 'Question 3',
        '5': 'Question 3',
        '6': 'Question 3',
        '7': 'Question 3',
        '8': 'Question 3',
        '9': 'Question 3',
        '10': 'Question 3'
    }
});

menu.state('Question 3', {
    run: async () => {
        menu.con('On a scale of 1 to 10, could you rate the turnaround time from when you requested assistance to when you were serviced?');
        communication = menu.val;
        await saveSession(sessionId, { state: 'Question 4', communication: menu.val });
    },
    next: {
        '1': 'Question 4',
        '2': 'Question 4',
        '3': 'Question 4',
        '4': 'Question 4',
        '5': 'Question 4',
        '6': 'Question 4',
        '7': 'Question 4',
        '8': 'Question 4',
        '9': 'Question 4',
        '10': 'Question 4'
    }
});

menu.state('Question 4', {
    run: async () => {
        menu.con('Please describe your experience with GPAA regarding your GEPF query?' + ' \n' + '1. Exit');
        turnaroundTime = menu.val;
        await saveSession(sessionId, { state: 'Comment', turnaroundTime: menu.val });
    },
    next: {
        '*': 'Comment',
        '1': 'Exit'
    }
});

menu.state('Comment', {
    run: async () => {
        comment = String(menu.val);
        menu.end('Thank you for participating. Your feedback is appreciated. Goodbye.');
        await saveSession(sessionId, { state: 'comment-completed', comment: comment });
        submitCSV();
    }
});

menu.state('Exit', {
    run: async () => {
        comment = "No Comment";
        menu.end('Thank you for participating. Your feedback is appreciated. Goodbye.');
        await saveSession(sessionId, { state: 'completed', comment: comment });
        submitCSV();
    }
});

menu.on('error', (err) => {
    // handle errors
    console.log('Error', err);
});

menu.run(args, resMsg => {
    console.log(resMsg);
    console.log(`Timestamp: ${new Date()}`);
    callback(null, resMsg);
});
};

// Helper functions to interact with DynamoDB
async function getSession(sessionId) {
    const params = {
        TableName: tableName,
        Key: { sessionId }
    };
    const result = await dynamoDb.get(params).promise();
    return result.Item;
}

async function saveSession(sessionId, data) {
    let updateExpression = 'set';
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    for (const [key, value] of Object.entries(data)) {
        const attributeName = `#${key}`;
        const attributeValue = `:${key}`;

        updateExpression += ` ${attributeName} = ${attributeValue},`;
        expressionAttributeNames[attributeName] = key;
        expressionAttributeValues[attributeValue] = value;
    }

    // Remove the trailing comma from the update expression
    updateExpression = updateExpression.slice(0, -1);

    const params = {
        TableName: tableName,
        Key: { sessionId: sessionId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'UPDATED_NEW'
    };

    await dynamoDb.update(params).promise();
}

//Function to Parse data to CSV using Papaparse
const exportDataToCSV = (data) =>{
    const csv = Papa.unparse(data);
    return csv;
};


//Function to upload file to s3
const uploadFileIntoS3 = async () => {
    var fileName = "ussdForm"+mySessionId+".csv";
    const params = {
        
        Bucket: "my-ussd-data-bucket",
        Key: `${fileName}`,
        Body: fs.createReadStream(filePath)
    };
    
    try {
        // Upload file to S3
        
        const data = await s3.upload(params).promise();
        console.log(`File uploaded successfully : ${data.Location}`);
    } catch(error){
        console.log(error);
    }
};

//Convert the data to CSV and submit it to S3
const submitCSV = async () => {
    //Store form data as a JSON variable
    const mydata = [
      { Timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Johannesburg'})  ,  "Data collection method:":"USSD", cellNumber:myPhoneNumber, "Please select the province where you currently reside:" :province /* province:province */ , "On a scale of 1 to 10, how satisfied are you with the service provided by the staff?" :service, "On a scale of 1 to 10, how satisfied are you with the level of communication?" :communication, "On a scale of 1 to 10, could you rate the turnaround time from when you requested assistance to when you were serviced?" :turnaroundTime, "(Optional)Could you describe your experience with our recent interaction or visit to GPAA regarding your GEPF query?" :comment}
    ];

    //Pass JSON file to Papaparse
    var myCsvData= exportDataToCSV(mydata);
    
    //Convert blob to File
    fs.writeFileSync(filePath, myCsvData, function (err) {
      if (err) {
          context.fail("writeFile failed: " + err);
      } else {
        context.succeed("writeFile succeeded");
      }
    });
    await uploadFileIntoS3();
   
  };