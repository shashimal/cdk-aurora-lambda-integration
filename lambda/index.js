const AWS = require('aws-sdk')
AWS.config.update({region: 'us-east-1'});
const sns = new AWS.SNS()

exports.handler = (event) => {
    console.log(event)

    const message = `Deleted user information: UserId: ${event['userId']}, First Name: ${event['firstName']}, Last Name: ${event['lastName']}`;

    const params = {
        Message: message,
        TopicArn: process.env.SNS_TOPIC_ARN
    }

    sns.publish(params, (err) => {
        if (err) console.log("Sending failed: ", err, err.stack);
        else console.log("Sending successful");
    });
}