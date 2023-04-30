#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {AwsKinesisVideoStreamsToRekognitionStack} from "../lib/aws-kinesis-video-streams-to-rekognition-stack";

const app = new cdk.App();
new AwsKinesisVideoStreamsToRekognitionStack(app, "AwsKinesisVideoStreamsToRekognitionStack", {});
