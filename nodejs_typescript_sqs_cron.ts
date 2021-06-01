import 'source-map-support/register'
import { Consumer } from 'sqs-consumer';
import AWS, {AWSError} from 'aws-sdk';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();
import { Agenda } from 'agenda';
import {PromiseResult} from "aws-sdk/lib/request";
import {SendMessageResult, SendMessageRequest} from "aws-sdk/clients/sqs";


const mongoConnectionString = process.env.mongodb_url;

// @ts-ignore
const agenda = new Agenda({ db: { address: mongoConnectionString, collection: "agendaJobs" }, processEvery: "5 minutes"  });


AWS.config.update({
    region: 'eu-west-1',
    accessKeyId: process.env.aws_access_key_id,
    secretAccessKey: process.env.aws_secret_access_key,
    httpOptions: {
        agent: new https.Agent({
            keepAlive: true
        })
    }
});

const sqs = new AWS.SQS()

const consumer = Consumer.create({
    queueUrl: process.env.aws_sqs_jobs_queue_url,
    handleMessage: async (message) => {
        try {
            await processRequest(message)
        } catch (err) {
            throw new Error(err)
        }
    },
    sqs
});

consumer.on('error', (err) => {
    console.error(err.message);
});

consumer.on('processing_error', (err) => {
    console.error(err.message);
});

consumer.on('timeout_error', (err) => {
    console.error(err.message);
});

consumer.start();

async function graceful() {
    await agenda.stop();
    process.exit(0);
}

process.on("SIGTERM", graceful);
process.on("SIGINT", graceful);

const processRequest = async (message: any) => {
    try {
        const {jobsList} = JSON.parse(message.Body)
        for (let i of jobsList) {
            let jobName: string = i.userId + i.weekDay
            await agenda.cancel({name: jobName})
            // check if turning off and create job
            if (!i.turnOff) {
                agenda.define(jobName,async (job: any) => {
                    const now: number = +(new Date());
                    producer(i, now);
                })
                await agenda.every(`${i.time.split(':').reverse().join(' ')} * * ${i.weekDay}`, jobName, null, {timezone: i.timezone});
            }
        }
        await agenda.start()
    } catch (err) {
        console.error('Failed to setup jobs - error: ', err)
        throw new Error(err)
    }

}
// send sqs message to next service with data 
const producer = (body: any, now: number) => {
    let params: SendMessageRequest = {
        MessageBody: JSON.stringify(body),
        MessageGroupId: `${now}` , 
        QueueUrl: process.env.aws_sqs_next_queue_url || ''
    };

    let sendSqsMessage: Promise<any> = sqs.sendMessage(params).promise();

    sendSqsMessage.then((data: PromiseResult<SendMessageResult, any>) => {
        return data
    }).catch((err: PromiseResult<AWSError, any> ) => {
        console.error("Failed to create next job - Error: ", err.message)
        throw new Error(err.message)
    });
}
