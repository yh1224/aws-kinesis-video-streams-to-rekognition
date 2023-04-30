import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kinesisvideo from "aws-cdk-lib/aws-kinesisvideo";
import * as rekognition from "aws-cdk-lib/aws-rekognition";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import {Construct} from "constructs";
import * as path from "path";

export class AwsKinesisVideoStreamsToRekognitionStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const dataBucket = new s3.Bucket(this, "DataBucket", {
            autoDeleteObjects: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const rekognitionNotificationTopic = new sns.Topic(this, "RekognitionNotificationTopic", {});

        const videoStream = new kinesisvideo.CfnStream(this, "VideoStream", {
            dataRetentionInHours: 24,
            name: "stream-test",
        });

        const streamProcessorRole = new iam.Role(this, "Role", {
            assumedBy: new iam.ServicePrincipal('rekognition.amazonaws.com'),
        });
        streamProcessorRole.attachInlinePolicy(new iam.Policy(this, "Policy", {
            statements: [
                new iam.PolicyStatement({
                    actions: ["kinesisvideo:GetDataEndpoint", "kinesisvideo:GetMedia"],
                    effect: iam.Effect.ALLOW,
                    resources: [videoStream.attrArn],
                }),
                new iam.PolicyStatement({
                    actions: ["s3:PutObject"],
                    effect: iam.Effect.ALLOW,
                    resources: [dataBucket.bucketArn + "/*"],
                }),
                new iam.PolicyStatement({
                    actions: ["sns:Publish"],
                    effect: iam.Effect.ALLOW,
                    resources: [rekognitionNotificationTopic.topicArn],
                }),
            ],
        }));

        const userNotificationTopic = new sns.Topic(this, "UserNotificationTopic", {});

        const streamProcessor = new rekognition.CfnStreamProcessor(this, "StreamProcessor", {
            connectedHomeSettings: {
                labels: ["PERSON"],
            },
            dataSharingPreference: {
                optIn: true,
            },
            kinesisVideoStream: {
                arn: videoStream.attrArn,
            },
            notificationChannel: {
                arn: rekognitionNotificationTopic.topicArn,
            },
            roleArn: streamProcessorRole.roleArn,
            s3Destination: {
                bucketName: dataBucket.bucketName,
            },
        });

        const notifyFunc = new lambda_nodejs.NodejsFunction(this, "NotifyFunction", {
            architecture: lambda.Architecture.ARM_64,
            entry: path.resolve(__dirname, "../src/lambdas/NotifyFunc/index.ts"),
            environment: {
                NOTIFICATION_TOPIC_ARN: userNotificationTopic.topicArn,
            },
            events: [
                new cdk.aws_lambda_event_sources.SnsEventSource(rekognitionNotificationTopic),
            ],
            handler: "lambda_handler",
            logRetention: logs.RetentionDays.ONE_WEEK,
            runtime: lambda.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.seconds(30),
        });
        dataBucket.grantRead(notifyFunc);
        userNotificationTopic.grantPublish(notifyFunc);
    }
}
