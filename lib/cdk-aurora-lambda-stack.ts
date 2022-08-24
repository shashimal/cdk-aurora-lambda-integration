import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {
    AmazonLinuxGeneration,
    AmazonLinuxImage,
    Instance,
    InstanceClass,
    InstanceSize,
    InstanceType, ISecurityGroup, IVpc, Peer,
    Port,
    SecurityGroup,
    SubnetType,
    Vpc
} from "aws-cdk-lib/aws-ec2";
import {
    AuroraMysqlEngineVersion, DatabaseCluster,
    DatabaseClusterEngine, IParameterGroup,
    ParameterGroup
} from "aws-cdk-lib/aws-rds";
import {IRole, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {Code, Function, IFunction, Runtime} from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {ITopic, Topic} from "aws-cdk-lib/aws-sns";
import {EmailSubscription} from "aws-cdk-lib/aws-sns-subscriptions";


export class CdkAuroraLambdaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = this.createVPC();

        const ec2SecurityGroup = this.createEC2SecurityGroup(vpc);

        const ec2Instance = this.createEC2Instance(vpc, ec2SecurityGroup, 'ec2-key');

        const snsTopic = this.createSnsTopic();
        this.addEmailSubscription(snsTopic, "shashimald@gmail.com");

        const auroraLambdaFunction = this.createLambdaFunction(snsTopic);

        const auroraLambdaRole = this.createAuroraLambdaRole(auroraLambdaFunction);

        const parameterGroup = this.createParameterGroup(auroraLambdaRole);

        this.createAuroraDBCluster(vpc, parameterGroup, ec2Instance);
    }

    private createVPC = (): IVpc => {
        return new Vpc(this, 'VPC', {
            cidr: '10.0.0.0/16',
            maxAzs: 2,
            natGateways: 1
        });
    }

    private createEC2SecurityGroup = (vpc: IVpc): ISecurityGroup => {
        const ec2SecurityGroup = new SecurityGroup(this, 'EC2SecurityGroup', {
            vpc
        });

        ec2SecurityGroup.addIngressRule(
            Peer.anyIpv4(),
            Port.tcp(22),
            'SSH to EC2 Instance'
        );
        return ec2SecurityGroup;
    }

    private createEC2Instance = (vpc: IVpc, securityGroup: ISecurityGroup, keyName: string): Instance => {
        return new Instance(this, 'ec2-instance', {
            vpc,
            securityGroup,
            keyName,
            instanceType: InstanceType.of(
                InstanceClass.BURSTABLE2,
                InstanceSize.MICRO,
            ),
            machineImage: new AmazonLinuxImage({
                generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
            }),
            vpcSubnets: {
                subnetType: SubnetType.PUBLIC,
            },
        });
    }

    private createSnsTopic = (): ITopic => {
        return new Topic(this, 'EmailTopic', {
            displayName: "User Deletion"
        })
    }

    private addEmailSubscription = (snsTopic: ITopic, emailAddress: string) => {
        snsTopic.addSubscription(new EmailSubscription(emailAddress))
    }

    private createLambdaFunction = (snsTopic: ITopic): IFunction => {
        const auroraLambdaFunction = new Function(this, 'AuroraLambdaFunction', {
            code: Code.fromAsset(path.join(__dirname, '../lambda')),
            handler: "index.handler",
            runtime: Runtime.NODEJS_16_X,
            environment: {
                SNS_TOPIC_ARN: snsTopic.topicArn
            }
        });


        //Allow Lambda function to publish a message to SNS topic
        const snsPolicy = new PolicyStatement({
            actions: ['sns:Publish'],
            resources: [snsTopic.topicArn],
        });

        auroraLambdaFunction.role?.attachInlinePolicy(new Policy(this, 'LambdaSnsPermission', {
            statements: [snsPolicy]
        }));

        return auroraLambdaFunction;
    }

    private createAuroraLambdaRole = (auroraLambdaFunction: IFunction): IRole => {

        //Required minimum permission policy
        const auroraLambdaPermissionPolicy = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    resources: [auroraLambdaFunction.functionArn],
                    actions: ['lambda:InvokeFunction']
                })
            ]
        });

        //Creating the IAM role
        return new Role(this, 'AuroraRDSRole', {
            assumedBy: new ServicePrincipal('rds.amazonaws.com'),
            inlinePolicies: {
                AuroraLambdaPermission: auroraLambdaPermissionPolicy
            }
        });
    }

    private createParameterGroup = (auroraLambdaRole: IRole): IParameterGroup => {
        return new ParameterGroup(this, 'CustomParameterGroup', {
            engine: DatabaseClusterEngine.auroraMysql({version: AuroraMysqlEngineVersion.VER_2_10_2}),
            parameters: {
                aws_default_lambda_role: auroraLambdaRole.roleArn,
            }
        });
    }

    private createAuroraDBCluster = (vpc: IVpc, parameterGroup: IParameterGroup, ec2Instance: Instance) => {

        const auroraMySql = new DatabaseCluster(this, 'AuroraDBCluster', {
            engine: DatabaseClusterEngine.auroraMysql({
                version: AuroraMysqlEngineVersion.VER_2_10_2
            }),
            instanceProps: {
                instanceType: InstanceType.of(InstanceClass.BURSTABLE2, InstanceSize.SMALL),
                vpcSubnets: {
                    subnetType: SubnetType.PRIVATE_WITH_NAT
                },
                vpc,
            },
            instances: 1,
            parameterGroup,

        });

        auroraMySql.connections.allowFrom(ec2Instance, Port.tcp(3306));
    }

}
