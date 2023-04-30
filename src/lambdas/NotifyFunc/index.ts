import {Context, Handler} from "aws-lambda";
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {PublishCommand, SNSClient} from "@aws-sdk/client-sns";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({});
const snsClient = new SNSClient({});

export const lambda_handler: Handler = async (event, context: Context) => {
    const msg = JSON.parse(event.Records[0]["Sns"]["Message"]);
    const eventType = msg["eventNamespace"]["type"];
    process.stdout.write(`Received: ${eventType}\n${JSON.stringify(msg)}\n`);
    if (msg["eventNamespace"]["type"] != "LABEL_DETECTED") {
        return;
    }

    let snsMessage = "";
    for (const label of msg["labels"]) {
        const timestamp = new Date(label["videoMapping"]["kinesisVideoMapping"]["producerTimestamp"]);
        snsMessage += `Time: ${timestamp.toISOString()}\nLabel: ${label["name"]}\nConfidence: ${label["confidence"]} %\n`;

        // Get image URL
        const s3UrlParts = label["frameImageUri"].split("//")[1].split("/");
        const s3Bucket = s3UrlParts[0];
        const s3Key = s3UrlParts.slice(1).join("/");
        const imageUrl = await getSignedUrl(s3Client, new GetObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key,
        }), {expiresIn: 3600 * 24 * 7});
        snsMessage += `${imageUrl}\n\n`;
    }

    await snsClient.send(new PublishCommand({
        TopicArn: process.env.NOTIFICATION_TOPIC_ARN,
        Message: snsMessage,
        Subject: "Detected",
    }));
}
